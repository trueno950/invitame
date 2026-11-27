import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type InvitationLivestream,
  LIVESTREAM_NOTE_MAX_LENGTH,
  LIVESTREAM_URL_MAX_LENGTH,
  LIVESTREAM_VERSION,
  livestreamHasContent,
  publicLivestream,
  storedLivestream,
  validateLivestream,
  youtubeVideoIdOf,
} from "./invitation-livestream";

// The livestream payload rules (F9; S2.9, L12.1, L12.3): the version, the `https` link bounded at 500 characters, the
// optional note bounded at 120, the empty-payload rule, and the provider allow-list that decides whether a link may be
// embedded. Every case goes through the validator the API and the column trust.

const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const LIVE = "https://youtube.com/live/AbCdEf12345";
const SHORT = "https://youtu.be/dQw4w9WgXcQ";
const ZOOM = "https://us02web.zoom.us/j/123456789";

const LIVESTREAM = { version: 1, url: WATCH, note: "Inicia a las 17:00 h" } as const;

/** The validated payload, or the issues that refuse it. */
function resultOf(payload: unknown): unknown {
  const validated = validateLivestream(payload);

  return validated.ok ? validated.value : validated.issues;
}

/** The validated payload, asserting the value is one the rules accept. */
function payloadOf(payload: unknown): InvitationLivestream | null {
  const validated = validateLivestream(payload);

  assert.equal(validated.ok, true, JSON.stringify(validated.ok ? [] : validated.issues));

  return validated.ok ? validated.value : null;
}

describe("the livestream payload bounds (L12.1)", () => {
  it("accepts the versioned payload with and without a note, trimming both texts", () => {
    assert.deepEqual(payloadOf(LIVESTREAM), {
      version: LIVESTREAM_VERSION,
      url: WATCH,
      note: "Inicia a las 17:00 h",
    });
    assert.deepEqual(payloadOf({ version: 1, url: `  ${WATCH}  `, note: "  " }), {
      version: 1,
      url: WATCH,
    });
    assert.deepEqual(payloadOf({ version: 1, url: ZOOM }), { version: 1, url: ZOOM });
  });

  it("treats null, an absent value, and a payload without a link as no livestream", () => {
    assert.equal(resultOf(null), null);
    assert.equal(resultOf(undefined), null);
    assert.equal(resultOf({ version: 1, url: "" }), null);
    assert.equal(resultOf({ version: 1, url: "   ", note: "Inicia a las 17:00 h" }), null);
    assert.equal(resultOf({ version: 1 }), null);
  });

  it("refuses another version, another shape, and the empty link with an issue", () => {
    assert.deepEqual(resultOf({ version: 2, url: WATCH }), ["livestream.version must be 1"]);
    assert.deepEqual(resultOf({ url: WATCH }), ["livestream.version must be 1"]);
    assert.deepEqual(resultOf(["x"]), ["livestream must be an object or null"]);
    assert.deepEqual(resultOf("https://youtu.be/dQw4w9WgXcQ"), [
      "livestream must be an object or null",
    ]);
    assert.deepEqual(resultOf({ version: 1, url: 42 }), [
      "livestream.url must be an https link of at most 500 characters",
    ]);
  });

  it("accepts only an https link, bounded at 500 characters with no whitespace", () => {
    const issuesOf = (url: unknown) => resultOf({ version: 1, url });

    assert.deepEqual(issuesOf("http://youtu.be/dQw4w9WgXcQ"), [
      "livestream.url must be an https link of at most 500 characters",
    ]);
    assert.deepEqual(issuesOf("youtu.be/dQw4w9WgXcQ"), [
      "livestream.url must be an https link of at most 500 characters",
    ]);
    assert.deepEqual(issuesOf(`https://youtu.be/${"a".repeat(LIVESTREAM_URL_MAX_LENGTH)}`), [
      "livestream.url must be an https link of at most 500 characters",
    ]);
    assert.deepEqual(issuesOf("https://youtu.be/dQw4 w9WgXcQ"), [
      "livestream.url must be an https link of at most 500 characters",
    ]);
    assert.equal(
      payloadOf({ version: 1, url: `https://youtu.be/${"a".repeat(11)}` })?.url,
      `https://youtu.be/${"a".repeat(11)}`,
    );
  });

  it("bounds the note at 120 characters and refuses a value that is not a text", () => {
    const issue = "livestream.note must be a string of at most 120 characters";

    assert.deepEqual(
      resultOf({ version: 1, url: WATCH, note: "n".repeat(LIVESTREAM_NOTE_MAX_LENGTH + 1) }),
      [issue],
    );
    assert.deepEqual(resultOf({ version: 1, url: WATCH, note: 12 }), [issue]);
    // PostgreSQL refuses a NUL inside JSONB, so a control character is a refusal here rather than a failed write.
    assert.deepEqual(resultOf({ version: 1, url: WATCH, note: "Inicia\u0000 a las 17:00" }), [
      issue,
    ]);
    assert.deepEqual(resultOf({ version: 1, url: WATCH, note: "Inicia\u0007" }), [issue]);
    assert.equal(
      payloadOf({ version: 1, url: WATCH, note: "n".repeat(LIVESTREAM_NOTE_MAX_LENGTH) })?.note,
      "n".repeat(LIVESTREAM_NOTE_MAX_LENGTH),
    );
  });

  it("reports every issue in a deterministic order", () => {
    assert.deepEqual(resultOf({ version: 2, url: "ftp://x", note: 3 }), [
      "livestream.version must be 1",
      "livestream.url must be an https link of at most 500 characters",
      "livestream.note must be a string of at most 120 characters",
    ]);
  });
});

