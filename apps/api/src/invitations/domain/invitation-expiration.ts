// The expiration of a published invitation (S1, S2, S3). A package buys a duration in days; the invitation lives
// that long from its publication instant and then stays visible read-only while its RSVP closes. There is no
// extension in the MVP (S3), so nothing here can lengthen an expiry: a re-publication after an unpublish counts
// from the new publication instead. The rules are pure: no framework, no ORM, and no clock of their own.

/** The milliseconds in one day; a duration is counted in whole days, never in months or calendar units. */
export const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * The instant a publication expires: exactly `durationDays` days after `publishedAt`, to the millisecond. The
 * duration comes from the invitation's pinned package, which the storage layer reads inside the write; a stored
 * duration is a positive INTEGER (the column default and the CHECK constraint keep it so), so no caller has to
 * re-guard it here.
 */
export function invitationExpiresAt(publishedAt: Date, durationDays: number): Date {
  return new Date(publishedAt.getTime() + durationDays * MILLISECONDS_PER_DAY);
}

/**
 * Whether the invitation is past its expiry at `now` (S2). The expiry instant itself is still live, the same way a
 * published invitation is still readable at the end of the day it expires: only the millisecond after it is expired.
 * A row the database stores without an expiry never expires, which keeps every invitation published before the
 * rule existed readable.
 */
export function isInvitationExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && now.getTime() > expiresAt.getTime();
}
