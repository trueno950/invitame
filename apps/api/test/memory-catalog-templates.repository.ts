import { randomUUID } from "node:crypto";

import type {
  NewTemplate,
  NewTemplateVersion,
  TemplateChanges,
  TemplateRepository,
} from "../src/catalog/application/templates/template.repository";
import {
  CatalogCategoryNotFoundError,
  CatalogKeyTakenError,
  CatalogRendererContractInvalidError,
  CatalogTemplateNotPublishableError,
} from "../src/catalog/domain/catalog-errors";
import type { CatalogTemplate, TemplateVersionRecord } from "../src/catalog/domain/template";
import {
  assertTemplateVersionTransition,
  nextTemplateVersionNumber,
} from "../src/catalog/domain/template-version-lifecycle";

interface StoredTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  categoryId: string;
  status: CatalogTemplate["status"];
  createdAt: Date;
  updatedAt: Date;
}

interface StoredCategory {
  id: string;
  key: string;
  name: string;
}

interface StoredVersion extends TemplateVersionRecord {
  templateId: string;
}

/** A schema and configuration the `birthday-adventure-01` renderer accepts (a copy of the seeded pair). */
export function birthdayAdventureVersionInput(): NewTemplateVersion {
  const text = (title: string, maxLength: number) => ({
    type: "string",
    title,
    minLength: 1,
    maxLength,
  });
  return {
    componentKey: "birthday-adventure-01",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: [
        "celebrantName",
        "age",
        "date",
        "time",
        "location",
        "address",
        "mainPhoto",
        "message",
      ],
      properties: {
        celebrantName: text("Nombre de la persona festejada", 80),
        age: { type: "integer", title: "Edad", minimum: 1, maximum: 120 },
        date: { type: "string", title: "Fecha", format: "date" },
        time: { type: "string", title: "Hora", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        location: text("Lugar", 120),
        address: text("Dirección", 200),
        mainPhoto: { type: "string", title: "Foto principal", format: "uri" },
        message: text("Mensaje", 500),
      },
    },
    configuration: {
      componentKey: "birthday-adventure-01",
      layout: "adventure",
      palette: "sunset",
      typography: "rounded",
      sectionOrder: ["hero", "details", "message"],
    },
  };
}

/**
 * The template port on in-memory lists, shared by the suites that run without a database. `templates`
 * and `versions` are public so a test can compare the stored rows before and after a refused request;
 * `addCategory` registers a category a template may belong to and `seedVersion` inserts a version in a
 * given status, as a migration or the seed would.
 */
export class MemoryCatalogTemplateRepository implements TemplateRepository {
  readonly templates: StoredTemplate[] = [];
  readonly categories: StoredCategory[] = [];
  readonly versions: StoredVersion[] = [];

  addCategory(key: string): StoredCategory {
    const category = { id: randomUUID(), key, name: `Categoría ${key}` };
    this.categories.push(category);
    return category;
  }

  seedVersion(
    templateId: string,
    input: NewTemplateVersion & { status: TemplateVersionRecord["status"] },
  ): TemplateVersionRecord {
    const version: StoredVersion = {
      id: randomUUID(),
      templateId,
      version: nextTemplateVersionNumber(
        this.versions.filter((row) => row.templateId === templateId).map((row) => row.version),
      ),
      createdAt: new Date(),
      ...input,
    };
    this.versions.push(version);
    return this.versionView(version);
  }

  async list(): Promise<CatalogTemplate[]> {
    return [...this.templates]
      .sort((first, second) => (first.key < second.key ? -1 : first.key > second.key ? 1 : 0))
      .map((stored) => this.view(stored));
  }

  async create(input: NewTemplate): Promise<CatalogTemplate> {
    if (this.templates.some((stored) => stored.key === input.key)) {
      throw new CatalogKeyTakenError(input.key);
    }
    this.requireCategory(input.categoryId);

    const now = new Date();
    const created: StoredTemplate = {
      id: randomUUID(),
      ...input,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    };
    this.templates.push(created);
    return this.view(created);
  }

  async update(id: string, changes: TemplateChanges): Promise<CatalogTemplate | null> {
    const stored = this.templates.find((item) => item.id === id);
    if (!stored) {
      return null;
    }
    if (changes.categoryId !== undefined) {
      this.requireCategory(changes.categoryId);
    }
    if (changes.status === "PUBLISHED" && !this.publishedVersion(id)) {
      throw new CatalogTemplateNotPublishableError();
    }

    Object.assign(stored, changes, { updatedAt: new Date() });
    return this.view(stored);
  }

  async listVersions(templateId: string): Promise<TemplateVersionRecord[] | null> {
    if (!this.templates.some((item) => item.id === templateId)) {
      return null;
    }
    return this.versions
      .filter((row) => row.templateId === templateId)
      .sort((first, second) => second.version - first.version)
      .map((row) => this.versionView(row));
  }

  async createVersion(
    templateId: string,
    input: NewTemplateVersion,
  ): Promise<TemplateVersionRecord | null> {
    if (!this.templates.some((item) => item.id === templateId)) {
      return null;
    }
    return this.seedVersion(templateId, { ...input, status: "DRAFT" });
  }

  async publishVersion(
    templateId: string,
    versionId: string,
    verify: (version: TemplateVersionRecord) => readonly string[] | Promise<readonly string[]>,
  ): Promise<TemplateVersionRecord | null> {
    const version = this.findVersion(templateId, versionId);
    if (!version) {
      return null;
    }
    assertTemplateVersionTransition(version.status, "PUBLISHED");
    const issues = await verify(this.versionView(version));
    if (issues.length > 0) {
      throw new CatalogRendererContractInvalidError(issues);
    }

    const current = this.publishedVersion(templateId);
    if (current) {
      current.status = "RETIRED";
    }
    version.status = "PUBLISHED";
    return this.versionView(version);
  }

  async retireVersion(
    templateId: string,
    versionId: string,
  ): Promise<TemplateVersionRecord | null> {
    const version = this.findVersion(templateId, versionId);
    const template = this.templates.find((item) => item.id === templateId);
    if (!version || !template) {
      return null;
    }
    assertTemplateVersionTransition(version.status, "RETIRED");
    if (template.status === "PUBLISHED") {
      throw new CatalogTemplateNotPublishableError();
    }

    version.status = "RETIRED";
    return this.versionView(version);
  }

  private requireCategory(id: string): StoredCategory {
    const category = this.categories.find((item) => item.id === id);
    if (!category) {
      throw new CatalogCategoryNotFoundError();
    }
    return category;
  }

  private findVersion(templateId: string, versionId: string): StoredVersion | undefined {
    return this.templates.some((item) => item.id === templateId)
      ? this.versions.find((row) => row.id === versionId && row.templateId === templateId)
      : undefined;
  }

  private publishedVersion(templateId: string): StoredVersion | undefined {
    return this.versions.find((row) => row.templateId === templateId && row.status === "PUBLISHED");
  }

  private versionView({
    templateId: _templateId,
    ...record
  }: StoredVersion): TemplateVersionRecord {
    return { ...record };
  }

  private view(stored: StoredTemplate): CatalogTemplate {
    const { categoryId, ...fields } = stored;
    const published = this.publishedVersion(stored.id);
    return {
      ...fields,
      category: { ...this.requireCategory(categoryId) },
      publishedVersion: published ? { id: published.id, version: published.version } : null,
      versionCount: this.versions.filter((row) => row.templateId === stored.id).length,
    };
  }
}
