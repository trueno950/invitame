# Milestone 6 — Guests, RSVP, guest list, and QR pass

Branch `feat/m6-guests-rsvp` from `feat/invitation-features-2`. Guests confirm attendance from the invitation; Deluxe
creators manage a guest list with personal links and an access QR, and check guests in at the door.

## Specs

- S1 — ROADMAP Milestone 6 outcome, verbatim: "Allow invitation owners to manage a guest list and receive trustworthy
  attendance responses." Key scope: "guest records and ownership boundaries; guest access tokens or another approved
  public access mechanism; RSVP state, party size where approved, and bounded answer fields; duplicate submission and
  expiry behavior; and notification hooks only when their provider and privacy boundaries are approved." Exit
  criteria: "Guest data cannot cross invitation ownership boundaries." "RSVP uniqueness and retry behavior are
  database-backed and tested." "Public responses do not expose administrative guest data." Non-goals: "No broad CRM,
  open guest directory, marketing automation, or guaranteed WhatsApp/email delivery is included."
- S2 — Owner (invitation-features L9), verbatim: "si dale, tienes mi autorizacion de hacer merge y autorizo cada
  revison no te detengas hasta el final para la revision visual", after the proposed order whose step 2 is
  «Confirmación de asistencia, lista de invitados y QR».
- S3 — Catalog promises: Premium includes `RSVP`; Deluxe includes `RSVP`, `GUEST_LIST`, and `QR_PASS`.
- S4 — Contract decided by the parent within S1-S3 (L1). It is security-relevant (AGENTS.md: such decisions need
  human review); the owner asked not to stop, so it ships behind an independent verification and is listed for the
  owner's review at the end:
  - **Open RSVP (package has `RSVP`, no `GUEST_LIST`).** The guest page shows «Confirma tu asistencia»: name (1-80),
    attending yes/no, party size (1 to the invitation's limit, default 4, creator-set 1-10), optional phone (bounded),
    optional message (≤ 280). Submitted through a server action without client script. Each submission is a row
    tied to the invitation; it is rate-limited per invitation and client address with the existing `RateLimit` store,
    has a honeypot field, and is refused when the invitation is not published or the RSVP deadline (optional,
    creator-set) has passed. A repeat from the same normalized name and phone within the invitation updates that
    response instead of duplicating it (database unique key), so retries are safe.
  - **Guest list (package has `GUEST_LIST`).** The creator adds guests (name, seats 1-10, optional phone, optional
    note), edits, and removes them. Each guest has a personal link `/i/<slug>/g/<token>`: a 128-bit random token
    shown once per creation or rotation, stored only as a SHA-256 hash with a unique index. The personal page greets
    the guest by name, shows their seats, and lets them confirm or decline (attending count ≤ seats) and change the
    answer until the deadline; the same answer twice is idempotent. Unknown or revoked tokens answer the friendly
    404. With a guest list, the open form is replaced by personal links.
  - **QR pass (package has `QR_PASS`).** A confirmed guest's personal page shows an access QR, generated on the server
    as SVG with a vetted library (`qrcode`, MIT), encoding a check-in URL for the creator,
    `/cuenta/invitaciones/<id>/acceso/<token>`. Opening it while signed in as the owner marks the guest checked in
    (idempotent; shows name, seats, and the time of the first check-in); anyone else gets the sign-in redirect or
    404.
  - **Creator view.** `/cuenta/invitaciones/<id>/asistencia` lists responses or guests with totals (confirmed people,
    declined, pending), check-in state, and a CSV export; all reads are owner-only.
  - **Privacy.** Public reads never return other guests' data; personal pages and check-in pages are `noindex`,
    `no-store`; no personal data in logs or URLs except the opaque token; no notifications are sent (non-goal).
  - **Data.** Additive migration(s): RSVP settings on the invitation (deadline, party limit), `Guest` (owner through
    the invitation, unique token hash), `RsvpResponse` (invitation, optional guest, normalized dedupe key, attending,
    party size, bounded fields, timestamps), check-in timestamp on the guest. Ownership enforced in the same write
    (no read-then-write races).

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| G1 | API: migration, domain, open RSVP endpoint with rate limit, RSVP settings, creator responses read, gating | S1, S3, S4 | worker | |
| G2 | API: guest list CRUD, token issue/rotation/hash lookup, personal RSVP, QR check-in | S1, S3, S4 | worker, after G1 | |
| G3 | Web: open RSVP form, creator settings and responses page with CSV | S1, S4 | worker, after G1 | |
| G4 | Web: guest list management, personal page, QR, check-in page | S1, S4 | worker, after G2 | |
| G5 | Independent verification: ownership, token handling, rate limits, privacy, migrations | S1, S4 | verify | |
| G6 | Integration: full gates, dev DB migration, browser review, docs, PR and merge | S1-S4 | inline | |

## Log

- L1 — The parent fixed contract S4 from the ROADMAP, the catalog packages, and the owner's go-ahead. The decisions
  that touch security or personal data are recorded for the owner's review at the end: token format and storage,
  open-form rate limit and dedupe, the check-in authorization, and the new `qrcode` dependency.
- L2 — G1 `9a2fcfa`, G2 `1a6b67d`, G3 `86aaef4`, G4 `2ab6005` (plus `90f6d34` playlist length fix and `95b1e61`
  RSVP key mirror). Dev and test databases migrated (`20261117120000_add_rsvp_responses`,
  `20261118120000_add_guests`). Checks at G4: API 1400 unit and 343 db-specs, web 1387 tests, both typechecks, docs,
  Biome. Browser runs covered Premium open RSVP and the Deluxe guest list, personal page, QR, idempotent check-in,
  rotation, and CSV. The G4 worker was resumed once after a provider network error. Native review was attempted
  under the owner's standing authorization and stopped with `lens_context_budget_exceeded`: the candidate is too
  large for one review and is not retryable as is. The independent verification G5 (also resumed after a network
  error) is the required check for this high-risk change. Owner-review items: the token format and storage, the
  open-form rate limit (10 per hour per address per invitation) and dedupe, the check-in authorization, the per-process
  one-time link store (multi-replica caveat), and the `qrcode` 1.5.4 dependency. The baby shower «Confirma tu
  asistencia» heading on the contact field can be confused with the RSVP card.
