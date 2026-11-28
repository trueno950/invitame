import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLLABORATOR_EMAIL_ISSUE,
  COLLABORATOR_PERMISSIONS_ISSUE,
  COLLABORATOR_INVITATION_TTL_DAYS,
  collaboratorInvitationExpiresAt,
  collaboratorStatus,
  grantsInvitationPermission,
  hasInvitationPermission,
  INVITATION_PERMISSIONS,
  MAX_INVITATION_COLLABORATORS,
  normalizeCollaboratorEmail,
  normalizeInvitationPermissions,
} from "./invitation-collaborator";

// The co-host rules the API applies before anything is stored (F12; S2.12, L17.1, L17.2): the invited address, the
// permission set, the acceptance window, and what a stored row means. The database repeats them, so this suite pins the
// values both sides must agree on.

describe("the invited address (L17.1)", () => {
  it("trims and lower-cases what the owner typed, so the acceptance compares normalized values", () => {
    assert.deepEqual(normalizeCollaboratorEmail("  Ana.Martinez@Example.TEST \n"), {
      ok: true,
      value: "ana.martinez@example.test",
    });
  });

  it("keeps an address that carries plus, dots, and a long domain", () => {
    assert.deepEqual(normalizeCollaboratorEmail("ana+cohost@sub.example.test"), {
      ok: true,
      value: "ana+cohost@sub.example.test",
    });
  });

  it("refuses everything an address must not be, with one issue", () => {
    for (const value of [
      "",
      "   ",
      "ana",
      "ana@",
      "@example.test",
      "a b@example.test",
      "ana@exa mple.test",
    ]) {
      assert.deepEqual(
        normalizeCollaboratorEmail(value),
        { ok: false, issues: [COLLABORATOR_EMAIL_ISSUE] },
        JSON.stringify(value),
      );
    }
  });

  it("refuses a value that is not a string and an address over 320 characters", () => {
    for (const value of [42, null, undefined, {}, []]) {
      assert.deepEqual(normalizeCollaboratorEmail(value), {
        ok: false,
        issues: [COLLABORATOR_EMAIL_ISSUE],
      });
    }
    const tooLong = `${"a".repeat(315)}@ex.test`;
    assert.ok(tooLong.length > 320);
    assert.deepEqual(normalizeCollaboratorEmail(tooLong), {
      ok: false,
      issues: [COLLABORATOR_EMAIL_ISSUE],
    });
  });
});

describe("the permission set (L17.2)", () => {
  it("is exactly the three grantable permissions, in the domain's order", () => {
    assert.deepEqual(INVITATION_PERMISSIONS, ["EDIT_CONTENT", "VIEW_ATTENDANCE", "PUBLISH"]);
  });

  it("accepts one permission, two, or all three, and answers the canonical order", () => {
    assert.deepEqual(normalizeInvitationPermissions(["PUBLISH"]), {
      ok: true,
      value: ["PUBLISH"],
    });
    assert.deepEqual(normalizeInvitationPermissions(["PUBLISH", "EDIT_CONTENT"]), {
      ok: true,
      value: ["EDIT_CONTENT", "PUBLISH"],
    });
    assert.deepEqual(
      normalizeInvitationPermissions(["PUBLISH", "VIEW_ATTENDANCE", "EDIT_CONTENT"]),
      {
        ok: true,
        value: ["EDIT_CONTENT", "VIEW_ATTENDANCE", "PUBLISH"],
      },
    );
  });

  it("refuses an empty set, an unknown permission, a repeat, and a value that is not a list", () => {
    for (const value of [
      [],
      ["PAY"],
      ["EDIT_CONTENT", "EDIT_CONTENT"],
      ["edit_content"],
      [1],
      "EDIT_CONTENT",
      null,
      undefined,
    ]) {
      assert.deepEqual(
        normalizeInvitationPermissions(value),
        { ok: false, issues: [COLLABORATOR_PERMISSIONS_ISSUE] },
        JSON.stringify(value),
      );
    }
  });

  it("never grants a permission that is not one of the three, whatever the stored row says", () => {
    // A row written around the API is answered by dropping what the allow-list does not know (L20).
    assert.deepEqual(normalizeInvitationPermissions(["EDIT_CONTENT", "PAY", "PAY"]), {
      ok: false,
      issues: [COLLABORATOR_PERMISSIONS_ISSUE],
    });
    assert.equal(hasInvitationPermission(["EDIT_CONTENT", "PAY"] as never, "PAY" as never), false);
  });
});

describe("what a stored row means (L17.3)", () => {
  it("is pending until it is accepted, and active afterwards", () => {
    assert.equal(collaboratorStatus({ acceptedAt: null, revokedAt: null }), "PENDING");
    assert.equal(
      collaboratorStatus({ acceptedAt: new Date("2026-12-20T10:00:00Z"), revokedAt: null }),
      "ACTIVE",
    );
  });

  it("stays revoked once the owner revokes it, even if it had been accepted", () => {
    assert.equal(
      collaboratorStatus({
        acceptedAt: new Date("2026-12-20T10:00:00Z"),
        revokedAt: new Date("2026-12-21T10:00:00Z"),
      }),
      "REVOKED",
    );
  });

  it("expires the acceptance link seven days after the invitation", () => {
    assert.equal(COLLABORATOR_INVITATION_TTL_DAYS, 7);
    const invitedAt = new Date("2026-12-14T12:00:00.000Z");
    assert.equal(
      collaboratorInvitationExpiresAt(invitedAt).toISOString(),
      "2026-12-21T12:00:00.000Z",
    );
  });

  it("answers whether a permission set covers what a route needs", () => {
    assert.equal(grantsInvitationPermission(["EDIT_CONTENT"], "EDIT_CONTENT"), true);
    assert.equal(grantsInvitationPermission(["EDIT_CONTENT"], "PUBLISH"), false);
    assert.equal(grantsInvitationPermission([], "PUBLISH"), false);
  });

  it("keeps at most five collaborators per invitation", () => {
    assert.equal(MAX_INVITATION_COLLABORATORS, 5);
  });
});
