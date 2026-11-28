import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_INVITATION_SLUG_RENAMES,
  OWNER_INVITATION_SLUG_MAX_LENGTH,
  OWNER_INVITATION_SLUG_MIN_LENGTH,
  RESERVED_INVITATION_SLUGS,
  isReservedSlug,
  ownerSlugChoice,
  ownerSlugIssue,
} from "./invitation-slug";

// The address the owner types (F11; S2.11, L15.1, approval): 3 to 40 characters of lower-case letters, digits, and
// inner hyphens, no double hyphen, and never a reserved word. The expected strings are literals on purpose, and the
// reserved list is asserted whole so a new route segment anywhere in the product makes this suite speak up.

describe("ownerSlugChoice", () => {
  it("accepts the addresses the artboard and the product name", () => {
    for (const slug of [
      "valentina-xv",
      "ana-y-beto",
      "abc",
      "a-b",
      "boda2027",
      "0-0",
      "x".repeat(OWNER_INVITATION_SLUG_MAX_LENGTH),
    ]) {
      assert.equal(ownerSlugChoice(slug), "valid", slug);
    }
  });

  it("refuses anything shorter than three or longer than forty characters", () => {
    for (const slug of ["", "a", "ab", "x".repeat(OWNER_INVITATION_SLUG_MAX_LENGTH + 1)]) {
      assert.equal(ownerSlugChoice(slug), "invalid", slug);
    }
    assert.equal(OWNER_INVITATION_SLUG_MIN_LENGTH, 3);
    assert.equal(OWNER_INVITATION_SLUG_MAX_LENGTH, 40);
  });

  it("refuses a leading or trailing hyphen and a double hyphen", () => {
    for (const slug of ["-boda", "boda-", "boda--2027", "--", "a--b"]) {
      assert.equal(ownerSlugChoice(slug), "invalid", slug);
    }
  });

  it("refuses upper case, spaces, underscores, dots, and any other character", () => {
    for (const slug of [
      "Valentina-XV",
      "valentina xv",
      "valentina_xv",
      "valentina.xv",
      "valentina/xv",
      "valentina-xv/../admin",
      "ñandú",
      "boda\u0000",
    ]) {
      assert.equal(ownerSlugChoice(slug), "invalid", slug);
    }
  });

  it("refuses values that are not strings at all", () => {
    for (const value of [null, undefined, 42, true, {}, [], ["boda"]]) {
      assert.equal(ownerSlugChoice(value), "invalid", String(value));
    }
  });

  it("refuses a reserved word that is also a well-formed address", () => {
    for (const slug of ["admin", "cuenta", "ingresar", "health", "invitame", "invitaciones"]) {
      assert.equal(ownerSlugChoice(slug), "reserved", slug);
    }
  });

  it("refuses the router's one-letter address as invalid, because it is shorter than the rule", () => {
    assert.equal(ownerSlugChoice("i"), "invalid");
  });

  it("never answers valid for a reserved word, whatever its length", () => {
    for (const reserved of RESERVED_INVITATION_SLUGS) {
      assert.notEqual(ownerSlugChoice(reserved), "valid", reserved);
    }
  });
});

describe("reserved words", () => {
  it("lists every route segment and product name as lower-case data", () => {
    assert.deepEqual(
      [...RESERVED_INVITATION_SLUGS],
      [
        "admin",
        "api",
        "auth",
        "catalog",
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

  it("keeps recognizing a longer address that merely starts with a reserved word", () => {
    for (const slug of ["admin-panel", "cuentas", "invitame-boda", "publico"]) {
      assert.equal(isReservedSlug(slug), false, slug);
    }
  });
});

describe("ownerSlugIssue", () => {
  it("explains an address the rule refuses in English, for the API's issues", () => {
    assert.equal(
      ownerSlugIssue("Valentina"),
      "The address must be 3 to 40 characters of lower-case letters, digits, and inner hyphens.",
    );
    assert.equal(
      ownerSlugIssue("boda--2027"),
      "The address must be 3 to 40 characters of lower-case letters, digits, and inner hyphens.",
    );
  });

  it("names the reserved word it refused", () => {
    assert.equal(ownerSlugIssue("admin"), "The address admin is reserved.");
  });

  it("answers nothing for an address the rule accepts", () => {
    assert.equal(ownerSlugIssue("valentina-xv"), null);
  });
});

describe("the rename bound", () => {
  it("allows five renames per invitation (L15.2, approval)", () => {
    assert.equal(MAX_INVITATION_SLUG_RENAMES, 5);
  });
});
