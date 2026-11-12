import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  birthdayAdventureVersionInput,
  MemoryCatalogTemplateRepository,
} from "../../../../test/memory-catalog-templates.repository";
import {
  CatalogCategoryNotFoundError,
  CatalogKeyTakenError,
  CatalogRendererContractInvalidError,
  CatalogTemplateNotPublishableError,
  InvalidCatalogEntryError,
} from "../../domain/catalog-errors";
import { MAX_VERSION_JSON_BYTES } from "../../domain/template";
import { IllegalTemplateVersionTransitionError } from "../../domain/template-version-lifecycle";
import {
  CreateTemplateUseCase,
  CreateTemplateVersionUseCase,
  ListRenderersUseCase,
  ListTemplatesUseCase,
  ListTemplateVersionsUseCase,
  PublishTemplateVersionUseCase,
  RetireTemplateVersionUseCase,
  UpdateTemplateUseCase,
} from "./template.use-cases";

// The template use cases (M3 T6c; S1, S5, S6, S8, S9, L4) on the in-memory port: validation again at the
// use-case boundary, registry contract checks on create and on publish, the bounded snapshot, and the
// rule that a template is PUBLISHED only while one of its versions is.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

async function seeded() {
  const repository = new MemoryCatalogTemplateRepository();
  const category = repository.addCategory("birthday");
  const template = await new CreateTemplateUseCase(repository).execute({
    key: "adventure",
    name: "Aventura",
    description: "Para cumpleaños",
    categoryId: category.id,
  });
  return { repository, category, template };
}

describe("CreateTemplateUseCase", () => {
  it("stores a normalized DRAFT template without versions", async () => {
    const { repository, category } = await seeded();

    const created = await new CreateTemplateUseCase(repository).execute({
      key: "gold-plus",
      name: "  Oro  ",
      description: "  Completo  ",
      categoryId: category.id,
    });

    assert.equal(created.key, "gold-plus");
    assert.equal(created.name, "Oro");
    assert.equal(created.description, "Completo");
    assert.equal(created.status, "DRAFT");
    assert.deepEqual(created.category, category);
    assert.equal(created.publishedVersion, null);
    assert.equal(created.versionCount, 0);
    assert.equal(repository.templates.length, 2);
  });

  it("refuses an invalid key, name, or description and stores nothing", async () => {
    const { repository, category } = await seeded();
    const useCase = new CreateTemplateUseCase(repository);

    for (const input of [
      { key: "Basic", name: "A" },
      { key: "GUEST_LIST", name: "A" },
      { key: "a_b", name: "A" },
      { key: "a", name: "  " },
      { key: "a", name: "a".repeat(121) },
      { key: "a", name: "A", description: "a".repeat(1001) },
    ]) {
      await assert.rejects(
        useCase.execute({ ...input, categoryId: category.id }),
        InvalidCatalogEntryError,
      );
    }
    assert.equal(repository.templates.length, 1);
  });

  it("refuses an unknown or malformed category and stores nothing", async () => {
    const { repository } = await seeded();
    const useCase = new CreateTemplateUseCase(repository);

    for (const categoryId of [UNKNOWN_ID, "not-a-uuid"]) {
      await assert.rejects(
        useCase.execute({ key: "other", name: "Otra", categoryId }),
        CatalogCategoryNotFoundError,
      );
    }
    assert.equal(repository.templates.length, 1);
  });

  it("refuses a duplicate key with CatalogKeyTakenError", async () => {
    const { repository, category } = await seeded();

    await assert.rejects(
      new CreateTemplateUseCase(repository).execute({
        key: "adventure",
        name: "Otra",
        categoryId: category.id,
      }),
      CatalogKeyTakenError,
    );
    assert.equal(repository.templates.length, 1);
  });
});

describe("ListTemplatesUseCase", () => {
  it("lists templates ordered by key", async () => {
    const { repository, category } = await seeded();
    await new CreateTemplateUseCase(repository).execute({
      key: "aaa",
      name: "Primero",
      categoryId: category.id,
    });

    const listed = await new ListTemplatesUseCase(repository).execute();

    assert.deepEqual(
      listed.map((template) => template.key),
      ["aaa", "adventure"],
    );
  });
});

