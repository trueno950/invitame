import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  NewTemplate,
  NewTemplateVersion,
  TemplateChanges,
  TemplateRepository,
} from "../application/templates/template.repository";
import {
  CatalogCategoryNotFoundError,
  CatalogConcurrentUpdateError,
  CatalogKeyTakenError,
  CatalogRendererContractInvalidError,
  CatalogTemplateNotPublishableError,
} from "../domain/catalog-errors";
import type { CatalogTemplate, TemplateVersionRecord } from "../domain/template";
import {
  assertTemplateVersionTransition,
  nextTemplateVersionNumber,
} from "../domain/template-version-lifecycle";

const TEMPLATE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, key: true, name: true } },
  // The partial unique index leaves at most one PUBLISHED row per template.
  versions: { where: { status: "PUBLISHED" }, select: { id: true, version: true }, take: 1 },
  _count: { select: { versions: true } },
} satisfies Prisma.TemplateSelect;

const VERSION_SELECT = {
  id: true,
  version: true,
  status: true,
  componentKey: true,
  schema: true,
  configuration: true,
  createdAt: true,
} satisfies Prisma.TemplateVersionSelect;

type TemplateRow = Prisma.TemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>;
type VersionRow = Prisma.TemplateVersionGetPayload<{ select: typeof VERSION_SELECT }>;

function toTemplate(row: TemplateRow): CatalogTemplate {
  const { versions, _count, ...fields } = row;
  return { ...fields, publishedVersion: versions[0] ?? null, versionCount: _count.versions };
}

