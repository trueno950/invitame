import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Prisma, PrismaClient, type TemplateVersionStatus } from "@prisma/client";
import { requireLocalDatabaseUrl } from "../../../test/database";

// The publication rules of `TemplateVersion` (M3 T3; S5, S8, L4) on real PostgreSQL: one `PUBLISHED`
// version per template, and only the status changes DRAFT -> PUBLISHED and PUBLISHED -> RETIRED.
// Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL.

const ILLEGAL_TRANSITION = /TemplateVersion status change not allowed/;

describe("template version publication rules (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const runId = randomUUID();
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newTemplate(): Promise<string> {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `t3-category-${sequence}-${runId}`, name: "Category" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: { categoryId: category.id, key: `t3-template-${sequence}-${runId}`, name: "Template" },
    });
    templateIds.push(template.id);
    return template.id;
  }

  function newVersion(templateId: string, version: number, status: TemplateVersionStatus) {
    return prisma.templateVersion.create({
      data: {
        templateId,
        version,
        status,
        componentKey: "snapshot-component",
        schema: { fields: [] },
        configuration: {},
      },
    });
  }

  describe("one PUBLISHED version per template", () => {
    it("refuses a second PUBLISHED version of the same template, created or published", async () => {
      const templateId = await newTemplate();
      await newVersion(templateId, 1, "PUBLISHED");
      const draft = await newVersion(templateId, 2, "DRAFT");

      await assert.rejects(
        newVersion(templateId, 3, "PUBLISHED"),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
      );
      await assert.rejects(
        prisma.templateVersion.update({ where: { id: draft.id }, data: { status: "PUBLISHED" } }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
      );

      const rows = await prisma.templateVersion.findMany({
        where: { templateId },
        orderBy: { version: "asc" },
      });
      assert.deepEqual(
        rows.map((row) => [row.version, row.status]),
        [
          [1, "PUBLISHED"],
          [2, "DRAFT"],
        ],
      );
    });

    it("allows publishing after the previous version is retired", async () => {
      const templateId = await newTemplate();
      const first = await newVersion(templateId, 1, "PUBLISHED");
      const second = await newVersion(templateId, 2, "DRAFT");

      await prisma.templateVersion.update({ where: { id: first.id }, data: { status: "RETIRED" } });
      await prisma.templateVersion.update({
        where: { id: second.id },
        data: { status: "PUBLISHED" },
      });

      const rows = await prisma.templateVersion.findMany({
        where: { templateId },
        orderBy: { version: "asc" },
      });
      assert.deepEqual(
        rows.map((row) => [row.version, row.status]),
        [
          [1, "RETIRED"],
          [2, "PUBLISHED"],
        ],
      );
    });

    it("retires and publishes in one transaction", async () => {
      const templateId = await newTemplate();
      const first = await newVersion(templateId, 1, "PUBLISHED");
      const second = await newVersion(templateId, 2, "DRAFT");

      await prisma.$transaction([
        prisma.templateVersion.update({ where: { id: first.id }, data: { status: "RETIRED" } }),
        prisma.templateVersion.update({ where: { id: second.id }, data: { status: "PUBLISHED" } }),
      ]);

      const published = await prisma.templateVersion.findMany({
        where: { templateId, status: "PUBLISHED" },
      });
      assert.deepEqual(
        published.map((row) => row.id),
        [second.id],
      );
    });

    it("keeps one PUBLISHED version per template independently, and any number of drafts or retired", async () => {
      const first = await newTemplate();
      const second = await newTemplate();

      await newVersion(first, 1, "PUBLISHED");
      await newVersion(second, 1, "PUBLISHED");
      await newVersion(first, 2, "DRAFT");
      await newVersion(first, 3, "DRAFT");
      await newVersion(first, 4, "RETIRED");
      await newVersion(first, 5, "RETIRED");

      assert.equal(await prisma.templateVersion.count({ where: { templateId: first } }), 5);
      assert.equal(
        await prisma.templateVersion.count({ where: { templateId: second, status: "PUBLISHED" } }),
        1,
      );
    });
  });

  describe("status transitions", () => {
    const LEGAL: ReadonlyArray<readonly [TemplateVersionStatus, TemplateVersionStatus]> = [
      ["DRAFT", "PUBLISHED"],
      ["PUBLISHED", "RETIRED"],
    ];
    const ILLEGAL: ReadonlyArray<readonly [TemplateVersionStatus, TemplateVersionStatus]> = [
      ["DRAFT", "RETIRED"],
      ["PUBLISHED", "DRAFT"],
      ["RETIRED", "PUBLISHED"],
      ["RETIRED", "DRAFT"],
    ];

    for (const [from, to] of LEGAL) {
      it(`allows ${from} -> ${to}`, async () => {
        const row = await newVersion(await newTemplate(), 1, from);

        const updated = await prisma.templateVersion.update({
          where: { id: row.id },
          data: { status: to },
        });

        assert.equal(updated.status, to);
      });
    }

    for (const [from, to] of ILLEGAL) {
      it(`refuses ${from} -> ${to} and leaves the row unchanged`, async () => {
        const row = await newVersion(await newTemplate(), 1, from);

        await assert.rejects(
          prisma.templateVersion.update({ where: { id: row.id }, data: { status: to } }),
          ILLEGAL_TRANSITION,
        );

        assert.deepEqual(
          await prisma.templateVersion.findUniqueOrThrow({ where: { id: row.id } }),
          row,
        );
      });
    }

    for (const status of ["DRAFT", "PUBLISHED", "RETIRED"] as const) {
      it(`allows an update that leaves ${status} unchanged`, async () => {
        const row = await newVersion(await newTemplate(), 1, status);

        const updated = await prisma.templateVersion.update({
          where: { id: row.id },
          data: { status },
        });

        assert.deepEqual(updated, row);
      });
    }
  });
});