describe("UpdateTemplateUseCase", () => {
  it("changes name, description, category, and status, never the key", async () => {
    const { repository, template } = await seeded();
    const other = repository.addCategory("wedding");

    const updated = await new UpdateTemplateUseCase(repository).execute(template.id, {
      name: "  Nuevo  ",
      description: null,
      categoryId: other.id,
      status: "ARCHIVED",
    });

    assert.equal(updated?.key, "adventure");
    assert.equal(updated?.name, "Nuevo");
    assert.equal(updated?.description, null);
    assert.equal(updated?.category.id, other.id);
    assert.equal(updated?.status, "ARCHIVED");
  });

  it("refuses an empty change, an invalid value, or an invalid status and changes nothing", async () => {
    const { repository, template } = await seeded();
    const before = structuredClone(repository.templates);
    const useCase = new UpdateTemplateUseCase(repository);

    for (const input of [
      {},
      { name: " " },
      { description: "a".repeat(1001) },
      { status: "RETIRED" as never },
      { status: "draft" as never },
    ]) {
      await assert.rejects(useCase.execute(template.id, input), InvalidCatalogEntryError);
    }
    assert.deepEqual(repository.templates, before);
  });

  it("answers null for an unknown or non-UUID id", async () => {
    const { repository } = await seeded();
    const useCase = new UpdateTemplateUseCase(repository);

    assert.equal(await useCase.execute(UNKNOWN_ID, { name: "Nuevo" }), null);
    assert.equal(await useCase.execute("not-a-uuid", { name: "Nuevo" }), null);
  });

  it("refuses an unknown category and leaves the row as stored", async () => {
    const { repository, template } = await seeded();
    const before = structuredClone(repository.templates);
    const useCase = new UpdateTemplateUseCase(repository);

    for (const categoryId of [UNKNOWN_ID, "not-a-uuid"]) {
      await assert.rejects(
        useCase.execute(template.id, { categoryId }),
        CatalogCategoryNotFoundError,
      );
    }
    assert.deepEqual(repository.templates, before);
  });

  it("refuses PUBLISHED without a PUBLISHED version, and accepts it with one (L4)", async () => {
    const { repository, template } = await seeded();
    const useCase = new UpdateTemplateUseCase(repository);
    repository.seedVersion(template.id, { ...birthdayAdventureVersionInput(), status: "DRAFT" });
    const before = structuredClone(repository.templates);

    await assert.rejects(
      useCase.execute(template.id, { status: "PUBLISHED" }),
      CatalogTemplateNotPublishableError,
    );
    assert.deepEqual(repository.templates, before);

    repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "PUBLISHED",
    });
    const published = await useCase.execute(template.id, { status: "PUBLISHED" });
    assert.equal(published?.status, "PUBLISHED");
    assert.equal(published?.publishedVersion?.version, 2);
  });
});

describe("ListRenderersUseCase", () => {
  it("lists the registry keys", () => {
    assert.deepEqual(new ListRenderersUseCase().execute(), [
      { componentKey: "birthday-adventure-01" },
      { componentKey: "birthday-map-01" },
      { componentKey: "birthday-poster-01" },
      { componentKey: "birthday-story-01" },
    ]);
  });
});

