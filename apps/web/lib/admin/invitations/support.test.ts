import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdminInvitationDetail } from "../../server/admin-invitations-client.ts";
import { INVITATION_SUPPORT_COPY, INVITATION_UNPUBLISH_REASON_LABELS } from "./copy.ts";
import {
  invitationPageNotices,
  invitationsErrorTarget,
  invitationsNoticeTarget,
} from "./notices.ts";
import { invitationSupportView } from "./support.ts";

// The «Acciones de soporte» card and its messages (M9 T8; S4, S6, L9): the form is offered only while the invitation is
// published, its reason select is the API's closed set in Spanish, its note is bounded at the API's 500 characters, and
// the card says that unpublishing creates no refund. The page's query shows only its own fixed codes, never text.

const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";

const DETAIL: AdminInvitationDetail = {
  invitationId: INVITATION_ID,
  slug: "ana-y-daniel",
  status: "PUBLISHED",
  ownerEmail: "ana@ejemplo.com",
  createdAt: "2026-11-10T10:00:00.000Z",
  publishedAt: "2026-11-12T10:00:00.000Z",
  firstPublishedAt: "2026-11-12T10:00:00.000Z",
  archivedAt: null,
  refundRequestedAt: null,
  latestPayment: null,
  media: { mainPhoto: false, galleryCount: 0 },
  ownerId: "9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19",
  packageId: "2b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e12",
  templateVersionId: "3b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e13",
  payments: [],
};

describe("invitationSupportView", () => {
  it("offers the unpublish form only while the invitation is published", () => {
    const published = invitationSupportView(DETAIL);

    assert.equal(published.canUnpublish, true);
    assert.equal(published.unpublishHint, undefined);

    const draft = invitationSupportView({ ...DETAIL, status: "DRAFT", publishedAt: null });
    assert.equal(draft.canUnpublish, false);
    assert.equal(draft.unpublishHint, INVITATION_SUPPORT_COPY.notPublished);

    const archived = invitationSupportView({ ...DETAIL, status: "ARCHIVED", publishedAt: null });
    assert.equal(archived.canUnpublish, false);
    assert.equal(archived.unpublishHint, INVITATION_SUPPORT_COPY.notPublished);
  });

  it("names the four reasons of the API's closed set in Spanish", () => {
    const view = invitationSupportView(DETAIL);

    assert.deepEqual(view.reasons, [
      { value: "ABUSE", label: "Abuso" },
      { value: "OWNER_REQUEST", label: "Petición del dueño" },
      { value: "PAYMENT_ERROR", label: "Error de pago" },
      { value: "OTHER", label: "Otro" },
    ]);
    assert.deepEqual(Object.values(INVITATION_UNPUBLISH_REASON_LABELS), [
      "Abuso",
      "Petición del dueño",
      "Error de pago",
      "Otro",
    ]);
  });

  it("bounds the note at the API's own 500 characters and says «Otro» needs one", () => {
    const view = invitationSupportView(DETAIL);

    assert.equal(view.noteMaxLength, 500);
    assert.equal(view.noteRequiredFor, "OTHER");
    assert.match(INVITATION_SUPPORT_COPY.noteHint, /Otro/);
    assert.match(INVITATION_SUPPORT_COPY.noteHint, /500/);
  });

  it("says that unpublishing creates no refund", () => {
    assert.equal(INVITATION_SUPPORT_COPY.noRefund, "Despublicar no genera un reembolso.");
    assert.equal(invitationSupportView(DETAIL).noRefund, INVITATION_SUPPORT_COPY.noRefund);
  });
});

describe("the support card's page messages", () => {
  it("shows the notice of a completed unpublish and each refusal's own sentence", () => {
    assert.equal(
      invitationsNoticeTarget("/admin/invitaciones/x", "unpublished"),
      "/admin/invitaciones/x?notice=unpublished",
    );
    assert.deepEqual(invitationPageNotices({ notice: "unpublished" }), {
      notice: INVITATION_SUPPORT_COPY.notice.unpublished,
    });

    for (const code of [
      "not-found",
      "not-published",
      "already-archived",
      "validation",
      "invalid-form",
      "unavailable",
    ] as const) {
      assert.equal(
        invitationsErrorTarget("/admin/invitaciones/x", code),
        `/admin/invitaciones/x?error=${code}`,
      );
      assert.deepEqual(invitationPageNotices({ error: code }), {
        error: { code, message: INVITATION_SUPPORT_COPY.error[code] },
      });
    }
  });

  it("shows nothing for an unknown, repeated, or inherited value", () => {
    for (const parameters of [
      {},
      { notice: "refund-requested" },
      { error: "not-a-code" },
      { error: ["not-found", "not-found"] },
      { error: "toString" },
      { error: "__proto__" },
    ]) {
      assert.deepEqual(invitationPageNotices(parameters), {}, JSON.stringify(parameters));
    }
  });
});
