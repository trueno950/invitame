import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryCatalogTaxonomyRepository } from "../../../../test/memory-catalog-taxonomy.repository";
import { CatalogKeyTakenError, InvalidCatalogEntryError } from "../../domain/catalog-errors";
import {
  CreateCategoryUseCase,
  CreateFeatureUseCase,
  ListCategoriesUseCase,
  UpdateCategoryUseCase,
} from "./catalog-entry.use-cases";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("CreateCategoryUseCase", () => {
  it("stores a normalized, active entry and returns it", async () => {
    const repository = new MemoryCatalogTaxonomyRepository();
    const created = await new CreateCategoryUseCase(repository).execute({
      key: "baby-shower",
      name: "  Baby shower  ",
      description: "  Para recién nacidos  ",
    });

    assert.equal(created.key, "baby-shower");
    assert.equal(created.name, "Baby shower");
    assert.equal(created.description, "Para recién nacidos");
    assert.equal(created.isActive, true);
    assert.equal(repository.entries.length, 1);
  });

  it("reads a missing or blank description as null", async () => {
    const repository = new MemoryCatalogTaxonomyRepository();
    const useCase = new CreateCategoryUseCase(repository);

    assert.equal((await useCase.execute({ key: "a", name: "A" })).description, null);
    assert.equal(
      (await useCase.execute({ key: "b", name: "B", description: " " })).description,
      null,
    );
  });

  it("refuses an invalid key, name, or description and stores nothing", async () => {
    const repository = new MemoryCatalogTaxonomyRepository();
    const useCase = new CreateCategoryUseCase(repository);

    for (const input of [
      { key: "Baby_Shower", name: "A" },
      { key: "GUEST_LIST", name: "A" },
      { key: "a", name: "  " },
      { key: "a", name: "a".repeat(121) },
      { key: "a", name: "A", description: "a".repeat(1001) },
    ]) {
      await assert.rejects(useCase.execute(input), InvalidCatalogEntryError);
    }
    assert.equal(repository.entries.length, 0);
  });

  it("refuses a duplicate key and keeps the stored entry", async () => {
    const repository = new MemoryCatalogTaxonomyRepository();
    const useCase = new CreateCategoryUseCase(repository);
    await useCase.execute({ key: "birthday", name: "Cumpleaños" });

    await assert.rejects(useCase.execute({ key: "birthday", name: "Otro" }), CatalogKeyTakenError);
    assert.equal(repository.entries.length, 1);
    assert.equal(repository.entries[0]?.name, "Cumpleaños");
  });
});

describe("CreateFeatureUseCase", () => {
  it("accepts UPPER_SNAKE keys and refuses kebab-case ones", async () => {
    const repository = new MemoryCatalogTaxonomyRepository();
    const useCase = new CreateFeatureUseCase(repository);

    assert.equal((await useCase.execute({ key: "GUEST_LIST", name: "Lista" })).key, "GUEST_LIST");
    await assert.rejects(
      useCase.execute({ key: "guest-list", name: "Lista" }),
      InvalidCatalogEntryError,
    );
    assert.equal(repository.entries.length, 1);
  });
});

describe("UpdateCategoryUseCase", () => {
  async function seeded() {
    const repository = new MemoryCatalogTaxonomyRepository();
    const created = await new CreateCategoryUseCase(repository).execute({
      key: "birthday",
      name: "Cumpleaños",
      description: "Fiestas",
    });
    return { repository, created, useCase: new UpdateCategoryUseCase(repository) };
  }

  it("changes only the fields that are present and never the key", async () => {
    const { created, useCase } = await seeded();

    const renamed = await useCase.execute(created.id, { name: " Fiestas de cumpleaños " });
    assert.equal(renamed?.name, "Fiestas de cumpleaños");
    assert.equal(renamed?.description, "Fiestas");
    assert.equal(renamed?.isActive, true);
    assert.equal(renamed?.key, "birthday");

    const cleared = await useCase.execute(created.id, { description: null, isActive: false });
    assert.equal(cleared?.description, null);
    assert.equal(cleared?.isActive, false);
    assert.equal(cleared?.name, "Fiestas de cumpleaños");
  });

  it("returns null for an unknown id and for an id that is not a UUID", async () => {
    const { repository, useCase } = await seeded();
    const before = structuredClone(repository.entries);

    assert.equal(await useCase.execute(UNKNOWN_ID, { name: "X" }), null);
    assert.equal(await useCase.execute("not-a-uuid", { name: "X" }), null);
    assert.deepEqual(repository.entries, before);
  });

  it("refuses an empty change and invalid values, leaving the entry unchanged", async () => {
    const { repository, created, useCase } = await seeded();
    const before = structuredClone(repository.entries);

    for (const input of [
      {},
      { name: "" },
      { name: "a".repeat(121) },
      { description: "a".repeat(1001) },
      { isActive: "yes" as unknown as boolean },
    ]) {
      await assert.rejects(useCase.execute(created.id, input), InvalidCatalogEntryError);
    }
    assert.deepEqual(repository.entries, before);
  });
});

describe("ListCategoriesUseCase", () => {
  it("returns the entries ordered by key", async () => {
    const repository = new MemoryCatalogTaxonomyRepository();
    const create = new CreateCategoryUseCase(repository);
    await create.execute({ key: "wedding", name: "Boda" });
    await create.execute({ key: "birthday", name: "Cumpleaños" });

    const keys = (await new ListCategoriesUseCase(repository).execute()).map((entry) => entry.key);

    assert.deepEqual(keys, ["birthday", "wedding"]);
  });
});