function toVersion(row: VersionRow): TemplateVersionRecord {
  return { ...row };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

type Transaction = Prisma.TransactionClient;

/**
 * Locks the template row until the transaction ends and answers its status, or null when it does not
 * exist. Setting a template PUBLISHED and retiring a version both read "does this template have a
 * PUBLISHED version" and write the other half of that rule, so they take this lock first: a concurrent
 * pair serializes instead of leaving a PUBLISHED template without a PUBLISHED version (L4). The lock
 * does not conflict with the key-share locks that inserting a version takes.
 */
async function lockTemplate(tx: Transaction, id: string): Promise<string | null> {
  const rows = await tx.$queryRaw<Array<{ status: string }>>(
    Prisma.sql`SELECT "status"::text AS "status" FROM "Template" WHERE "id" = ${id}::uuid FOR NO KEY UPDATE`,
  );
  return rows[0]?.status ?? null;
}

/**
 * The template port on PostgreSQL. Every operation that touches more than one row runs in one
 * interactive transaction. The database is the last guard of the publication rule: the partial unique
 * index "TemplateVersion_templateId_published_key" refuses a second PUBLISHED version (P2002, reported as
 * `CatalogConcurrentUpdateError`: the loser of a concurrent publish), the unique `(templateId, version)`
 * refuses a number taken by a concurrent create (the same error), and the status trigger refuses any
 * illegal change. Snapshot columns are only ever written by `createVersion`.
 */
export class PrismaTemplateRepository implements TemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<CatalogTemplate[]> {
    const rows = await this.prisma.template.findMany({
      select: TEMPLATE_SELECT,
      orderBy: { key: "asc" },
    });
    return rows.map(toTemplate);
  }

  async create(input: NewTemplate): Promise<CatalogTemplate> {
    try {
      return toTemplate(
        await this.prisma.template.create({ select: TEMPLATE_SELECT, data: input }),
      );
    } catch (error) {
      // P2002: the unique index on `key`. P2003: the foreign key to `Category`.
      if (isPrismaError(error, "P2002")) {
        throw new CatalogKeyTakenError(input.key);
      }
      if (isPrismaError(error, "P2003")) {
        throw new CatalogCategoryNotFoundError();
      }
      throw error;
    }
  }

  async update(id: string, changes: TemplateChanges): Promise<CatalogTemplate | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (changes.status === "PUBLISHED") {
          if ((await lockTemplate(tx, id)) === null) {
            return null;
          }
          const published = await tx.templateVersion.count({
            where: { templateId: id, status: "PUBLISHED" },
          });
          if (published === 0) {
            throw new CatalogTemplateNotPublishableError();
          }
        }

        return toTemplate(
          await tx.template.update({ select: TEMPLATE_SELECT, where: { id }, data: changes }),
        );
      });
    } catch (error) {
      // P2025: no row has this id. P2003: the new category does not exist.
      if (isPrismaError(error, "P2025")) {
        return null;
      }
      if (isPrismaError(error, "P2003")) {
        throw new CatalogCategoryNotFoundError();
      }
      throw error;
    }
  }

  async listVersions(templateId: string): Promise<TemplateVersionRecord[] | null> {
    const stored = await this.prisma.template.findUnique({
      where: { id: templateId },
      select: { versions: { orderBy: { version: "desc" }, select: VERSION_SELECT } },
    });
    return stored ? stored.versions.map(toVersion) : null;
  }

  async createVersion(
    templateId: string,
    input: NewTemplateVersion,
  ): Promise<TemplateVersionRecord | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.template.findUnique({
          where: { id: templateId },
          select: { versions: { select: { version: true } } },
        });
        if (!template) {
          return null;
        }

        return toVersion(
          await tx.templateVersion.create({
            select: VERSION_SELECT,
            data: {
              templateId,
              version: nextTemplateVersionNumber(template.versions.map((row) => row.version)),
              status: "DRAFT",
              componentKey: input.componentKey,
              schema: input.schema as Prisma.InputJsonValue,
              configuration: input.configuration as Prisma.InputJsonValue,
            },
          }),
        );
      });
    } catch (error) {
      // P2002: a concurrent create took the same `(templateId, version)`.
      if (isPrismaError(error, "P2002")) {
        throw new CatalogConcurrentUpdateError();
      }
      throw error;
    }
  }

  async publishVersion(
    templateId: string,
    versionId: string,
    verify: (version: TemplateVersionRecord) => readonly string[] | Promise<readonly string[]>,
  ): Promise<TemplateVersionRecord | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const stored = await tx.templateVersion.findFirst({
          where: { id: versionId, templateId },
          select: VERSION_SELECT,
        });
        if (!stored) {
          return null;
        }
        const version = toVersion(stored);

        assertTemplateVersionTransition(version.status, "PUBLISHED");
        const issues = await verify(version);
        if (issues.length > 0) {
          throw new CatalogRendererContractInvalidError(issues);
        }

        await tx.templateVersion.updateMany({
          where: { templateId, status: "PUBLISHED" },
          data: { status: "RETIRED" },
        });
        const published = await tx.templateVersion.updateMany({
          where: { id: versionId, status: "DRAFT" },
          data: { status: "PUBLISHED" },
        });
        if (published.count !== 1) {
          // A concurrent request moved this version first.
          throw new CatalogConcurrentUpdateError();
        }

        return toVersion(
          await tx.templateVersion.findUniqueOrThrow({
            where: { id: versionId },
            select: VERSION_SELECT,
          }),
        );
      });
    } catch (error) {
      // P2002: the partial unique index; a concurrent publish committed its PUBLISHED version first.
      if (isPrismaError(error, "P2002")) {
        throw new CatalogConcurrentUpdateError();
      }
      throw error;
    }
  }

  async retireVersion(
    templateId: string,
    versionId: string,
  ): Promise<TemplateVersionRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const templateStatus = await lockTemplate(tx, templateId);
      if (templateStatus === null) {
        return null;
      }
      const stored = await tx.templateVersion.findFirst({
        where: { id: versionId, templateId },
        select: VERSION_SELECT,
      });
      if (!stored) {
        return null;
      }

      assertTemplateVersionTransition(stored.status, "RETIRED");
      if (templateStatus === "PUBLISHED") {
        throw new CatalogTemplateNotPublishableError();
      }

      const retired = await tx.templateVersion.updateMany({
        where: { id: versionId, status: "PUBLISHED" },
        data: { status: "RETIRED" },
      });
      if (retired.count !== 1) {
        throw new CatalogConcurrentUpdateError();
      }

      return toVersion(
        await tx.templateVersion.findUniqueOrThrow({
          where: { id: versionId },
          select: VERSION_SELECT,
        }),
      );
    });
  }
}
