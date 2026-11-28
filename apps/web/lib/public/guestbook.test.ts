import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GUESTBOOK_NOTICE_COPY } from "../customer/copy.ts";
import {
  GUESTBOOK_NOTICE_PARAM,
  type GuestbookNoticeCode,
  guestbookNotice,
  guestbookResultTarget,
  parseGuestbookForm,
  publicGuestbookBlock,
  submitPublicGuestbookForm,
} from "./guestbook.ts";

// The guestbook form of `/i/[slug]` (F7; S2.7, L10.3, L10.5). The API owns every validation, the rate limit, the
// honeypot, and the expiry; this module only decides whether the wall shows, what the submitted form becomes, which
// request the server action sends with the guest's address, and which notice the page reads on the way back. These
// tests drive it through that public surface only.

const SLUG = "invitacion-k7m2qx";
const ENTRIES = [
  { authorName: "Sofía y Jorge", message: "Nos vemos en la pista." },
  { authorName: "Tía Rosa", message: "¡Que sea un día hermoso!" },
];

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(values)) {
    form.set(name, value);
  }
  return form;
}

describe("the guestbook wall of one guest page (F7; L10.5)", () => {
  it("shows the entries the API answered, newest first, with the form below them", () => {
    const action = async () => {};
    const block = publicGuestbookBlock(ENTRIES, SLUG, action, false);

    assert.deepEqual(block, { slug: SLUG, entries: ENTRIES, closed: false, action });
  });

  it("keeps the wall and closes it when the invitation expired", () => {
    const block = publicGuestbookBlock(ENTRIES, SLUG, undefined, true);

    assert.equal(block?.closed, true);
    assert.deepEqual(block?.entries, ENTRIES);
  });

  it("shows an empty wall rather than nothing for a granted package with no message", () => {
    assert.deepEqual(publicGuestbookBlock([], SLUG, undefined, false)?.entries, []);
  });

  it("shows no wall at all when the package does not grant it, or the slug names nothing", () => {
    assert.equal(publicGuestbookBlock(null, SLUG, undefined, false), undefined);
    assert.equal(
      publicGuestbookBlock(ENTRIES, "Invitacion-Malformed", undefined, false),
      undefined,
    );
  });
});

describe("the guestbook form (F7; L10.1, L10.3)", () => {
  it("parses the trimmed name and message and the hidden honeypot", () => {
    assert.deepEqual(
      parseGuestbookForm(
        formOf({
          slug: SLUG,
          authorName: "  Tía   Rosa ",
          message: "  ¡Felicidades!\nNos vemos.  ",
          honeypot: "",
        }),
      ),
      {
        ok: true,
        slug: SLUG,
        value: {
          authorName: "Tía   Rosa",
          message: "¡Felicidades!\nNos vemos.",
          honeypot: "",
        },
      },
    );
  });

  it("refuses a form that names no invitation, and answers the page of the one it named when a field is empty", () => {
    assert.deepEqual(parseGuestbookForm(formOf({ authorName: "Rosa", message: "Hola" })), {
      ok: false,
      slug: undefined,
    });
    assert.deepEqual(
      parseGuestbookForm(formOf({ slug: SLUG, authorName: "  ", message: "Hola" })),
      {
        ok: false,
        slug: SLUG,
      },
    );
    assert.deepEqual(parseGuestbookForm(formOf({ slug: SLUG, authorName: "Rosa", message: " " })), {
      ok: false,
      slug: SLUG,
    });
  });

  it("keeps the honeypot value a bot filled, so the API can drop it like a stored signature", () => {
    const parsed = parseGuestbookForm(
      formOf({ slug: SLUG, authorName: "Rosa", message: "Hola", honeypot: "https://spam.example" }),
    );

    assert.equal(parsed.ok && parsed.value.honeypot, "https://spam.example");
  });
});

describe("the notice of a signature (F7; L10.3)", () => {
  it("writes the code of every outcome into its own query", () => {
    for (const code of Object.keys(GUESTBOOK_NOTICE_COPY) as GuestbookNoticeCode[]) {
      assert.equal(
        guestbookResultTarget(SLUG, code),
        `/i/${SLUG}?${GUESTBOOK_NOTICE_PARAM}=${code}`,
      );
    }
  });

  it("reads back only a code the page knows, with its Spanish sentence", () => {
    assert.deepEqual(guestbookNotice({ [GUESTBOOK_NOTICE_PARAM]: "signed" }), {
      code: "signed",
      message: GUESTBOOK_NOTICE_COPY.signed,
    });
    assert.equal(guestbookNotice({ [GUESTBOOK_NOTICE_PARAM]: "PAGADA" }), undefined);
    assert.equal(guestbookNotice({}), undefined);
  });
});