describe("CreateTemplateVersionUseCase", () => {
  it("stores DRAFT versions numbered max + 1 and keeps the snapshot as given", async () => {
    const { repository, template } = await seeded();
    const useCase = new CreateTemplateVersionUseCase(repository);
    const input = birthdayAdventureVersionInput();

    const first = await useCase.execute(template.id, input);
    const second = await useCase.execute(template.id, input);

    assert.equal(first?.version, 1);
    assert.equal(first?.status, "DRAFT");
    assert.deepEqual(first?.schema, input.schema);
    assert.deepEqual(first?.configuration, input.configuration);
    assert.equal(second?.version, 2);
    assert.equal(repository.versions.length, 2);
  });

  it("numbers after the highest, not after the count", async () => {
    const { repository, template } = await seeded();
    repository.seedVersion(template.id, { ...birthdayAdventureVersionInput(), status: "RETIRED" });
    repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "PUBLISHED",
    });

    const created = await new CreateTemplateVersionUseCase(repository).execute(
      template.id,
      birthdayAdventureVersionInput(),
    );

    assert.equal(created?.version, 3);
  });

  it("answers null for an unknown or non-UUID template", async () => {
    const { repository } = await seeded();
    const useCase = new CreateTemplateVersionUseCase(repository);

    assert.equal(await useCase.execute(UNKNOWN_ID, birthdayAdventureVersionInput()), null);
    assert.equal(await useCase.execute("not-a-uuid", birthdayAdventureVersionInput()), null);
    assert.equal(repository.versions.length, 0);
  });

  it("refuses an unregistered renderer or a contract violation with the issues and stores nothing", async () => {
    const { repository, template } = await seeded();
    const useCase = new CreateTemplateVersionUseCase(repository);
    const valid = birthdayAdventureVersionInput();

    await assert.rejects(
      useCase.execute(template.id, { ...valid, componentKey: "unknown-renderer" }),
      (error: unknown) => {
        assert.ok(error instanceof CatalogRendererContractInvalidError);
        assert.deepEqual(error.issues, [
          'componentKey "unknown-renderer" is not a registered renderer',
        ]);
        return true;
      },
    );
    await assert.rejects(
      useCase.execute(template.id, {
        ...valid,
        configuration: { ...(valid.configuration as object), palette: "neon" },
      }),
      (error: unknown) => {
        assert.ok(error instanceof CatalogRendererContractInvalidError);
        assert.deepEqual(error.issues, [
          "configuration.palette must be one of: sunset, ocean, forest",
        ]);
        return true;
      },
    );
    await assert.rejects(
      useCase.execute(template.id, { ...valid, schema: [] }),
      CatalogRendererContractInvalidError,
    );
    assert.equal(repository.versions.length, 0);
  });

  it("accepts a layout version whose configuration names an allowed theme", async () => {
    const { repository, template } = await seeded();
    const useCase = new CreateTemplateVersionUseCase(repository);

    const created = await useCase.execute(template.id, {
      componentKey: "birthday-map-01",
      schema: birthdayAdventureVersionInput().schema,
      configuration: { componentKey: "birthday-map-01", theme: "ice-kingdom" },
    });

    assert.equal(created?.componentKey, "birthday-map-01");
    assert.deepEqual(created?.configuration, {
      componentKey: "birthday-map-01",
      theme: "ice-kingdom",
    });

    await assert.rejects(
      useCase.execute(template.id, {
        componentKey: "birthday-map-01",
        schema: birthdayAdventureVersionInput().schema,
        configuration: { componentKey: "birthday-map-01", theme: "neon" },
      }),
      (error: unknown) => {
        assert.ok(error instanceof CatalogRendererContractInvalidError);
        assert.deepEqual(error.issues, [
          "configuration.theme must be one of: ice-kingdom, rescue-team, spider-hero, classic-mouse, dinosaurs, under-the-sea, fairytale-princess, blocks-and-pixels",
        ]);
        return true;
      },
    );
    assert.equal(repository.versions.length, 1);
  });

  it("refuses a schema or configuration over 64 KiB, or one holding NUL, and stores nothing", async () => {
    const { repository, template } = await seeded();
    const useCase = new CreateTemplateVersionUseCase(repository);
    const valid = birthdayAdventureVersionInput();
    const big = "a".repeat(MAX_VERSION_JSON_BYTES);

    await assert.rejects(
      useCase.execute(template.id, {
        ...valid,
        schema: { ...(valid.schema as object), padding: big },
      }),
      InvalidCatalogEntryError,
    );
    await assert.rejects(
      useCase.execute(template.id, {
        ...valid,
        configuration: { ...(valid.configuration as object), padding: big },
      }),
      InvalidCatalogEntryError,
    );
    await assert.rejects(
      useCase.execute(template.id, {
        ...valid,
        configuration: { ...(valid.configuration as object), palette: "sun\u0000set" },
      }),
      InvalidCatalogEntryError,
    );
    assert.equal(repository.versions.length, 0);
  });
});

describe("ListTemplateVersionsUseCase", () => {
  it("lists versions newest first, or null for an unknown template", async () => {
    const { repository, template } = await seeded();
    const create = new CreateTemplateVersionUseCase(repository);
    await create.execute(template.id, birthdayAdventureVersionInput());
    await create.execute(template.id, birthdayAdventureVersionInput());
    const list = new ListTemplateVersionsUseCase(repository);

    assert.deepEqual(
      (await list.execute(template.id))?.map((version) => version.version),
      [2, 1],
    );
    assert.equal(await list.execute(UNKNOWN_ID), null);
    assert.equal(await list.execute("not-a-uuid"), null);
  });
});

