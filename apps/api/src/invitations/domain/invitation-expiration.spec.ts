import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  invitationExpiresAt,
  isInvitationExpired,
  MILLISECONDS_PER_DAY,
} from "./invitation-expiration";

// The expiration of a published invitation (S1, S2, S3): the package's duration counted from the publication
// instant, and the read-only state a guest reaches once that instant passed. It is pure: no framework, no ORM,
// and the duration is passed in, never read from a table.

const PUBLISHED_AT = new Date("2026-11-30T18:00:00.000Z");

describe("invitationExpiresAt (S1)", () => {
  it("counts the package's days from the publication instant, to the millisecond", () => {
    assert.equal(MILLISECONDS_PER_DAY, 86_400_000);
    assert.equal(invitationExpiresAt(PUBLISHED_AT, 30).toISOString(), "2026-12-30T18:00:00.000Z");
    assert.equal(invitationExpiresAt(PUBLISHED_AT, 90).toISOString(), "2027-02-28T18:00:00.000Z");
    assert.equal(invitationExpiresAt(PUBLISHED_AT, 180).toISOString(), "2027-05-29T18:00:00.000Z");
  });

  it("answers a new instant and never mutates the publication it was given", () => {
    const expiresAt = invitationExpiresAt(PUBLISHED_AT, 1);

    assert.notEqual(expiresAt, PUBLISHED_AT);
    assert.equal(PUBLISHED_AT.toISOString(), "2026-11-30T18:00:00.000Z");
  });

  it("counts every day of a month and of a leap February, so the duration never drifts", () => {
    assert.equal(
      invitationExpiresAt(new Date("2028-01-31T00:00:00.000Z"), 29).toISOString(),
      "2028-02-29T00:00:00.000Z",
    );
  });
});

describe("isInvitationExpired (S2)", () => {
  const expiresAt = new Date("2026-12-30T18:00:00.000Z");

  it("treats the expiration instant itself as still live", () => {
    assert.equal(isInvitationExpired(expiresAt, new Date("2026-12-30T17:59:59.999Z")), false);
    assert.equal(isInvitationExpired(expiresAt, expiresAt), false);
  });

  it("expires the invitation one millisecond after the instant", () => {
    assert.equal(isInvitationExpired(expiresAt, new Date("2026-12-30T18:00:00.001Z")), true);
  });

  it("never expires an invitation the database stores without an instant", () => {
    assert.equal(isInvitationExpired(null, new Date("2099-01-01T00:00:00.000Z")), false);
  });
});
