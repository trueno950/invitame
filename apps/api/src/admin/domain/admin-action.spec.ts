import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import {
  ADMIN_ACTION,
  ADMIN_ACTION_ACTOR_ISSUE,
  ADMIN_ACTION_NOTE_LENGTH_ISSUE,
  ADMIN_ACTION_NOTE_REQUIRED_ISSUE,
  ADMIN_ACTION_NOTE_TYPE_ISSUE,
  ADMIN_ACTION_REASON,
  ADMIN_ACTION_REASON_ISSUE,
  ADMIN_ACTION_TARGET_COUNT_ISSUE,
  ADMIN_ACTION_TARGET_TYPE_ISSUE,
  ADMIN_ACTION_TYPE_ISSUE,
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  adminActionTarget,
  isAdminActionReason,
  isAdminActionType,
  validateAdminActionEntry,
} from "./admin-action";

// The administrator audit entry (M9 T6; S4, S6, L9). It is pure: no framework, no ORM, no clock, and no table. The
// rules below are the ones the migration's CHECK constraints restate, so a value the domain accepts is a value the
// database can store and a value it refuses never reaches the table.

const actor = "6f0f3ad2-2f27-4a4d-9f8c-6ed9a4cbb0a5";
const targetUser = "b0f6a1a4-6f1b-4a9a-8c25-31b6d0e0f3d4";
const invitation = "0f1c7f0e-8c3e-4c1f-9d43-5b0f2c4a6e11";

function issuesOf(result: ReturnType<typeof validateAdminActionEntry>): string | null {
  return result.ok ? null : result.issue;
}

