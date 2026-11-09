import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryCatalogPackageRepository } from "../../../../test/memory-catalog-packages.repository";
import {
  CatalogFeatureNotFoundError,
  CatalogKeyTakenError,
  InvalidCatalogEntryError,
} from "../../domain/catalog-errors";
import {
  InvalidPackagePriceAmountError,
  InvalidPackagePriceCurrencyError,
} from "../../domain/package-price";
import {
  CreatePackageUseCase,
  ListPackagePricesUseCase,
  ListPackagesUseCase,
  SetPackageFeaturesUseCase,
  SetPackagePriceUseCase,
  UpdatePackageUseCase,
} from "./package.use-cases";

// The package use cases (M3 T6b; S1, S4, S9) on the in-memory port: validation again at the use-case
// boundary, status DRAFT on creation, an immutable key, and an unknown or non-UUID id answering null.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

async function seeded() {
  const repository = new MemoryCatalogPackageRepository();
  const created = await new CreatePackageUseCase(repository).execute({
    key: "basic",
    name: "Básico",
    description: "Para empezar",
  });
  return { repository, created };
}

describe("CreatePackageUseCase", () => {
  it("stores a normalized DRAFT package without features or prices", async () => {
    const repository = new MemoryCatalogPackageRepository();

    const created = await new CreatePackageUseCase(repository).execute({
      key: "gold-plus",
      name: "  Oro  ",
      description: "  Completo  ",
    });

    assert.equal(created.key, "gold-plus");
    assert.equal(created.name, "Oro");
    assert.equal(created.description, "Completo");
    assert.equal(created.status, "DRAFT");
    assert.deepEqual(created.features, []);
    assert.deepEqual(created.currentPrices, []);
    assert.equal(repository.packages.length, 1);
  });

  it("reads a missing or blank description as null", async () => {
    const repository = new MemoryCatalogPackageRepository();
    const useCase = new CreatePackageUseCase(repository);

    assert.equal((await useCase.execute({ key: "a", name: "A" })).description, null);
    assert.equal(
      (await useCase.execute({ key: "b", name: "B", description: " " })).description,
      null,
    );
  });

  it("refuses an invalid key, name, or description and stores nothing", async () => {
    const repository = new MemoryCatalogPackageRepository();
    const useCase = new CreatePackageUseCase(repository);

    for (const input of [
      { key: "Basic", name: "A" },
      { key: "GUEST_LIST", name: "A" },
      { key: "a_b", name: "A" },
      { key: "a", name: "  " },
      { key: "a", name: "a".repeat(121) },
      { key: "a", name: "A", description: "a".repeat(1001) },
    ]) {
      await assert.rejects(useCase.execute(input), InvalidCatalogEntryError);
    }
    assert.equal(repository.packages.length, 0);
  });

  it("refuses a duplicate key and keeps the stored package", async () => {
    const { repository } = await seeded();

    await assert.rejects(
      new CreatePackageUseCase(repository).execute({ key: "basic", name: "Otro" }),
      CatalogKeyTakenError,
    );

    assert.equal(repository.packages.length, 1);
    assert.equal(repository.packages[0]?.name, "Básico");
  });
});

describe("ListPackagesUseCase", () => {
  it("returns the packages ordered by key", async () => {
    const repository = new MemoryCatalogPackageRepository();
    const create = new CreatePackageUseCase(repository);
    await create.execute({ key: "premium", name: "Premium" });
    await create.execute({ key: "basic", name: "Básico" });

    const keys = (await new ListPackagesUseCase(repository).execute()).map((item) => item.key);

    assert.deepEqual(keys, ["basic", "premium"]);
  });
});

describe("UpdatePackageUseCase", () => {
  it("changes only the fields that are present and never the key", async () => {
    const { repository, created } = await seeded();
    const useCase = new UpdatePackageUseCase(repository);

    const renamed = await useCase.execute(created.id, { name: " Inicial " });
    assert.equal(renamed?.name, "Inicial");
    assert.equal(renamed?.description, "Para empezar");
    assert.equal(renamed?.status, "DRAFT");

    const changed = await useCase.execute(created.id, { description: null, status: "ACTIVE" });
    assert.equal(changed?.description, null);
    assert.equal(changed?.status, "ACTIVE");
    assert.equal(changed?.name, "Inicial");
    assert.equal(changed?.key, "basic");

    assert.equal((await useCase.execute(created.id, { status: "ARCHIVED" }))?.status, "ARCHIVED");
  });

  it("returns null for an unknown id and for an id that is not a UUID", async () => {
    const { repository } = await seeded();
    const before = structuredClone(repository.packages);
    const useCase = new UpdatePackageUseCase(repository);

    assert.equal(await useCase.execute(UNKNOWN_ID, { name: "X" }), null);
    assert.equal(await useCase.execute("not-a-uuid", { name: "X" }), null);
    assert.deepEqual(repository.packages, before);
  });

  it("refuses an empty change and invalid values, leaving the package unchanged", async () => {
    const { repository, created } = await seeded();
    const before = structuredClone(repository.packages);
    const useCase = new UpdatePackageUseCase(repository);

    for (const input of [
      {},
      { name: "" },
      { name: "a".repeat(121) },
      { description: "a".repeat(1001) },
      { status: "PUBLISHED" as unknown as "ACTIVE" },
      { status: null as unknown as "ACTIVE" },
    ]) {
      await assert.rejects(useCase.execute(created.id, input), InvalidCatalogEntryError);
    }
    assert.deepEqual(repository.packages, before);
  });
});

