import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvitationFeaturesBlock } from "../../app/_components/invitation-features/invitation-features-block.ts";
import type { EventFacts } from "./event-facts.ts";
import type { InvitationFeatures } from "./invitation-features.ts";
import {
  LIVESTREAM_EMBED_ORIGIN,
  LIVESTREAM_IFRAME_SANDBOX,
  LIVESTREAM_IFRAME_TITLE,
  livestreamEmbedUrl,
} from "./livestream.ts";

// The livestream card of the guest page (S2.9, L12.3, L12.4, L12.5): a click-to-load facade, so the server render has
// no frame and names no embed host; the frame is built only from the strict video id, with the documented origin,
// title, and sandbox; any other https link is an open link in a new tab.

const OFF: InvitationFeatures = {
  timeZone: "America/Mexico_City",
  countdown: false,
  map: false,
  calendar: false,
  whatsapp: null,
  music: null,
  giftRegistry: false,
};
const FACTS: EventFacts = {
  title: "Boda de Ana y Luis",
  date: "2026-12-05",
  time: "16:30",
  places: [],
};
const YOUTUBE = {
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  videoId: "dQw4w9WgXcQ",
  note: "Inicia a las 17:00 h",
};
const ZOOM = {
  url: "https://us02web.zoom.us/j/123456789",
  videoId: null,
  note: "Conéctate con Zoom",
};
const render = (livestream: InvitationFeatures["livestream"]): string =>
  renderToStaticMarkup(
    createElement(InvitationFeaturesBlock, {
      features: { ...OFF, livestream } as InvitationFeatures,
      facts: FACTS,
      calendarHref: "/i/x/calendario.ics",
    }),
  );

describe("the livestream card of the guest page (L12.3, L12.4)", () => {
  it("renders the facade with no frame and no embed host before the tap", () => {
    const html = render(YOUTUBE);

    assert.ok(html.includes("Míralo en vivo"));
    assert.equal(html.includes("<iframe"), false, "no frame before the tap");
    assert.equal(html.includes("youtube-nocookie"), false, "no embed host before the tap");
    assert.ok(html.includes('data-livestream-player="facade"'));
    assert.ok(html.includes('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"'));
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.ok(html.includes("Si no carga, ábrela aquí"));
    assert.ok(html.includes("Inicia a las 17:00 h"));
  });

  it("builds the frame address and its sandbox from the documented constants", () => {
    assert.equal(
      livestreamEmbedUrl("dQw4w9WgXcQ"),
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    assert.equal(LIVESTREAM_EMBED_ORIGIN, "https://www.youtube-nocookie.com");
    assert.equal(LIVESTREAM_IFRAME_SANDBOX, "allow-scripts allow-same-origin allow-presentation");
    assert.equal(LIVESTREAM_IFRAME_TITLE, "Transmisión en vivo");
    // A body written around the API cannot frame an address of its own.
    assert.equal(livestreamEmbedUrl("https://evil.test/x"), null);
    assert.equal(livestreamEmbedUrl("dQw4w9WgXcQ&x=1"), null);
  });

  it("offers only «Abrir la transmisión» for another https provider", () => {
    const html = render(ZOOM);

    assert.ok(html.includes("Abrir la transmisión"));
    assert.ok(html.includes('href="https://us02web.zoom.us/j/123456789"'));
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.equal(html.includes("<iframe"), false);
    assert.equal(html.includes("youtube-nocookie"), false);
  });

  it("draws no card at all without a livestream", () => {
    assert.equal(render(null), "");
  });
});
