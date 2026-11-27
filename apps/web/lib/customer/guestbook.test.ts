import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUESTBOOK_OWNER_PATHS,
  GUESTBOOK_TAB_PARAM,
  guestbookModerationView,
  hideGuestbookEntry,
  setGuestbookEntryHidden,
  showGuestbookEntry,
  signedAtLabel,
} from "./guestbook.ts";
import { GUESTBOOK_OWNER_COPY } from "./copy.ts";
import type { GuestbookEntry, GuestbookRead } from "../server/invitations-api.ts";

// The owner's «Libro de firmas» screen (F7; L10.6): the two tabs with their counts, one row per message, the hide and
// show writes, and the relative date of a signature. These tests drive the module through its public surface: the view
// the page renders and the redirect each submitted form answers.

const ID = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const ENTRY_ID = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
const NOW = new Date("2026-12-01T12:00:00.000Z");

const READ: GuestbookRead = {
  entries: [
    {
      id: ENTRY_ID,
      authorName: "Sofía y Jorge",
      message: "Nos vemos en la pista.",
      hidden: false,
      createdAt: "2026-12-01T10:00:00.000Z",
    },
    {
      id: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b",
      authorName: "Anónimo",
      message: "Mensaje oculto",
      hidden: true,
      createdAt: "2026-11-30T09:00:00.000Z",
    },
  ],
  visibleCount: 1,
  hiddenCount: 1,
};

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(values)) {
    form.set(name, value);
  }
  return form;
}

describe("the moderation view of one invitation's guestbook (F7; L10.6)", () => {
  it("splits the entries into the two tabs, each with its count and its own rows", () => {
    const view = guestbookModerationView(READ, {}, NOW);

    assert.equal(view.visibleTab, GUESTBOOK_OWNER_COPY.visibleTab(1));
    assert.equal(view.hiddenTab, GUESTBOOK_OWNER_COPY.hiddenTab(1));
    assert.deepEqual(view.visible, [
      {
        id: ENTRY_ID,
        authorName: "Sofía y Jorge",
        message: "Nos vemos en la pista.",
        signedAt: "hace 2 horas",
      },
    ]);
    assert.deepEqual(view.hidden, [
      {
        id: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b",
        authorName: "Anónimo",
        message: "Mensaje oculto",
        signedAt: "ayer",
      },
    ]);
  });

  it("opens the visible tab by default and the hidden one when the query names it", () => {
    assert.equal(guestbookModerationView(READ, {}, NOW).tab, "visibles");
    assert.equal(
      guestbookModerationView(READ, { [GUESTBOOK_TAB_PARAM]: "ocultos" }, NOW).tab,
      "ocultos",
    );
    // Anything the page does not know falls back to the visible messages, which is what the owner expects to see.
    assert.equal(
      guestbookModerationView(READ, { [GUESTBOOK_TAB_PARAM]: "TODOS" }, NOW).tab,
      "visibles",
    );
  });

  it("renders nothing for the tab that has no message, so the page can show its own empty note", () => {
    const view = guestbookModerationView({ entries: [], visibleCount: 0, hiddenCount: 0 }, {}, NOW);

    assert.deepEqual(view.visible, []);
    assert.deepEqual(view.hidden, []);
    assert.equal(view.visibleTab, GUESTBOOK_OWNER_COPY.visibleTab(0));
  });
});

describe("the relative date of a signature (F7; L10.6)", () => {
  it("answers minutes, hours, yesterday, and days", () => {
    assert.equal(signedAtLabel("2026-12-01T11:58:00.000Z", NOW), GUESTBOOK_OWNER_COPY.signedNow);
    assert.equal(
      signedAtLabel("2026-12-01T11:00:00.000Z", NOW),
      GUESTBOOK_OWNER_COPY.signedHours(1),
    );
    assert.equal(
      signedAtLabel("2026-12-01T10:00:00.000Z", NOW),
      GUESTBOOK_OWNER_COPY.signedHours(2),
    );
    assert.equal(
      signedAtLabel("2026-11-30T09:00:00.000Z", NOW),
      GUESTBOOK_OWNER_COPY.signedYesterday,
    );
    assert.equal(
      signedAtLabel("2026-11-26T09:00:00.000Z", NOW),
      GUESTBOOK_OWNER_COPY.signedDays(5),
    );
  });

  it("never answers a negative or an unreadable date, which would read as a bug", () => {
    assert.equal(signedAtLabel("2026-12-02T09:00:00.000Z", NOW), GUESTBOOK_OWNER_COPY.signedNow);
    assert.equal(signedAtLabel("not-a-date", NOW), GUESTBOOK_OWNER_COPY.signedNow);
  });
});

describe("the moderation writes (F7; L10.6)", () => {
  it("hides an entry and comes back to the hidden tab", async () => {
    const sent: unknown[] = [];
    const target = await hideGuestbookEntry(
      {
        setGuestbookEntryHidden: async (id, entryId, hidden) => {
          sent.push({ id, entryId, hidden });
          return { ok: true, value: { ...(READ.entries[0] as GuestbookEntry), hidden } };
        },
      },
      formOf({ id: ID, entryId: ENTRY_ID }),
    );

    assert.equal(target, `${GUESTBOOK_OWNER_PATHS.page(ID)}?${GUESTBOOK_TAB_PARAM}=ocultos`);
    assert.deepEqual(sent, [{ id: ID, entryId: ENTRY_ID, hidden: true }]);
  });

  it("shows an entry again and comes back to the visible tab", async () => {
    const sent: unknown[] = [];
    const target = await showGuestbookEntry(
      {
        setGuestbookEntryHidden: async (id, entryId, hidden) => {
          sent.push({ id, entryId, hidden });
          return { ok: true, value: { ...(READ.entries[1] as GuestbookEntry), hidden } };
        },
      },
      formOf({ id: ID, entryId: ENTRY_ID }),
    );

    assert.equal(target, GUESTBOOK_OWNER_PATHS.page(ID));
    assert.deepEqual(sent, [{ id: ID, entryId: ENTRY_ID, hidden: false }]);
  });

  it("answers the page's own error for a missing id, a malformed entry id, and a refusal of the API", async () => {
    let called = false;
    const api = {
      setGuestbookEntryHidden: async () => {
        called = true;
        return { ok: true as const, value: READ.entries[0] as GuestbookEntry };
      },
    };

    assert.equal(
      await setGuestbookEntryHidden(api, formOf({ id: "not-an-id", entryId: ENTRY_ID }), true),
      `/cuenta/invitaciones?error=not-found`,
    );
    assert.equal(
      await setGuestbookEntryHidden(api, formOf({ id: ID, entryId: "not-an-id" }), true),
      `${GUESTBOOK_OWNER_PATHS.page(ID)}?error=guestbook-entry-not-found`,
    );
    assert.equal(called, false);

    assert.equal(
      await setGuestbookEntryHidden(
        {
          setGuestbookEntryHidden: async () => ({
            ok: false as const,
            failure: "guestbook-entry-not-found" as const,
          }),
        },
        formOf({ id: ID, entryId: ENTRY_ID }),
        true,
      ),
      `${GUESTBOOK_OWNER_PATHS.page(ID)}?error=guestbook-entry-not-found`,
    );
  });
});