describe("SetPackageFeaturesUseCase", () => {
  async function withFeatures() {
    const { repository, created } = await seeded();
    const [one, two, three] = ["ALPHA", "BETA", "GAMMA"].map((key) => repository.addFeature(key));
    assert.ok(one && two && three);
    return {
      repository,
      created,
      one,
      two,
      three,
      useCase: new SetPackageFeaturesUseCase(repository),
    };
  }

  it("replaces the links: keeps the listed ones, adds the missing, drops the rest", async () => {
    const { repository, created, one, two, three, useCase } = await withFeatures();

    const first = await useCase.execute(created.id, [two.id, one.id]);
    assert.deepEqual(
      first?.features.map((feature) => feature.key),
      ["ALPHA", "BETA"],
    );
    assert.ok(first?.features.every((feature) => feature.included));

    const second = await useCase.execute(created.id, [three.id, two.id]);
    assert.deepEqual(
      second?.features.map((feature) => feature.key),
      ["BETA", "GAMMA"],
    );
    assert.equal(repository.links.length, 2);

    assert.deepEqual((await useCase.execute(created.id, []))?.features, []);
    assert.equal(repository.links.length, 0);
  });

  it("refuses an unknown feature with CatalogFeatureNotFoundError and changes nothing", async () => {
    const { repository, created, one, useCase } = await withFeatures();
    await useCase.execute(created.id, [one.id]);
    const before = structuredClone(repository.links);

    await assert.rejects(
      useCase.execute(created.id, [one.id, UNKNOWN_ID]),
      CatalogFeatureNotFoundError,
    );

    assert.deepEqual(repository.links, before);
  });

  it("refuses duplicate ids, non-UUID ids, and more than 100 ids before reaching the port", async () => {
    const { repository, created, one, useCase } = await withFeatures();
    await useCase.execute(created.id, [one.id]);
    const before = structuredClone(repository.links);
    const many = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );

    for (const ids of [[one.id, one.id], ["not-a-uuid"], many]) {
      await assert.rejects(useCase.execute(created.id, ids), InvalidCatalogEntryError);
    }
    assert.deepEqual(repository.links, before);
  });

  it("returns null for an unknown package and for an id that is not a UUID", async () => {
    const { repository, one, useCase } = await withFeatures();

    assert.equal(await useCase.execute(UNKNOWN_ID, [one.id]), null);
    assert.equal(await useCase.execute("not-a-uuid", [one.id]), null);
    assert.equal(repository.links.length, 0);
  });
});

describe("SetPackagePriceUseCase and ListPackagePricesUseCase", () => {
  it("sets the current price, then retires it when the amount changes, keeping the history", async () => {
    const { repository, created } = await seeded();
    const set = new SetPackagePriceUseCase(repository);

    const first = await set.execute(created.id, { currency: "MXN", amountMinor: 49900 });
    assert.deepEqual(
      first?.currentPrices.map(({ currency, amountMinor }) => ({ currency, amountMinor })),
      [{ currency: "MXN", amountMinor: 49900 }],
    );

    const second = await set.execute(created.id, { currency: "MXN", amountMinor: 59900 });
    assert.deepEqual(
      second?.currentPrices.map(({ amountMinor }) => amountMinor),
      [59900],
    );

    const history = await new ListPackagePricesUseCase(repository).execute(created.id);
    assert.deepEqual(
      history?.map(({ amountMinor }) => amountMinor),
      [59900, 49900],
    );
    assert.equal(history?.[0]?.retiredAt, null);
    assert.ok(history?.[1]?.retiredAt instanceof Date);
  });

  it("is a no-op when the amount equals the current price", async () => {
    const { repository, created } = await seeded();
    const set = new SetPackagePriceUseCase(repository);
    await set.execute(created.id, { currency: "MXN", amountMinor: 49900 });
    const before = structuredClone(repository.prices);

    const again = await set.execute(created.id, { currency: "MXN", amountMinor: 49900 });

    assert.equal(again?.currentPrices.length, 1);
    assert.deepEqual(repository.prices, before);
  });

  it("accepts a free package (amount 0)", async () => {
    const { repository, created } = await seeded();

    const result = await new SetPackagePriceUseCase(repository).execute(created.id, {
      currency: "MXN",
      amountMinor: 0,
    });

    assert.equal(result?.currentPrices[0]?.amountMinor, 0);
  });

  it("refuses an unsupported currency or an invalid amount with the domain error, storing nothing", async () => {
    const { repository, created } = await seeded();
    const set = new SetPackagePriceUseCase(repository);

    for (const currency of ["USD", "mxn", " MXN", 1, undefined]) {
      await assert.rejects(
        set.execute(created.id, { currency, amountMinor: 100 } as never),
        InvalidPackagePriceCurrencyError,
      );
    }
    for (const amountMinor of [-1, 1.5, "100", null, Number.NaN, 2_147_483_648]) {
      await assert.rejects(
        set.execute(created.id, { currency: "MXN", amountMinor } as never),
        InvalidPackagePriceAmountError,
      );
    }
    assert.equal(repository.prices.length, 0);
  });

  it("returns null for an unknown package and for an id that is not a UUID", async () => {
    const { repository } = await seeded();
    const set = new SetPackagePriceUseCase(repository);
    const list = new ListPackagePricesUseCase(repository);

    assert.equal(await set.execute(UNKNOWN_ID, { currency: "MXN", amountMinor: 1 }), null);
    assert.equal(await set.execute("not-a-uuid", { currency: "MXN", amountMinor: 1 }), null);
    assert.equal(await list.execute(UNKNOWN_ID), null);
    assert.equal(await list.execute("not-a-uuid"), null);
    assert.equal(repository.prices.length, 0);
  });

  it("returns an empty history for a package without prices", async () => {
    const { repository, created } = await seeded();

    assert.deepEqual(await new ListPackagePricesUseCase(repository).execute(created.id), []);
  });
});
