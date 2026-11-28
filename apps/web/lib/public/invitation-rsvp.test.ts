import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { RSVP_NOTICE_COPY } from "../customer/copy.ts";
import type {
  PublicRsvpFeature,
  PublicRsvpSubmission,
  PublicRsvpSubmitResult,
} from "../server/public-invitations-api.ts";
import {
  isRsvpClosed,
  parseRsvpForm,
  publicRsvpBlock,
  RSVP_NOTICE_PARAM,
  rsvpNotice,
  rsvpNoticeMessage,
  rsvpResultTarget,
  submitPublicRsvpForm,
} from "./invitation-rsvp.ts";

// The web side of the guest's open RSVP form (M6 G3; S1, S4): when the block shows, what the submitted form
// becomes, which notice the page reads on the way back, and which request the server action makes. The API owns
// every validation and the rate limit; this module only maps.

const SLUG = "invitacion-k7m2qx";
const ACTION = async (): Promise<void> => {};

const OPEN: PublicRsvpFeature = {
  mode: "open",
  deadline: "2026-12-01T18:00:00.000Z",
  partyLimit: 4,
  qrPass: false,
};

const CLOSED_BY_TIME = new Date("2026-12-02T00:00:00.000Z");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

const ANSWER = {
  slug: SLUG,
  name: "  Ana   Pérez ",
  attending: "si",
  partySize: "2",
  phone: "  55 1234 5678 ",
  message: "  Con mucho gusto  ",
  honeypot: "",
};

interface Call {
  slug: string;
  submission: PublicRsvpSubmission;
  options: { clientAddress?: string } | undefined;
}