describe("the livestream provider allow-list (L12.3)", () => {
  it("resolves a video id from the three YouTube link shapes it embeds", () => {
    assert.equal(youtubeVideoIdOf(WATCH), "dQw4w9WgXcQ");
    assert.equal(youtubeVideoIdOf("https://youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(youtubeVideoIdOf("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30"), "dQw4w9WgXcQ");
    assert.equal(youtubeVideoIdOf(LIVE), "AbCdEf12345");
    assert.equal(
      youtubeVideoIdOf("https://www.youtube.com/live/AbCdEf12345?feature=share"),
      "AbCdEf12345",
    );
    assert.equal(youtubeVideoIdOf(SHORT), "dQw4w9WgXcQ");
    assert.equal(youtubeVideoIdOf("https://youtu.be/dQw4w9WgXcQ?t=30"), "dQw4w9WgXcQ");
    assert.equal(youtubeVideoIdOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("refuses every other host and every id outside the strict eleven-character pattern", () => {
    assert.equal(youtubeVideoIdOf(ZOOM), null);
    assert.equal(youtubeVideoIdOf("https://vimeo.com/123456789"), null);
    assert.equal(youtubeVideoIdOf("https://www.facebook.com/watch?v=123"), null);
    assert.equal(youtubeVideoIdOf("https://youtube.test/watch?v=dQw4w9WgXcQ"), null);
    assert.equal(youtubeVideoIdOf("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), null);
    assert.equal(youtubeVideoIdOf("https://www.youtube.com/watch?v=short"), null);
    assert.equal(youtubeVideoIdOf("https://www.youtube.com/watch?v=dQw4w9WgXcQextra"), null);
    assert.equal(youtubeVideoIdOf("https://www.youtube.com/watch?v=dQw4w9WgXc!"), null);
    assert.equal(youtubeVideoIdOf("https://www.youtube.com/embed/dQw4w9WgXcQ"), null);
    assert.equal(youtubeVideoIdOf("https://www.youtube.com/@canal"), null);
    assert.equal(youtubeVideoIdOf("https://youtu.be/"), null);
    assert.equal(youtubeVideoIdOf("http://youtu.be/dQw4w9WgXcQ"), null);
    assert.equal(youtubeVideoIdOf("not a url"), null);
    assert.equal(youtubeVideoIdOf(undefined), null);
  });

  it("ignores a port and userinfo, which no stored link carries", () => {
    assert.equal(youtubeVideoIdOf("https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ"), null);
    assert.equal(youtubeVideoIdOf("https://user@youtu.be/dQw4w9WgXcQ"), null);
  });
});

describe("the livestream a guest reads", () => {
  it("answers the link, the resolved video id, and a note that is always present", () => {
    assert.deepEqual(publicLivestream({ version: 1, url: WATCH, note: "Inicia a las 17:00 h" }), {
      url: WATCH,
      videoId: "dQw4w9WgXcQ",
      note: "Inicia a las 17:00 h",
    });
    // A link this API does not embed is answered with no video id, so a guest sees only its open link (L12.3).
    assert.deepEqual(publicLivestream({ version: 1, url: ZOOM }), {
      url: ZOOM,
      videoId: null,
      note: null,
    });
  });

  it("reads a stored row only when it satisfies the rules, and no content when it does not", () => {
    assert.deepEqual(storedLivestream(LIVESTREAM), {
      version: 1,
      url: WATCH,
      note: "Inicia a las 17:00 h",
    });
    assert.equal(storedLivestream({ version: 2, url: WATCH }), null);
    assert.equal(storedLivestream({ version: 1, url: "http://youtu.be/dQw4w9WgXcQ" }), null);
    assert.equal(storedLivestream(null), null);
  });

  it("tells a stored livestream with a link apart from none at all", () => {
    assert.equal(livestreamHasContent({ version: 1, url: ZOOM }), true);
    assert.equal(livestreamHasContent(null), false);
    assert.equal(livestreamHasContent(undefined), false);
  });
});
