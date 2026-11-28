import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HttpException, HttpStatus } from "@nestjs/common";

import { InvitationNotEditableError } from "../domain/invitation.errors";
import {
  InvalidInvitationPasswordError,
  InvitationPasswordNotAvailableError,
  InvitationUnlockRateLimitedError,
} from "../application/invitation-password.errors";
import {
  INVITATION_PASSWORD_REJECTED_RESPONSE,
  invitationLocked,
  mapInvitationPasswordError,
  mapInvitationUnlockError,
  orInvitationPasswordState,
  orInvitationUnlocked,
  toInvitationPasswordStateResponse,
} from "./invitation-password.response";

// The REST boundary of the access-code feature (F13; S2.13, L18.1-L18.3): the owner's answer states only whether a code is
// set and its version, the locked answer carries only the display name, and the unlock refusals share one neutral body
// that differs only in status. Every case here is a pure mapping, so each answer is observed exactly.

describe("the owner's access-code answers (L18.1, L18.5)", () => {
  it("answers whether a code is set and the version, and never the code or a hash", () => {
    assert.deepEqual(
      toInvitationPasswordStateResponse({ passwordProtected: true, passwordVersion: 3 }),
      {
        passwordProtected: true,
        passwordVersion: 3,
      },
    );
    const body = JSON.stringify(
      toInvitationPasswordStateResponse({ passwordProtected: false, passwordVersion: 4 }),
    );
    assert.equal(body.includes("scrypt"), false);
    assert.equal(body.includes("password"), true, "the field name, never a value of the code");
  });

  it("answers the owner-facing 404 for an id that names nothing or another owner's invitation (A4)", () => {
    assert.throws(
      () => orInvitationPasswordState(null),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.NOT_FOUND &&
        JSON.stringify(error.getResponse()) === JSON.stringify({ code: "INVITATION_NOT_FOUND" }),
    );
    assert.deepEqual(orInvitationPasswordState({ passwordProtected: true, passwordVersion: 1 }), {
      passwordProtected: true,
      passwordVersion: 1,
    });
  });

  it("maps a refused value to 400 with its issues and a withdrawn key to 409 (L18.1, L18.5)", () => {
    assert.throws(
      () =>
        mapInvitationPasswordError(
          new InvalidInvitationPasswordError(["password must be a string"]),
        ),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.BAD_REQUEST &&
        JSON.stringify(error.getResponse()) ===
          JSON.stringify({
            code: "INVALID_INVITATION_PASSWORD",
            issues: ["password must be a string"],
          }),
    );
    assert.throws(
      () => mapInvitationPasswordError(new InvitationPasswordNotAvailableError()),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.CONFLICT &&
        JSON.stringify(error.getResponse()) ===
          JSON.stringify({ code: "PASSWORD_PROTECTION_NOT_AVAILABLE" }),
    );
  });

  it("leaves the ownership, archived, and id-format answers to the invitation mapper (A2, A4)", () => {
    assert.throws(
      () => mapInvitationPasswordError(new InvitationNotEditableError("ARCHIVED")),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.CONFLICT &&
        JSON.stringify(error.getResponse()) === JSON.stringify({ code: "INVITATION_NOT_EDITABLE" }),
    );
  });
});

describe("the locked answer (L18.2, L18.3)", () => {
  it("is 423 and carries the lock state and the display name, and nothing else", () => {
    assert.throws(
      () => invitationLocked("Ana y Luis"),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.LOCKED &&
        JSON.stringify(error.getResponse()) ===
          JSON.stringify({ code: "INVITATION_LOCKED", displayName: "Ana y Luis" }),
    );
    assert.throws(
      () => invitationLocked(null),
      (error: unknown) =>
        error instanceof HttpException &&
        JSON.stringify(error.getResponse()) ===
          JSON.stringify({ code: "INVITATION_LOCKED", displayName: null }),
    );
  });
});

describe("the unlock answers (L18.2, L18.3)", () => {
  it("answers the token and its expiry on success", () => {
    const expiresAt = new Date("2027-01-15T10:00:00.000Z");
    assert.deepEqual(
      orInvitationUnlocked({ status: "unlocked", token: "invaccess1.3.1.abc", expiresAt }),
      { accessToken: "invaccess1.3.1.abc", expiresAt: "2027-01-15T10:00:00.000Z" },
    );
  });

  it("answers the neutral refusal for a rejected attempt, with no hint about which refusal it was", () => {
    assert.throws(
      () => orInvitationUnlocked({ status: "rejected" }),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.UNAUTHORIZED &&
        JSON.stringify(error.getResponse()) ===
          JSON.stringify(INVITATION_PASSWORD_REJECTED_RESPONSE),
    );
  });

  it("answers the same body with 429 when the attempt is over its cap (L18.3)", () => {
    assert.throws(
      () => mapInvitationUnlockError(new InvitationUnlockRateLimitedError()),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS &&
        JSON.stringify(error.getResponse()) ===
          JSON.stringify(INVITATION_PASSWORD_REJECTED_RESPONSE),
    );
    // The refusal body carries no count, no remaining attempts, and no code of the invitation.
    assert.deepEqual(Object.keys(INVITATION_PASSWORD_REJECTED_RESPONSE), ["code"]);
  });

  it("rethrows a store failure instead of disguising it as a refused code", () => {
    const failure = new Error("the store is down");
    assert.throws(() => mapInvitationUnlockError(failure), failure);
  });
});
