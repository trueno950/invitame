import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "./invitation.errors";
import {
  INVITATION_STATUSES,
  type InvitationStatus,
  archive,
  assertEditable,
  publish,
  unpublish,
} from "./invitation-lifecycle";

// The invitation lifecycle Milestone 5 writes (M5 T2; S2, S7, A2): DRAFT, PUBLISHED, and ARCHIVED. A draft
// stays editable while it is incomplete; a published invitation stays editable live and can be unpublished
// back to DRAFT; archiving is allowed from DRAFT or PUBLISHED and is terminal. The expected statuses and
// messages are literals on purpose.

describe("invitation statuses", () => {
  it("lists exactly DRAFT, PUBLISHED, and ARCHIVED", () => {
    assert.deepEqual([...INVITATION_STATUSES], ["DRAFT", "PUBLISHED", "ARCHIVED"]);
  });
});

describe("assertEditable", () => {
  it("allows editing a DRAFT", () => {
    assert.doesNotThrow(() => assertEditable("DRAFT"));
  });

  it("allows editing a PUBLISHED invitation, whose changes are live (S7)", () => {
    assert.doesNotThrow(() => assertEditable("PUBLISHED"));
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

describe("publish", () => {
  it("moves a DRAFT to PUBLISHED without changing the input status", () => {
    const status: InvitationStatus = "DRAFT";

    assert.equal(publish(status), "PUBLISHED");
    assert.equal(status, "DRAFT", "the input status is not changed");
  });

  it("refuses publishing an already PUBLISHED invitation", () => {
    assert.throws(
      () => publish("PUBLISHED"),
      (error: unknown) =>
        error instanceof InvitationAlreadyPublishedError &&
        error.message === "The invitation is already published.",
    );
  });

  it("refuses publishing an ARCHIVED invitation, which is terminal", () => {
    assert.throws(
      () => publish("ARCHIVED"),
      (error: unknown) =>
        error instanceof InvitationAlreadyArchivedError &&
        error.message === "The invitation is already archived.",
    );
  });

  it("keeps a published invitation editable after publishing (S7)", () => {
    const published = publish("DRAFT");

    assert.equal(published, "PUBLISHED");
    assert.doesNotThrow(() => assertEditable(published));
  });
});

describe("unpublish", () => {
  it("moves a PUBLISHED invitation back to DRAFT", () => {
    const status: InvitationStatus = "PUBLISHED";

    assert.equal(unpublish(status), "DRAFT");
    assert.equal(status, "PUBLISHED", "the input status is not changed");
  });

  it("round-trips publish then unpublish back to DRAFT", () => {
    assert.equal(unpublish(publish("DRAFT")), "DRAFT");
    assert.equal(publish(unpublish("PUBLISHED")), "PUBLISHED");
  });

  it("refuses unpublishing a DRAFT that was never published", () => {
    assert.throws(
      () => unpublish("DRAFT"),
      (error: unknown) =>
        error instanceof InvitationNotPublishedError &&
        error.message === "The invitation is not published.",
    );
  });

  it("refuses unpublishing an ARCHIVED invitation, which is terminal", () => {
    assert.throws(
      () => unpublish("ARCHIVED"),
      (error: unknown) =>
        error instanceof InvitationAlreadyArchivedError &&
        error.message === "The invitation is already archived.",
    );
  });
});

describe("archive", () => {
  it("moves a DRAFT to ARCHIVED without changing the input status", () => {
    const status: InvitationStatus = "DRAFT";

    assert.equal(archive(status), "ARCHIVED");
    assert.equal(status, "DRAFT", "the input status is not changed");
  });

  it("moves a PUBLISHED invitation to ARCHIVED", () => {
    assert.equal(archive("PUBLISHED"), "ARCHIVED");
  });

  it("refuses archiving an already ARCHIVED invitation", () => {
    assert.throws(
      () => archive("ARCHIVED"),
      (error: unknown) =>
        error instanceof InvitationAlreadyArchivedError &&
        error.message === "The invitation is already archived.",
    );
  });

  it("leaves the archived invitation read-only and unpublished after archiving", () => {
    assert.throws(() => assertEditable(archive("DRAFT")), InvitationNotEditableError);
    assert.throws(() => publish(archive("DRAFT")), InvitationAlreadyArchivedError);
    assert.throws(() => unpublish(archive("PUBLISHED")), InvitationAlreadyArchivedError);
  });
});
