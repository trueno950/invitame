import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PUBLIC_INVITATION_COPY } from "../customer/copy.ts";
import {
  INVITATION_DESCRIPTION_MAX_LENGTH,
  invitationMetadata,
  publicInvitationPath,
  truncateText,
} from "./invitation-page.ts";

// The guest's page of a published invitation (M5 T5; S5, A5, A8): the public path, the static share
// metadata built from the stored content, and the noindex rule that keeps an invitation out of search
// results. The page passes its content straight from the API projection.

const CONTENT = {
  celebrantName: "Ana",
  age: 7,
  message: "Ven a celebrar conmigo.",
};

const ROBOTS = { index: false, follow: false };

describe("publicInvitationPath", () => {
  it("builds the public URL of a slug under /i", () => {
    assert.equal(publicInvitationPath("invitacion-k7m2qx"), "/i/invitacion-k7m2qx");
  });
});

describe("invitationMetadata", () => {
  it("titles the page with the celebrant's name and never indexes it", () => {
    assert.deepEqual(invitationMetadata(CONTENT), {
      title: "Invitación de Ana",
      description: "Ven a celebrar conmigo.",
      robots: ROBOTS,
      openGraph: { title: "Invitación de Ana", description: "Ven a celebrar conmigo." },
    });
  });

  it("falls back to the plain title when the content has no celebrant name", () => {
    for (const content of [{}, { celebrantName: 7 }, { celebrantName: "   " }, null, "text"]) {
      assert.deepEqual(invitationMetadata(content), {
        title: PUBLIC_INVITATION_COPY.titleFallback,
        robots: ROBOTS,
        openGraph: { title: PUBLIC_INVITATION_COPY.titleFallback },
      });
    }
  });

  it("leaves the description out when the content has no message", () => {
    assert.deepEqual(invitationMetadata({ celebrantName: "Ana", message: 7 }), {
      title: "Invitación de Ana",
      robots: ROBOTS,
      openGraph: { title: "Invitación de Ana" },
    });
    assert.deepEqual(invitationMetadata({ celebrantName: "Ana", message: "  " }), {
      title: "Invitación de Ana",
      robots: ROBOTS,
      openGraph: { title: "Invitación de Ana" },
    });
  });

  it("shortens a long message to about 150 characters with an ellipsis", () => {
    const message = "Ven a celebrar conmigo. ".repeat(20);
    const metadata = invitationMetadata({ celebrantName: "Ana", message });
    const description = metadata.description ?? "";

    assert.equal(INVITATION_DESCRIPTION_MAX_LENGTH, 150);
    assert.ok(description.length <= INVITATION_DESCRIPTION_MAX_LENGTH + 1, description);
    assert.match(description, /…$/);
    assert.ok(message.startsWith(description.slice(0, -1).trimEnd()));
    assert.equal(metadata.openGraph.description, description);
  });
});

describe("truncateText", () => {
  it("collapses whitespace and keeps a short text unchanged", () => {
    assert.equal(truncateText("  Ven a   celebrar\nconmigo.  ", 150), "Ven a celebrar conmigo.");
  });

  it("cuts at a word boundary when there is one near the limit, and mid-word otherwise", () => {
    assert.equal(truncateText("uno dos tres cuatro cinco", 12), "uno dos…");
    assert.equal(truncateText("abcdefghijklmnop", 8), "abcdefgh…");
  });

  it("returns an empty text as an empty string", () => {
    assert.equal(truncateText("   ", 150), "");
  });
});
