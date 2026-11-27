import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUESTBOOK_AUTHOR_NAME_MAX_LENGTH,
  GUESTBOOK_MESSAGE_MAX_LENGTH,
  GUESTBOOK_VISIBLE_ENTRIES_MAX,
  publicGuestbookEntries,
  validateGuestbookEntry,
} from "./invitation-guestbook";

// The guestbook entry rules (F7; S2.7, L10.1, L10.3): a name of 1 to 60 trimmed characters and a message of 1 to 500
// trimmed characters, both plain text, and nothing else. The validator is the only authority on the shape; the column
// stores what it accepts as it comes, and the public read answers the visible entries newest first, at most 50.

/** The validated entry, or the issues that refuse it. */
function resultOf(payload: { authorName?: unknown; message?: unknown }): unknown {
  const validated = validateGuestbookEntry({
    authorName: payload.authorName,
    message: payload.message,
  });

  return validated.ok ? validated.value : validated.issues;
}

describe("the guestbook entry (F7; S2.7, L10.1)", () => {
  it("trims the name and the message and keeps the rest of the text as the guest typed it", () => {
    assert.deepEqual(
      resultOf({ authorName: "  Tía   Rosa ", message: "  ¡Felicidades!\nNos vemos.  " }),
      { authorName: "Tía   Rosa", message: "¡Felicidades!\nNos vemos." },
    );
  });

  it("counts the bounds in characters, both included", () => {
    const name = "á".repeat(GUESTBOOK_AUTHOR_NAME_MAX_LENGTH);
    const message = "é".repeat(GUESTBOOK_MESSAGE_MAX_LENGTH);

    assert.deepEqual(resultOf({ authorName: name, message }), { authorName: name, message });
  });

  it("refuses a blank name, a blank message, and a value wider than its bound", () => {
    assert.deepEqual(resultOf({ authorName: "   ", message: "Hola" }), [
      "authorName must be between 1 and 60 characters",
    ]);
    assert.deepEqual(resultOf({ authorName: "Rosa", message: " \n " }), [
      "message must be between 1 and 500 characters",
    ]);
    assert.deepEqual(resultOf({ authorName: "x".repeat(61), message: "x".repeat(501) }), [
      "authorName must be between 1 and 60 characters",
      "message must be between 1 and 500 characters",
    ]);
  });

  it("refuses a value that is not a string, and reports every issue at once", () => {
    assert.deepEqual(resultOf({ authorName: 42, message: null }), [
      "authorName must be a string",
      "message must be a string",
    ]);
    assert.deepEqual(resultOf({ message: "Hola" }), ["authorName must be a string"]);
    assert.deepEqual(resultOf({ authorName: "Rosa" }), ["message must be a string"]);
  });

  it("refuses a NUL and every other control character of a signature or a message", () => {
    // PostgreSQL refuses U+0000 in a text column, so an entry carrying one would fail the write as a server fault
    // after the rate limit was spent; the other C0 characters are refused with it.
    assert.deepEqual(resultOf({ authorName: "Rosa\u0000", message: "Hola" }), [
      "authorName must not contain control characters",
    ]);
    assert.deepEqual(resultOf({ authorName: "Rosa", message: "Ho\u0000la" }), [
      "message must not contain control characters",
    ]);

    for (const control of ["\u0001", "\u0007", "\u000b", "\u000c", "\u001b", "\u001f"]) {
      assert.deepEqual(resultOf({ authorName: `Ro${control}sa`, message: "Hola" }), [
        "authorName must not contain control characters",
      ]);
      assert.deepEqual(resultOf({ authorName: "Rosa", message: `Ho${control}la` }), [
        "message must not contain control characters",
      ]);
    }

    // A name is one line: a tab or a line break in it is refused like the rest.
    assert.deepEqual(resultOf({ authorName: "Rosa\tPérez", message: "Hola" }), [
      "authorName must not contain control characters",
    ]);
    assert.deepEqual(resultOf({ authorName: "Rosa\nPérez", message: "Hola" }), [
      "authorName must not contain control characters",
    ]);
  });

  it("keeps the line feed and the tab of a message, the two the RSVP message allows", () => {
    assert.deepEqual(resultOf({ authorName: "Rosa", message: "¡Felicidades!\n\tNos vemos." }), {
      authorName: "Rosa",
      message: "¡Felicidades!\n\tNos vemos.",
    });
  });

  it("keeps markup as text: nothing here turns a guest's words into a link or into HTML", () => {
    const message = '<a href="https://spam.example">https://spam.example</a>';

    assert.deepEqual(resultOf({ authorName: "<b>Rosa</b>", message }), {
      authorName: "<b>Rosa</b>",
      message,
    });
  });
});

describe("the public guestbook of one invitation (F7; L10.4)", () => {
  it("answers the visible entries in the stored order, at most 50, with no id and no hidden flag", () => {
    // Newest first, as the repository reads them: 52 visible entries and 51 hidden ones, so the cap has work to do.
    const entries = Array.from({ length: 103 }, (_unused, index) => ({
      id: `id-${index}`,
      authorName: `Invitado ${index}`,
      message: `Mensaje ${index}`,
      hidden: index % 2 === 1,
      createdAt: new Date(Date.UTC(2026, 11, 1, 10, index)),
    }));

    const answered = publicGuestbookEntries(entries);

    assert.deepEqual(Object.keys(answered[0] ?? {}), ["authorName", "message"]);
    assert.equal(answered.length, GUESTBOOK_VISIBLE_ENTRIES_MAX);
    assert.deepEqual(answered[0], { authorName: "Invitado 0", message: "Mensaje 0" });
    assert.deepEqual(answered[1], { authorName: "Invitado 2", message: "Mensaje 2" });
    // A hidden entry never travels to a guest, and the cut keeps the newest 50 of the visible ones.
    assert.equal(
      answered.some((entry) => entry.authorName === "Invitado 1"),
      false,
    );
    assert.deepEqual(answered[answered.length - 1], {
      authorName: "Invitado 98",
      message: "Mensaje 98",
    });
  });

  it("answers nothing for an invitation without entries", () => {
    assert.deepEqual(publicGuestbookEntries([]), []);
  });
});
