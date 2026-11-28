import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InvalidInvitationSlugRandomnessError,
  ReservedInvitationSlugError,
} from "./invitation.errors";
import {
  INVITATION_SLUG_MAX_LENGTH,
  INVITATION_SLUG_MIN_LENGTH,
  RESERVED_INVITATION_SLUGS,
  assertNotReservedSlug,
  generateInvitationSlug,
  isReservedSlug,
  isValidInvitationSlug,
} from "./invitation-slug";

// The generated public slug (M4 T2; S5, S10). Milestone 4 creates the slug and never edits it: a fixed
// neutral prefix, six random lower-case alphanumerics, lower-case only, unique in PostgreSQL, and never
// derived from the owner or from any user data. The expected strings are literals on purpose.

const GENERATED_SLUG = /^invitacion-[a-z0-9]{6}$/;

/** A randomness source that yields the given values in order and counts how often it was read. */
function sequence(values: readonly number[]): { random: () => number; calls: () => number } {
  let index = 0;
  return {
    random: () => {
      const value = values[index] ?? 0;
      index += 1;
      return value;
    },
    calls: () => index,
  };
}

/** A Park-Miller generator, so the format test does not depend on `Math.random`. */
function pseudoRandom(): () => number {
  let state = 48271;
  return () => {
    state = (state * 48271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

describe("generateInvitationSlug", () => {
  it("builds the prefix and six random characters, one draw each", () => {
    const source = sequence([0, 0.03, 0.06, 0.98, 0, 0.99]);

    assert.equal(generateInvitationSlug(source.random), "invitacion-abc9a9");
    assert.equal(source.calls(), 6);
  });

  it("maps the two ends of the randomness range to the first and last alphabet characters", () => {
    const lowest = Array.from({ length: 6 }, () => 0);
    const highest = Array.from({ length: 6 }, () => 35.999 / 36);

    assert.equal(generateInvitationSlug(sequence(lowest).random), "invitacion-aaaaaa");
    assert.equal(generateInvitationSlug(sequence(highest).random), "invitacion-999999");
  });

  it("matches the database format and length for every draw", () => {
    const random = pseudoRandom();

    for (let attempt = 0; attempt < 500; attempt += 1) {
      const slug = generateInvitationSlug(random);

      assert.match(slug, GENERATED_SLUG);
      assert.equal(isValidInvitationSlug(slug), true, slug);
      assert.ok(slug.length >= INVITATION_SLUG_MIN_LENGTH, slug);
      assert.ok(slug.length <= INVITATION_SLUG_MAX_LENGTH, slug);
    }
  });

  it("is deterministic for the same randomness source", () => {
    const values = [0.5, 0.25, 0.125, 0.75, 0.375, 0.625];

    assert.equal(
      generateInvitationSlug(sequence(values).random),
      generateInvitationSlug(sequence(values).random),
    );
    assert.notEqual(
      generateInvitationSlug(sequence(values).random),
      generateInvitationSlug(sequence([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]).random),
    );
  });

  it("never generates a reserved slug", () => {
    const random = pseudoRandom();

    for (let attempt = 0; attempt < 500; attempt += 1) {
      assert.equal(isReservedSlug(generateInvitationSlug(random)), false);
    }
  });

  it("refuses a randomness source outside [0, 1) instead of emitting a broken slug", () => {
    const outOfRange = [
      -0.0001,
      1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (const value of outOfRange) {
      assert.throws(
        () => generateInvitationSlug(() => value),
        (error: unknown) =>
          error instanceof InvalidInvitationSlugRandomnessError &&
          error.message === `Invalid slug randomness value: ${String(value)}`,
        String(value),
      );
    }
    for (const value of ["0", null, undefined, {}, []]) {
      assert.throws(
        () => generateInvitationSlug(() => value as unknown as number),
        (error: unknown) =>
          error instanceof InvalidInvitationSlugRandomnessError &&
          error.message === `Invalid slug randomness value: ${JSON.stringify(value)}`,
      );
    }
  });
});

describe("isValidInvitationSlug", () => {
  it("accepts lower-case alphanumerics joined by single hyphens within the column length", () => {
    for (const slug of [
      "abc",
      "invitacion-abc9a9",
      "cumple-k7m2qx",
      "a-b",
      "0-0-0",
      "a".repeat(INVITATION_SLUG_MAX_LENGTH),
    ]) {
      assert.equal(isValidInvitationSlug(slug), true, slug);
    }
  });

  it("refuses any other shape", () => {
    for (const slug of [
      "",
      "ab",
      "Admin",
      "invitacion-ABC9A9",
      "cumple k7m2qx",
      "cumple_k7m2qx",
      "cumple--k7m2qx",
      "-cumple",
      "cumple-",
      "cumple.k7m2qx",
      "_next",
      "a".repeat(INVITATION_SLUG_MAX_LENGTH + 1),
    ]) {
      assert.equal(isValidInvitationSlug(slug), false, slug);
    }
    for (const value of [null, undefined, 1, {}, []]) {
      assert.equal(isValidInvitationSlug(value), false);
    }
  });
});

describe("reserved slugs", () => {
  it("lists the reserved words as lower-case data", () => {
    assert.deepEqual(
      [...RESERVED_INVITATION_SLUGS],
      [
        "admin",
        "api",
        "auth",
        "catalog",
        "colaboraciones",
        "collaborations",
        "cuenta",
        "fonts",
        "health",
        "i",
        "ingresar",
        "invitacion",
        "invitaciones",
        "invitame",
        "invitations",
        "me",
        "media",
        "payments",
        "public",
        "_next",
      ],
    );
  });

  it("recognizes a full reserved slug whatever its case", () => {
    for (const reserved of RESERVED_INVITATION_SLUGS) {
      assert.equal(isReservedSlug(reserved), true, reserved);
      assert.equal(isReservedSlug(reserved.toUpperCase()), true, reserved);
    }
  });

  it("does not treat a longer slug that starts with a reserved word as reserved", () => {
    for (const slug of [
      "admin-panel",
      "administracion",
      "api2",
      "cuentas",
      "invitacion-abc9a9",
      "invitaciones-2027",
      "healthcheck",
      "",
    ]) {
      assert.equal(isReservedSlug(slug), false, slug);
    }
  });

  it("refuses a reserved slug with a domain error that names it", () => {
    assert.doesNotThrow(() => assertNotReservedSlug("invitacion-abc9a9"));

    for (const reserved of RESERVED_INVITATION_SLUGS) {
      assert.throws(
        () => assertNotReservedSlug(reserved),
        (error: unknown) =>
          error instanceof ReservedInvitationSlugError &&
          error.slug === reserved &&
          error.message === `The slug ${JSON.stringify(reserved)} is reserved.`,
        reserved,
      );
    }
  });
});