describe("the administrator audit entry (M9 T6; S4, S6, L9)", () => {
  it("accepts each state-changing action with exactly the target it names", () => {
    for (const [action, target] of [
      [ADMIN_ACTION.INVITATION_UNPUBLISHED, { invitationId: invitation }],
      [ADMIN_ACTION.ACCOUNT_DISABLED, { targetUserId: targetUser }],
      [ADMIN_ACTION.ACCOUNT_REACTIVATED, { targetUserId: targetUser }],
      [ADMIN_ACTION.SIGN_IN_CODE_RESENT, { targetUserId: targetUser }],
    ] as const) {
      const result = validateAdminActionEntry({
        adminUserId: actor,
        action,
        reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
        ...target,
      });

      assert.ok(result.ok, `${action} is accepted`);
      assert.equal(result.value.action, action);
      assert.equal(result.value.reason, ADMIN_ACTION_REASON.OWNER_REQUEST);
      assert.equal(result.value.adminUserId, actor);
      assert.equal(result.value.note, null, "an absent note is stored as NULL");
      assert.equal(
        result.value.invitationId,
        "invitationId" in target ? target.invitationId : null,
      );
      assert.equal(
        result.value.targetUserId,
        "targetUserId" in target ? target.targetUserId : null,
      );
    }
  });

  it("names the target of each action", () => {
    assert.equal(adminActionTarget(ADMIN_ACTION.INVITATION_UNPUBLISHED), "invitation");
    assert.equal(adminActionTarget(ADMIN_ACTION.ACCOUNT_DISABLED), "user");
    assert.equal(adminActionTarget(ADMIN_ACTION.ACCOUNT_REACTIVATED), "user");
    assert.equal(adminActionTarget(ADMIN_ACTION.SIGN_IN_CODE_RESENT), "user");
  });

  it("trims the note and turns a blank one into no note at all", () => {
    const result = validateAdminActionEntry({
      adminUserId: actor,
      action: ADMIN_ACTION.ACCOUNT_DISABLED,
      reason: ADMIN_ACTION_REASON.ABUSE,
      note: "  El dueño publicó contenido prohibido.  ",
      targetUserId: targetUser,
    });
    assert.ok(result.ok);
    assert.equal(result.value.note, "El dueño publicó contenido prohibido.");

    const blank = validateAdminActionEntry({
      adminUserId: actor,
      action: ADMIN_ACTION.ACCOUNT_DISABLED,
      reason: ADMIN_ACTION_REASON.ABUSE,
      note: "   ",
      targetUserId: targetUser,
    });
    assert.ok(blank.ok);
    assert.equal(blank.value.note, null, "a note of spaces is not a note");
  });

  it("accepts the widest note and refuses one character more", () => {
    const widest = "á".repeat(ADMIN_ACTION_NOTE_MAX_LENGTH);
    assert.equal(ADMIN_ACTION_NOTE_MAX_LENGTH, 500);
    assert.ok(
      validateAdminActionEntry({
        adminUserId: actor,
        action: ADMIN_ACTION.ACCOUNT_DISABLED,
        reason: ADMIN_ACTION_REASON.OTHER,
        note: widest,
        targetUserId: targetUser,
      }).ok,
      "exactly 500 characters are accepted, counted in characters rather than bytes",
    );

    assert.equal(
      issuesOf(
        validateAdminActionEntry({
          adminUserId: actor,
          action: ADMIN_ACTION.ACCOUNT_DISABLED,
          reason: ADMIN_ACTION_REASON.OTHER,
          note: "a".repeat(ADMIN_ACTION_NOTE_MAX_LENGTH + 1),
          targetUserId: targetUser,
        }),
      ),
      ADMIN_ACTION_NOTE_LENGTH_ISSUE,
    );
  });

  it("requires a note when the reason is OTHER and accepts its absence for every other reason", () => {
    for (const note of [undefined, null, "", "   "]) {
      assert.equal(
        issuesOf(
          validateAdminActionEntry({
            adminUserId: actor,
            action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
            reason: ADMIN_ACTION_REASON.OTHER,
            note,
            invitationId: invitation,
          }),
        ),
        ADMIN_ACTION_NOTE_REQUIRED_ISSUE,
        String(note),
      );
    }

    for (const reason of [
      ADMIN_ACTION_REASON.ABUSE,
      ADMIN_ACTION_REASON.OWNER_REQUEST,
      ADMIN_ACTION_REASON.PAYMENT_ERROR,
    ]) {
      assert.ok(
        validateAdminActionEntry({
          adminUserId: actor,
          action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
          reason,
          invitationId: invitation,
        }).ok,
        `${reason} needs no note`,
      );
    }
  });

  it("refuses an action or a reason outside the closed sets", () => {
    for (const action of ["UNPUBLISHED", "invitation_unpublished", "", null, undefined, 42]) {
      assert.equal(
        issuesOf(
          validateAdminActionEntry({
            adminUserId: actor,
            action,
            reason: ADMIN_ACTION_REASON.ABUSE,
            invitationId: invitation,
          }),
        ),
        ADMIN_ACTION_TYPE_ISSUE,
        String(action),
      );
    }

    for (const reason of ["OTHER_THING", "abuse", "", null, undefined, 7]) {
      assert.equal(
        issuesOf(
          validateAdminActionEntry({
            adminUserId: actor,
            action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
            reason,
            invitationId: invitation,
          }),
        ),
        ADMIN_ACTION_REASON_ISSUE,
        String(reason),
      );
    }

    assert.equal(isAdminActionType(ADMIN_ACTION.SIGN_IN_CODE_RESENT), true);
    assert.equal(isAdminActionType("SIGN_IN_CODE_SENT"), false);
    assert.equal(isAdminActionReason(ADMIN_ACTION_REASON.OTHER), true);
    assert.equal(isAdminActionReason("otros"), false);
  });

  it("refuses a note that is not a string or null", () => {
    for (const note of [42, {}, []]) {
      assert.equal(
        issuesOf(
          validateAdminActionEntry({
            adminUserId: actor,
            action: ADMIN_ACTION.ACCOUNT_DISABLED,
            reason: ADMIN_ACTION_REASON.ABUSE,
            note,
            targetUserId: targetUser,
          }),
        ),
        ADMIN_ACTION_NOTE_TYPE_ISSUE,
        JSON.stringify(note),
      );
    }
  });

  it("requires exactly one target and refuses none or two", () => {
    const none = validateAdminActionEntry({
      adminUserId: actor,
      action: ADMIN_ACTION.ACCOUNT_DISABLED,
      reason: ADMIN_ACTION_REASON.ABUSE,
    });
    assert.equal(issuesOf(none), ADMIN_ACTION_TARGET_COUNT_ISSUE);

    const two = validateAdminActionEntry({
      adminUserId: actor,
      action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
      reason: ADMIN_ACTION_REASON.ABUSE,
      targetUserId: targetUser,
      invitationId: invitation,
    });
    assert.equal(issuesOf(two), ADMIN_ACTION_TARGET_COUNT_ISSUE);
  });

  it("refuses a target that does not belong to the action", () => {
    assert.equal(
      issuesOf(
        validateAdminActionEntry({
          adminUserId: actor,
          action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
          reason: ADMIN_ACTION_REASON.ABUSE,
          targetUserId: targetUser,
        }),
      ),
      `${ADMIN_ACTION.INVITATION_UNPUBLISHED} must target an invitation`,
    );

    for (const action of [
      ADMIN_ACTION.ACCOUNT_DISABLED,
      ADMIN_ACTION.ACCOUNT_REACTIVATED,
      ADMIN_ACTION.SIGN_IN_CODE_RESENT,
    ]) {
      assert.equal(
        issuesOf(
          validateAdminActionEntry({
            adminUserId: actor,
            action,
            reason: ADMIN_ACTION_REASON.ABUSE,
            invitationId: invitation,
          }),
        ),
        `${action} must target a user`,
        action,
      );
    }
  });

  it("refuses an actor or a target that is not a UUID", () => {
    for (const adminUserId of ["", "not-a-uuid", null, undefined, 42]) {
      assert.equal(
        issuesOf(
          validateAdminActionEntry({
            adminUserId,
            action: ADMIN_ACTION.ACCOUNT_DISABLED,
            reason: ADMIN_ACTION_REASON.ABUSE,
            targetUserId: targetUser,
          }),
        ),
        ADMIN_ACTION_ACTOR_ISSUE,
        String(adminUserId),
      );
    }

    for (const target of [{ targetUserId: "nope" }, { targetUserId: 42 }, { invitationId: [1] }]) {
      assert.equal(
        issuesOf(
          validateAdminActionEntry({
            adminUserId: actor,
            action:
              "invitationId" in target
                ? ADMIN_ACTION.INVITATION_UNPUBLISHED
                : ADMIN_ACTION.ACCOUNT_DISABLED,
            reason: ADMIN_ACTION_REASON.ABUSE,
            ...target,
          }),
        ),
        ADMIN_ACTION_TARGET_TYPE_ISSUE,
        JSON.stringify(target),
      );
    }
  });

  it("refuses a value that is not an entry at all", () => {
    for (const value of [null, undefined, "entry", 42, []]) {
      assert.equal(
        issuesOf(validateAdminActionEntry(value)),
        "entry must be an object",
        String(value),
      );
    }
  });

  it("accepts a random UUID actor, so the shape is the canonical one and not a fixture", () => {
    assert.ok(
      validateAdminActionEntry({
        adminUserId: randomUUID(),
        action: ADMIN_ACTION.ACCOUNT_REACTIVATED,
        reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
        targetUserId: randomUUID(),
      }).ok,
    );
  });
});
