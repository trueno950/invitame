import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GuestCheckIn, InvitationResult } from "../server/invitations-api.ts";
import { CHECK_IN_COPY } from "./copy.ts";
import { checkInView } from "./guest-checkin.ts";

// The owner's check-in page (M6 G4; S4). Opening the QR URL calls the API and this module turns its answer into what
// the page shows: the guest, the seats, the confirmed party, and the first check-in instant on the invitation's clock,
// or one Spanish sentence for each refusal. The API is idempotent, so the same pass twice shows the same first
// instant instead of a second row.

const AT = "2026-11-12T15:30:00.000Z";

const CHECKED_IN: GuestCheckIn = {
  guestId: "1c9e3b4d-5e6f-4a71-9b02-3c4d5e6f7a81",
  name: "Ana Pérez",
  seats: 4,
  attendingPartySize: 2,
  checkedInAt: AT,
};

const OK: InvitationResult<GuestCheckIn> = { ok: true, value: CHECKED_IN };

describe("a registered pass", () => {
  it("shows the guest, the seats, the confirmed party, and the first instant on the invitation's clock", () => {
    const view = checkInView(OK, "America/Mexico_City");

    assert.equal(view.status, "ok");
    assert.equal(view.heading, "Ana Pérez ya está registrado");

    const labels = view.details.map((detail) => detail.label);
    assert.deepEqual(labels, [
      CHECK_IN_COPY.seatsLabel,
      CHECK_IN_COPY.partyLabel,
      CHECK_IN_COPY.checkInLabel,
    ]);
    assert.equal(view.details[0]?.value, "4");
    assert.equal(view.details[1]?.value, "2");
    // 15:30 UTC is 09:30 in Mexico City; the value is the invitation's own wall clock, never the server's.
    assert.match(view.details[2]?.value ?? "", /^12 de noviembre de 2026 a las 09:30$/);
    assert.equal(view.body, CHECK_IN_COPY.registeredBody);
  });

  it("falls back to the stored instant when the invitation's zone cannot be read", () => {
    const view = checkInView(OK, "Marte/Olympus");

    assert.equal(view.details[2]?.value, AT);
  });
});

describe("a refused pass", () => {
  it("reads each documented refusal as its own Spanish sentence", () => {
    const cases: Array<[InvitationResult<GuestCheckIn> | "unavailable", string]> = [
      [{ ok: false, failure: "guest-not-confirmed" }, CHECK_IN_COPY.notConfirmed],
      [{ ok: false, failure: "guest-not-found" }, CHECK_IN_COPY.notFound],
      [{ ok: false, failure: "qr-pass-unavailable" }, CHECK_IN_COPY.noPass],
      [{ ok: false, failure: "not-found" }, CHECK_IN_COPY.invitationNotFound],
      [{ ok: false, failure: "not-editable" }, CHECK_IN_COPY.unavailable],
      ["unavailable", CHECK_IN_COPY.unavailable],
    ];

    for (const [result, body] of cases) {
      const view = checkInView(result, "America/Mexico_City");

      assert.equal(view.status, "failed");
      assert.equal(view.body, body);
      assert.deepEqual(view.details, []);
    }
  });

  it("sends an ended session to sign in instead of pretending the pass is wrong", () => {
    assert.equal(
      checkInView({ ok: false, failure: "signed-out" }, "America/Mexico_City").status,
      "sign-in",
    );
  });

  it("never shows an API body, a token, or another guest's data", () => {
    const view = checkInView({ ok: false, failure: "guest-not-found" }, "America/Mexico_City");

    assert.equal(JSON.stringify(view).includes("AbCdEfGhIjKlMnOpQrStUv"), false);
    assert.equal(JSON.stringify(view).includes("GUEST_NOT_FOUND"), false);
  });
});
