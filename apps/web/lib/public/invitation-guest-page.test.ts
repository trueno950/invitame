import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  PublicGuestRsvpSubmission,
  PublicGuestRsvpSubmitResult,
  PublicRsvpFeature,
} from "../server/public-invitations-api.ts";
import {
  guestGreeting,
  guestRsvpView,
  guestSeatsSentence,
  parseGuestRsvpForm,
  submitGuestRsvpForm,
} from "./invitation-guest-page.ts";
import { publicRsvpBlock } from "./invitation-rsvp.ts";

// The personal page of one guest (M6 G4; S1, S4): the greeting, the seats, the answer card bounded by those seats, and
// the request the server action makes. The API owns the deadline, the rate limit, and every bound; this module only
// decides what the page shows and which notice comes back.

const SLUG = "invitacion-k7m2qx";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const ACTION = async (): Promise<void> => {};

const GUEST_LIST: PublicRsvpFeature = {
  mode: "guest-list",
  deadline: "2026-12-01T18:00:00.000Z",
  partyLimit: 4,
  qrPass: true,
};

const AFTER_DEADLINE = new Date("2026-12-02T00:00:00.000Z");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

const ANSWER = {
  slug: SLUG,
  token: TOKEN,
  attending: "si",
  partySize: "2",
  message: "  Con mucho gusto ",
};

interface Call {
  slug: string;
  token: string;
  submission: PublicGuestRsvpSubmission;
  options: { clientAddress?: string } | undefined;
}

function fakeClient(result: PublicGuestRsvpSubmitResult, calls: Call[]) {
  return {
    async submitGuestRsvp(
      slug: string,
      token: string,
      submission: PublicGuestRsvpSubmission,
      options?: { clientAddress?: string },
    ): Promise<PublicGuestRsvpSubmitResult> {
      calls.push({ slug, token, submission, options });
      return result;
    },
  };
}

describe("greeting", () => {
  it("greets the guest by the first name they were registered with", () => {
    assert.equal(guestGreeting("Ana Pérez"), "Hola, Ana");
    assert.equal(guestGreeting("  Ana   María  Ruiz "), "Hola, Ana");
    assert.equal(guestGreeting("Ana"), "Hola, Ana");
  });

  it("says how many seats the guest has, in Spanish and in the singular when it is one", () => {
    assert.equal(guestSeatsSentence(4), "Tienes 4 lugares reservados a tu nombre.");
    assert.equal(guestSeatsSentence(1), "Tienes 1 lugar reservado a tu nombre.");
  });
});

describe("the answer card", () => {
  it("offers one party size per seat the guest has and the answer they gave", () => {
    const view = guestRsvpView({
      slug: SLUG,
      token: TOKEN,
      guest: {
        name: "Ana",
        seats: 3,
        response: { attending: false, partySize: 0, message: null },
        qrPass: true,
      },
      rsvp: GUEST_LIST,
      action: ACTION,
      now: new Date("2026-11-20T12:00:00.000Z"),
    });

    assert.deepEqual(view, {
      slug: SLUG,
      token: TOKEN,
      seats: 3,
      partySizes: [1, 2, 3],
      answer: { attending: false, partySize: 0 },
      message: "",
      deadline: "2026-12-01T18:00:00.000Z",
      closed: false,
      action: ACTION,
    });
  });

  it("shows the closing note instead of the form once the deadline passed, and keeps the last answer", () => {
    const view = guestRsvpView({
      slug: SLUG,
      token: TOKEN,
      guest: {
        name: "Ana",
        seats: 2,
        response: { attending: true, partySize: 2, message: "Allí estaré" },
        qrPass: false,
      },
      rsvp: GUEST_LIST,
      action: ACTION,
      now: AFTER_DEADLINE,
    });

    assert.equal(view?.closed, true);
    assert.deepEqual(view?.answer, { attending: true, partySize: 2 });
    assert.equal(view?.message, "Allí estaré");
  });

  it("shows nothing to answer with when the invitation does not take personal answers", () => {
    const guest = { name: "Ana", seats: 2, response: null, qrPass: false };

    assert.equal(
      guestRsvpView({
        slug: SLUG,
        token: TOKEN,
        guest,
        rsvp: { mode: "open", deadline: null, partyLimit: 4, qrPass: false },
        action: ACTION,
      }),
      undefined,
    );
    assert.equal(
      guestRsvpView({
        slug: SLUG,
        token: TOKEN,
        guest,
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
        action: ACTION,
      }),
      undefined,
    );
  });

  it("closes the personal card when the invitation expired (S2, T5)", () => {
    const view = guestRsvpView({
      slug: SLUG,
      token: TOKEN,
      guest: {
        name: "Ana",
        seats: 2,
        response: { attending: true, partySize: 2, message: "Allí estaré" },
        qrPass: true,
      },
      rsvp: GUEST_LIST,
      action: ACTION,
      // Still before the creator's deadline: the expiry is what closed the answers (S2).
      now: new Date("2026-11-30T12:00:00.000Z"),
      expired: true,
    });

    assert.equal(view?.closed, true);
    // The card states no deadline, and the answer the guest already gave stays readable.
    assert.equal(view?.deadline, null);
    assert.deepEqual(view?.answer, { attending: true, partySize: 2 });
    assert.equal(view?.message, "Allí estaré");
  });

  it("leaves the open form of the public page exactly as it was", () => {
    // The guest list replaces the open form; it never adds a second one (G3 preserved).
    assert.equal(publicRsvpBlock(GUEST_LIST, SLUG, ACTION), undefined);
    assert.notEqual(publicRsvpBlock({ ...GUEST_LIST, mode: "open" }, SLUG, ACTION), undefined);
  });
});