describe("one submitted signature through the server action (F7; L10.3)", () => {
  const address = "198.18.0.71";

  it("sends the parsed signature with the guest's address and redirects to the thank-you notice", async () => {
    const sent: unknown[] = [];
    const target = await submitPublicGuestbookForm(
      {
        submitGuestbook: async (slug, submission, options) => {
          sent.push({ slug, submission, options });
          return { ok: true };
        },
      },
      formOf({ slug: SLUG, authorName: " Tía Rosa ", message: " ¡Felicidades! " }),
      { clientAddress: address },
    );

    assert.equal(target, `/i/${SLUG}?${GUESTBOOK_NOTICE_PARAM}=signed`);
    assert.deepEqual(sent, [
      {
        slug: SLUG,
        submission: { authorName: "Tía Rosa", message: "¡Felicidades!", honeypot: "" },
        options: { clientAddress: address },
      },
    ]);
  });

  it("never sends a form with an empty field and answers the page's own invalid notice", async () => {
    let called = false;
    const target = await submitPublicGuestbookForm(
      {
        submitGuestbook: async () => {
          called = true;
          return { ok: true };
        },
      },
      formOf({ slug: SLUG, authorName: "", message: "Hola" }),
      { clientAddress: address },
    );

    assert.equal(target, `/i/${SLUG}?${GUESTBOOK_NOTICE_PARAM}=invalid`);
    assert.equal(called, false);
  });

  it("maps every refusal of the API to its notice, and an outage to the unavailable one", async () => {
    const cases: Array<[Awaited<ReturnType<typeof refused>>, string]> = [
      [refused("invalid"), "invalid"],
      [refused("closed"), "closed"],
      [refused("rate-limited"), "limited"],
      [refused("locked"), "locked"],
      [refused("not-found"), "unavailable"],
    ];

    for (const [result, code] of cases) {
      const target = await submitPublicGuestbookForm(
        { submitGuestbook: async () => result },
        formOf({ slug: SLUG, authorName: "Rosa", message: "Hola" }),
        { clientAddress: address },
      );

      assert.equal(target, `/i/${SLUG}?${GUESTBOOK_NOTICE_PARAM}=${code}`, code);
    }

    const outage = await submitPublicGuestbookForm(
      {
        submitGuestbook: async () => {
          throw new Error("unavailable");
        },
      },
      formOf({ slug: SLUG, authorName: "Rosa", message: "Hola" }),
      { clientAddress: address },
    );
    assert.equal(outage, `/i/${SLUG}?${GUESTBOOK_NOTICE_PARAM}=unavailable`);
  });

  it("comes back to the invitation with the password notice when the invitation is locked (F13; L18.2)", async () => {
    const target = await submitPublicGuestbookForm(
      { submitGuestbook: async () => refused("locked") },
      formOf({ slug: SLUG, authorName: "Rosa", message: "Hola" }),
      { clientAddress: address },
    );

    assert.equal(target, guestbookResultTarget(SLUG, "locked"));
    assert.equal(target, `/i/${SLUG}?${GUESTBOOK_NOTICE_PARAM}=locked`);
    assert.deepEqual(guestbookNotice({ [GUESTBOOK_NOTICE_PARAM]: "locked" }), {
      code: "locked",
      message: "Esta invitación pide contraseña. Vuelve a abrirla para escribirla.",
    });
  });

  it("comes back to the home page when nothing in the form names an invitation", async () => {
    const target = await submitPublicGuestbookForm(
      {
        submitGuestbook: async () => {
          throw new Error("must not be called");
        },
      },
      formOf({ authorName: "Rosa", message: "Hola" }),
      { clientAddress: address },
    );

    assert.equal(target, "/");
  });
});

/** A refusal answer, as the client maps one. */
function refused(failure: "invalid" | "closed" | "rate-limited" | "locked" | "not-found") {
  return { ok: false as const, failure };
}
