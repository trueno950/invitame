import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INVITATION_PASSWORD_MAX_LENGTH,
  INVITATION_PASSWORD_MIN_LENGTH,
  LOCK_SCREEN_NAME_MAX_LENGTH,
  lockScreenDisplayName,
  validateInvitationPassword,
} from "./invitation-password";

// The pure rules of the shared access code (F13; S2.13, L18.1, L18.3): the width of the code, its normalization, and the
// one display name a locked page may carry. The hashing and the token live in the application layer.

describe("validateInvitationPassword (L18.1)", () => {
  it("accepts a code of 4 to 40 characters after trimming it", () => {
    assert.deepEqual(validateInvitationPassword("clave"), { password: "clave", issues: [] });
    assert.deepEqual(validateInvitationPassword("  clave  "), { password: "clave", issues: [] });
    assert.deepEqual(validateInvitationPassword("a".repeat(INVITATION_PASSWORD_MIN_LENGTH)), {
      password: "a".repeat(INVITATION_PASSWORD_MIN_LENGTH),
      issues: [],
    });
    assert.deepEqual(validateInvitationPassword("b".repeat(INVITATION_PASSWORD_MAX_LENGTH)), {
      password: "b".repeat(INVITATION_PASSWORD_MAX_LENGTH),
      issues: [],
    });
  });

  it("refuses a code shorter than four or longer than forty characters", () => {
    assert.deepEqual(validateInvitationPassword("abc"), {
      password: null,
      issues: [INVITATION_PASSWORD_MIN_LENGTH].map(
        () => "password must be at least 4 characters long",
      ),
    });
    assert.deepEqual(validateInvitationPassword("c".repeat(INVITATION_PASSWORD_MAX_LENGTH + 1)), {
      password: null,
      issues: ["password must be at most 40 characters long"],
    });
    // Whitespace does not count towards the width: it is trimmed first.
    assert.deepEqual(validateInvitationPassword("   ab   ").password, null);
  });

  it("refuses a value that is not a string, and never echoes it", () => {
    for (const value of [undefined, null, 1234, { password: "clave" }, ["clave"]]) {
      const validated = validateInvitationPassword(value);

      assert.equal(validated.password, null);
      assert.deepEqual(validated.issues, ["password must be a string"]);
    }
  });

  it("refuses control characters, which cannot be typed from a shared message", () => {
    const validated = validateInvitationPassword("clave\u0000familiar");

    assert.equal(validated.password, null);
    assert.deepEqual(validated.issues, ["password must not carry control characters"]);
    assert.equal(validateInvitationPassword("clave\nfamiliar").password, null);
    assert.equal(validateInvitationPassword("clave\u009ffamiliar").password, null);
  });

  it("keeps whitespace inside the code exactly as typed", () => {
    assert.equal(validateInvitationPassword("la fiesta").password, "la fiesta");
  });
});

describe("lockScreenDisplayName (L18.3)", () => {
  it("names the celebrant, and the baby when the celebration names a baby", () => {
    assert.equal(
      lockScreenDisplayName({ celebrantName: "Valentina Ramírez" }),
      "Valentina Ramírez",
    );
    assert.equal(
      lockScreenDisplayName({ celebrantName: "  Emilia ", babyName: "Mateo" }),
      "Emilia",
    );
    assert.equal(lockScreenDisplayName({ babyName: "Mateo" }), "Mateo");
  });

  it("joins the two names of a wedding", () => {
    assert.equal(
      lockScreenDisplayName({ coupleNameOne: "Ana", coupleNameTwo: "Luis" }),
      "Ana y Luis",
    );
    // The celebrant wins when the content carries both shapes.
    assert.equal(
      lockScreenDisplayName({
        celebrantName: "Emilia",
        coupleNameOne: "Ana",
        coupleNameTwo: "Luis",
      }),
      "Emilia",
    );
    // One name alone is not a full display name: the lock screen shows its generic line instead.
    assert.equal(lockScreenDisplayName({ coupleNameOne: "Ana" }), null);
  });

  it("answers nothing when the content names nobody, and never reads another field", () => {
    assert.equal(lockScreenDisplayName({}), null);
    assert.equal(
      lockScreenDisplayName({ message: "Los esperamos", date: "2026-12-31", age: "15" }),
      null,
    );
    assert.equal(lockScreenDisplayName({ celebrantName: "   " }), null);
    assert.equal(lockScreenDisplayName({ celebrantName: 42 }), null);
  });

  it("collapses whitespace and bounds the line the lock screen draws", () => {
    assert.equal(
      lockScreenDisplayName({ celebrantName: "Valentina\n  Ramírez" }),
      "Valentina Ramírez",
    );

    const long = lockScreenDisplayName({ celebrantName: "N".repeat(200) });
    assert.ok(long !== null);
    assert.ok(long.length <= LOCK_SCREEN_NAME_MAX_LENGTH);
    assert.ok(long.endsWith("…"));
  });

  it("drops a name that carries a control character instead of drawing it", () => {
    assert.equal(lockScreenDisplayName({ celebrantName: "Ana\u0000" }), null);
  });
});