describe("the submitted answer", () => {
  it("reads a yes with the party it names and a trimmed optional message", () => {
    assert.deepEqual(parseGuestRsvpForm(form(ANSWER)), {
      ok: true,
      slug: SLUG,
      token: TOKEN,
      value: { attending: true, partySize: 2, message: "Con mucho gusto" },
    });
  });

  it("reads a no with no party at all", () => {
    assert.deepEqual(parseGuestRsvpForm(form({ slug: SLUG, token: TOKEN, attending: "no" })), {
      ok: true,
      slug: SLUG,
      token: TOKEN,
      value: { attending: false, partySize: 0, message: null },
    });
  });

  it("refuses a form whose slug or token cannot be one, without naming a page", () => {
    assert.deepEqual(parseGuestRsvpForm(form({ ...ANSWER, slug: "Invitacion" })), {
      ok: false,
      slug: undefined,
      token: undefined,
    });
    assert.deepEqual(parseGuestRsvpForm(form({ ...ANSWER, token: "corto" })), {
      ok: false,
      slug: undefined,
      token: undefined,
    });
  });

  it("refuses a radio that is neither answer, and a party the select cannot produce", () => {
    const slug = SLUG;
    const token = TOKEN;

    for (const entries of [
      { ...ANSWER, attending: "quizá" },
      { ...ANSWER, attending: "" },
      { ...ANSWER, partySize: "0" },
      { ...ANSWER, partySize: "11" },
      { ...ANSWER, partySize: "dos" },
      { ...ANSWER, partySize: "" },
    ]) {
      assert.deepEqual(
        parseGuestRsvpForm(form(entries)),
        { ok: false, slug, token },
        JSON.stringify(entries),
      );
    }
  });
});

describe("the answer's request", () => {
  it("sends the answer with the guest's address and returns to the personal page", async () => {
    const calls: Call[] = [];
    const target = await submitGuestRsvpForm(fakeClient({ ok: true }, calls), form(ANSWER), {
      clientAddress: "203.0.113.9",
    });

    assert.equal(target, `/i/${SLUG}/g/${TOKEN}?rsvp=received`);
    assert.deepEqual(calls, [
      {
        slug: SLUG,
        token: TOKEN,
        submission: { attending: true, partySize: 2, message: "Con mucho gusto" },
        options: { clientAddress: "203.0.113.9" },
      },
    ]);
  });

  it("sends no address option when the request carried none", async () => {
    const calls: Call[] = [];
    await submitGuestRsvpForm(fakeClient({ ok: true }, calls), form(ANSWER), {
      clientAddress: undefined,
    });

    assert.deepEqual(calls[0]?.options, {});
  });

  it("maps every refusal to one Spanish notice of the guest's own page", async () => {
    const cases = [
      ["invalid", "invalid"],
      ["not-open", "closed"],
      ["rate-limited", "limited"],
      ["not-found", "unavailable"],
    ] as const;

    for (const [failure, code] of cases) {
      const calls: Call[] = [];
      const target = await submitGuestRsvpForm(
        fakeClient({ ok: false, failure }, calls),
        form(ANSWER),
        { clientAddress: undefined },
      );

      assert.equal(target, `/i/${SLUG}/g/${TOKEN}?rsvp=${code}`);
    }
  });

  it("answers the outage notice when the call throws, and sends nothing for a form it refuses", async () => {
    const failing = {
      async submitGuestRsvp(): Promise<PublicGuestRsvpSubmitResult> {
        throw new Error("red caída");
      },
    };

    assert.equal(
      await submitGuestRsvpForm(failing, form(ANSWER), { clientAddress: undefined }),
      `/i/${SLUG}/g/${TOKEN}?rsvp=unavailable`,
    );

    const calls: Call[] = [];
    assert.equal(
      await submitGuestRsvpForm(
        fakeClient({ ok: true }, calls),
        form({ ...ANSWER, token: "corto" }),
        {
          clientAddress: undefined,
        },
      ),
      "/",
    );
    assert.deepEqual(calls, []);
  });
});