describe("PublishTemplateVersionUseCase", () => {
  it("publishes a DRAFT and retires the previously published version", async () => {
    const { repository, template } = await seeded();
    const first = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "PUBLISHED",
    });
    const second = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "DRAFT",
    });

    const published = await new PublishTemplateVersionUseCase(repository).execute(
      template.id,
      second.id,
    );

    assert.equal(published?.status, "PUBLISHED");
    assert.equal(published?.version, 2);
    assert.deepEqual(
      repository.versions.map((version) => [version.id, version.status]),
      [
        [first.id, "RETIRED"],
        [second.id, "PUBLISHED"],
      ],
    );
  });

  it("re-validates the stored snapshot: a renderer removed since creation is refused, nothing changes", async () => {
    const { repository, template } = await seeded();
    const published = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "PUBLISHED",
    });
    const stale = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      componentKey: "removed-renderer",
      status: "DRAFT",
    });
    const before = structuredClone(repository.versions);

    await assert.rejects(
      new PublishTemplateVersionUseCase(repository).execute(template.id, stale.id),
      (error: unknown) => {
        assert.ok(error instanceof CatalogRendererContractInvalidError);
        assert.deepEqual(error.issues, [
          'componentKey "removed-renderer" is not a registered renderer',
        ]);
        return true;
      },
    );
    assert.deepEqual(repository.versions, before);
    assert.equal(
      repository.versions.find((version) => version.id === published.id)?.status,
      "PUBLISHED",
    );
  });

  it("refuses a version that is not DRAFT with the transition error", async () => {
    const { repository, template } = await seeded();
    const useCase = new PublishTemplateVersionUseCase(repository);
    const published = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "PUBLISHED",
    });
    const retired = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "RETIRED",
    });

    for (const version of [published, retired]) {
      await assert.rejects(
        useCase.execute(template.id, version.id),
        IllegalTemplateVersionTransitionError,
      );
    }
  });

  it("answers null for an unknown template or version, or a version of another template", async () => {
    const { repository, category, template } = await seeded();
    const other = await new CreateTemplateUseCase(repository).execute({
      key: "other",
      name: "Otra",
      categoryId: category.id,
    });
    const foreign = repository.seedVersion(other.id, {
      ...birthdayAdventureVersionInput(),
      status: "DRAFT",
    });
    const useCase = new PublishTemplateVersionUseCase(repository);

    assert.equal(await useCase.execute(template.id, foreign.id), null);
    assert.equal(await useCase.execute(template.id, UNKNOWN_ID), null);
    assert.equal(await useCase.execute(UNKNOWN_ID, foreign.id), null);
    assert.equal(await useCase.execute("not-a-uuid", foreign.id), null);
    assert.equal(await useCase.execute(template.id, "not-a-uuid"), null);
    assert.equal(repository.versions[0]?.status, "DRAFT");
  });
});

describe("RetireTemplateVersionUseCase", () => {
  it("retires the published version of a template that is not PUBLISHED", async () => {
    const { repository, template } = await seeded();
    const version = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "PUBLISHED",
    });

    const retired = await new RetireTemplateVersionUseCase(repository).execute(
      template.id,
      version.id,
    );

    assert.equal(retired?.status, "RETIRED");
    assert.equal(repository.versions[0]?.status, "RETIRED");
  });

  it("refuses to retire the published version of a PUBLISHED template (L4), changing nothing", async () => {
    const { repository, template } = await seeded();
    const version = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "PUBLISHED",
    });
    await new UpdateTemplateUseCase(repository).execute(template.id, { status: "PUBLISHED" });
    const before = structuredClone(repository.versions);

    await assert.rejects(
      new RetireTemplateVersionUseCase(repository).execute(template.id, version.id),
      CatalogTemplateNotPublishableError,
    );
    assert.deepEqual(repository.versions, before);
  });

  it("refuses a DRAFT or RETIRED version with the transition error", async () => {
    const { repository, template } = await seeded();
    const useCase = new RetireTemplateVersionUseCase(repository);
    const draft = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "DRAFT",
    });
    const retired = repository.seedVersion(template.id, {
      ...birthdayAdventureVersionInput(),
      status: "RETIRED",
    });

    for (const version of [draft, retired]) {
      await assert.rejects(
        useCase.execute(template.id, version.id),
        IllegalTemplateVersionTransitionError,
      );
    }
  });

  it("answers null for unknown or foreign ids", async () => {
    const { repository, template } = await seeded();
    const useCase = new RetireTemplateVersionUseCase(repository);

    assert.equal(await useCase.execute(template.id, UNKNOWN_ID), null);
    assert.equal(await useCase.execute(UNKNOWN_ID, UNKNOWN_ID), null);
    assert.equal(await useCase.execute("not-a-uuid", UNKNOWN_ID), null);
    assert.equal(await useCase.execute(template.id, "not-a-uuid"), null);
  });
});