function fakeClient(result: PublicRsvpSubmitResult | Error = { ok: true }) {
  const calls: Call[] = [];

  return {
    calls,
    async submitRsvp(
      slug: string,
      submission: PublicRsvpSubmission,
      options?: { clientAddress?: string },
    ): Promise<PublicRsvpSubmitResult> {
      calls.push({ slug, submission, options });
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
}

describe("publicRsvpBlock", () => {
  it("offers the form only when the invitation accepts open answers", () => {
    assert.deepEqual(publicRsvpBlock(OPEN, SLUG, ACTION), {
      slug: SLUG,
      partyLimit: 4,
      deadline: OPEN.deadline,
      closed: false,
      action: ACTION,
    });

    // A guest list replaces the open form with personal links (S4), and a package without RSVP has neither.
    for (const mode of ["guest-list", null] as const) {
      assert.equal(publicRsvpBlock({ ...OPEN, mode }, SLUG, ACTION), undefined, String(mode));
    }
  });

  it("closes the block once the deadline has passed, and keeps it open up to the deadline's instant", () => {
    assert.equal(publicRsvpBlock(OPEN, SLUG, ACTION, CLOSED_BY_TIME)?.closed, true);
    assert.equal(
      publicRsvpBlock(OPEN, SLUG, ACTION, new Date("2026-12-01T18:00:00.000Z"))?.closed,
      false,
    );
    // Without a deadline the invitation accepts answers until its owner publishes it away or archives it.
    assert.equal(
      publicRsvpBlock({ ...OPEN, deadline: null }, SLUG, ACTION, CLOSED_BY_TIME)?.closed,
      false,
    );
  });

  it("keeps the action it was given, so the form posts to the server action", () => {
    assert.equal(publicRsvpBlock(OPEN, SLUG, ACTION)?.action, ACTION);
  });

  it("closes the block on an expired invitation, without naming a deadline that may still be ahead (S2, T5)", () => {
    const beforeBoth = new Date("2026-11-30T12:00:00.000Z");

    // The deadline alone keeps the answer open; the expiry is what closes it (S2).
    assert.equal(isRsvpClosed(null, beforeBoth), false);
    assert.equal(isRsvpClosed(null, beforeBoth, true), true);

    const block = publicRsvpBlock(OPEN, SLUG, ACTION, beforeBoth, true);

    assert.equal(block?.closed, true);
    // The creator's deadline is still ahead, so the closed card states no date: it closed by expiry (S2).
    assert.equal(block?.deadline, null);
    assert.equal(publicRsvpBlock(OPEN, SLUG, ACTION, beforeBoth)?.deadline, OPEN.deadline);
  });
});

describe("parseRsvpForm", () => {
  it("reads one accepted answer, trimming the text fields", () => {
    assert.deepEqual(parseRsvpForm(form(ANSWER)), {
      ok: true,
      slug: SLUG,
      value: {
        name: "Ana   Pérez",
        attending: true,
        partySize: 2,
        companions: [{ name: "", child: false }],
        dietaryNotes: null,
        phone: "55 1234 5678",
        message: "Con mucho gusto",
        honeypot: "",
      },
    });
  });

  it("reads the companion rows the party covers and the dietary notes (F3; L6.1, L6.3)", () => {
    const parsed = parseRsvpForm(
      form({
        ...ANSWER,
        partySize: "3",
        "companionName-1": "  Jorge   Gómez ",
        "companionChild-2": "on",
        "companionName-2": "Sofía Gómez",
        "companionName-3": "Fuera de la fiesta",
        dietaryNotes: "  Sofía es alérgica a la nuez  ",
      }),
    );

    assert.deepEqual(parsed.ok && parsed.value.companions, [
      { name: "Jorge   Gómez", child: false },
      { name: "Sofía Gómez", child: true },
    ]);
    assert.equal(parsed.ok && parsed.value.dietaryNotes, "Sofía es alérgica a la nuez");
  });

  it("names no companion when the guest will not attend (F3; L6.1)", () => {
    const parsed = parseRsvpForm(
      form({ ...ANSWER, attending: "no", partySize: "2", "companionName-1": "Jorge" }),
    );

    assert.deepEqual(parsed.ok && parsed.value.companions, []);
  });

  it("stores no phone and no message when the guest leaves them empty", () => {
    const parsed = parseRsvpForm(form({ ...ANSWER, phone: " ", message: "" }));

    assert.deepEqual(parsed.ok && parsed.value, {
      name: "Ana   Pérez",
      attending: true,
      partySize: 2,
      companions: [{ name: "", child: false }],
      dietaryNotes: null,
      phone: null,
      message: null,
      honeypot: "",
    });
  });

  it("names no party when the guest will not attend, whatever the select carried", () => {
    const parsed = parseRsvpForm(form({ ...ANSWER, attending: "no", partySize: "4" }));

    assert.equal(parsed.ok && parsed.value.attending, false);
    assert.equal(parsed.ok && parsed.value.partySize, 0);
  });

  it("carries the honeypot through untouched, so the API can drop a filled form", () => {
    const parsed = parseRsvpForm(form({ ...ANSWER, honeypot: "bot" }));

    assert.equal(parsed.ok && parsed.value.honeypot, "bot");
  });

  it("refuses a form without a real slug, without a name, without an answer, or with an unusable party", () => {
    const broken: Array<Record<string, string>> = [
      { ...ANSWER, slug: "" },
      { ...ANSWER, slug: "Invitacion K7" },
      { ...ANSWER, name: "   " },
      { ...ANSWER, attending: "" },
      { ...ANSWER, attending: "maybe" },
      { ...ANSWER, partySize: "0" },
      { ...ANSWER, partySize: "11" },
      { ...ANSWER, partySize: "dos" },
      { ...ANSWER, partySize: "1.5" },
    ];

    for (const entries of broken) {
      assert.equal(parseRsvpForm(form(entries)).ok, false, JSON.stringify(entries));
    }
  });
});

describe("submitPublicRsvpForm", () => {
  it("sends the answer with the forwarded address and comes back with the thank-you notice", async () => {
    const client = fakeClient();

    const target = await submitPublicRsvpForm(client, form(ANSWER), {
      clientAddress: "203.0.113.7",
    });

    assert.equal(target, rsvpResultTarget(SLUG, "received"));
    assert.equal(target, `/i/${SLUG}?rsvp=received`);
    assert.deepEqual(client.calls, [
      {
        slug: SLUG,
        submission: {
          name: "Ana   Pérez",
          attending: true,
          partySize: 2,
          companions: [{ name: "", child: false }],
          dietaryNotes: null,
          phone: "55 1234 5678",
          message: "Con mucho gusto",
          honeypot: "",
        },
        options: { clientAddress: "203.0.113.7" },
      },
    ]);
  });

  it("sends no address at all when the request carried none", async () => {
    const client = fakeClient();

    await submitPublicRsvpForm(client, form(ANSWER), { clientAddress: undefined });

    // Nothing is forwarded, so the API falls back on the address it sees for the web's own hop.
    assert.deepEqual(client.calls[0]?.options, {});
  });

  it("maps every refusal of the API to one of the page's own notices", async () => {
    const cases: Array<[PublicRsvpSubmitResult, string]> = [
      [{ ok: false, failure: "invalid" }, "invalid"],
      [{ ok: false, failure: "not-open" }, "closed"],
      [{ ok: false, failure: "rate-limited" }, "limited"],
      [{ ok: false, failure: "locked" }, "locked"],
      [{ ok: false, failure: "not-found" }, "unavailable"],
    ];

    for (const [result, code] of cases) {
      assert.equal(
        await submitPublicRsvpForm(fakeClient(result), form(ANSWER), { clientAddress: undefined }),
        rsvpResultTarget(SLUG, code as "invalid"),
        JSON.stringify(result),
      );
    }
  });

  it("comes back to the invitation with the password notice when the invitation is locked (F13; L18.2)", async () => {
    const target = await submitPublicRsvpForm(
      fakeClient({ ok: false, failure: "locked" }),
      form(ANSWER),
      { clientAddress: undefined },
    );

    assert.equal(target, rsvpResultTarget(SLUG, "locked"));
    assert.equal(target, `/i/${SLUG}?rsvp=locked`);
    assert.deepEqual(rsvpNotice({ rsvp: "locked" }), {
      code: "locked",
      message: "Esta invitación pide contraseña. Vuelve a abrirla para escribirla.",
    });
  });

  it("answers an outage with its own notice instead of failing the guest's page", async () => {
    const outage = new Error("unreachable");

    assert.equal(
      await submitPublicRsvpForm(fakeClient(outage), form(ANSWER), { clientAddress: undefined }),
      rsvpResultTarget(SLUG, "unavailable"),
    );
  });

  it("makes no call for a form it cannot read, and still comes back to the page with an error", async () => {
    const client = fakeClient();

    assert.equal(
      await submitPublicRsvpForm(client, form({ ...ANSWER, name: "" }), {
        clientAddress: undefined,
      }),
      rsvpResultTarget(SLUG, "invalid"),
    );
    assert.equal(
      await submitPublicRsvpForm(client, form({ ...ANSWER, slug: "no es un slug" }), {
        clientAddress: undefined,
      }),
      "/",
    );
    assert.deepEqual(client.calls, []);
  });
});

describe("the guest's personal data", () => {
  it("never passes through a log: this module, which carries the answer, has none", () => {
    // The action's failure line names only the error class and the client's kind (`public-api.ts`), so the one
    // place a name, a phone, or a message travels is the request the API authorizes.
    const source = readFileSync(new URL("./invitation-rsvp.ts", import.meta.url), "utf8");

    assert.doesNotMatch(source, /console\./);
    assert.doesNotMatch(source, /\blog\(|logger|process\.stdout|process\.stderr/);
  });
});

describe("the RSVP notice of the guest page", () => {
  it("keeps the code next to its sentence, so a success and a failure render differently", () => {
    assert.deepEqual(rsvpNotice({ [RSVP_NOTICE_PARAM]: "received" }), {
      code: "received",
      message: RSVP_NOTICE_COPY.received,
    });
    assert.deepEqual(rsvpNotice({ [RSVP_NOTICE_PARAM]: "limited" })?.code, "limited");
    assert.equal(rsvpNotice({ [RSVP_NOTICE_PARAM]: "otro" }), undefined);
  });

  it("reads the one notice the API outcome named", () => {
    assert.equal(
      rsvpNoticeMessage({ [RSVP_NOTICE_PARAM]: "received" }),
      "¡Gracias! Recibimos tu respuesta.",
    );
    for (const code of ["invalid", "closed", "limited", "unavailable"]) {
      const message = rsvpNoticeMessage({ [RSVP_NOTICE_PARAM]: code });

      assert.equal(typeof message, "string", code);
      assert.notEqual(message, "", code);
    }
  });

  it("shows nothing for a code it does not know or a repeated parameter", () => {
    for (const value of [undefined, "", "ok", "RECEIVED", ["received", "invalid"], 7, null]) {
      assert.equal(
        rsvpNoticeMessage({ [RSVP_NOTICE_PARAM]: value as string | string[] | undefined }),
        undefined,
        JSON.stringify(value),
      );
    }
    assert.equal(rsvpNoticeMessage({}), undefined);
  });
});
