import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvitationAlreadyArchivedError, InvitationNotEditableError } from "./invitation.errors";
import {
  INVITATION_STATUSES,
  type InvitationStatus,
  archive,
  assertEditable,
} from "./invitation-lifecycle";

// The invitation lifecycle Milestone 4 writes (M4 T2; S7, A3): DRAFT -> ARCHIVED and nothing else. A
// draft stays editable while it is incomplete; an archived invitation is read-only and never deleted.
// The expected statuses and messages are literals on purpose.

describe("invitation statuses", () => {
  it("lists exactly DRAFT and ARCHIVED", () => {
    assert.deepEqual([...INVITATION_STATUSES], ["DRAFT", "ARCHIVED"]);
  });
});

describe("assertEditable", () => {
  it("allows editing a DRAFT", () => {
    assert.doesNotThrow(() => assertEditable("DRAFT"));
  });

  it("refuses editing an ARCHIVED invitation with a domain error naming the status", () => {
    assert.throws(
      () => assertEditable("ARCHIVED"),
      (error: unknown) =>
        error instanceof InvitationNotEditableError &&
        error.status === "ARCHIVED" &&
        error.message === "An invitation with status ARCHIVED is read-only.",
    );
  });
});

describe("archive", () => {
  it("moves a DRAFT to ARCHIVED", () => {
    const status: InvitationStatus = "DRAFT";

    assert.equal(archive(status), "ARCHIVED");
    assert.equal(status, "DRAFT", "the input status is not changed");
  });

  it("refuses archiving an already ARCHIVED invitation", () => {
    assert.throws(
      () => archive("ARCHIVED"),
      (error: unknown) =>
        error instanceof InvitationAlreadyArchivedError &&
        error.message === "The invitation is already archived.",
    );
  });

  it("leaves the archived invitation read-only after archiving", () => {
    assert.throws(() => assertEditable(archive("DRAFT")), InvitationNotEditableError);
  });
});
