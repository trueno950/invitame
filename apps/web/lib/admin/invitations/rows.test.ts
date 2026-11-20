import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdminInvitationDetail } from "../../server/admin-invitations-client.ts";
import { PAYMENTS_STATUS_LABELS } from "../payments/copy.ts";
import {
  INVITATION_DETAIL_COPY,
  INVITATIONS_COPY,
  INVITATION_STATUS_LABELS,
  invitationDetailPath,
} from "./copy.ts";
import { invitationDetailView, invitationRowView } from "./rows.ts";

// What one row of `/admin/invitaciones` and one invitation's status page render (M9 T3; S1): only the stored facts the
// API answers — the owner's email, never a display name; a payment state and amount, never a provider payload; photo
// counts, never an image — plus the public link of a published invitation and nothing of its content.

const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const PAYMENT_ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const PACKAGE_ID = "2b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e12";
const TEMPLATE_VERSION_ID = "3b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e13";
const CREATED_AT = "2026-11-10T10:00:00.000Z";
const PAID_AT = "2026-11-12T10:00:00.000Z";

const SUMMARY = {
  invitationId: INVITATION_ID,
  slug: "ana-y-daniel",
  status: "PUBLISHED" as const,
  ownerEmail: "ana@ejemplo.com",
  createdAt: CREATED_AT,
  publishedAt: PAID_AT,
  firstPublishedAt: PAID_AT,
  archivedAt: null,
  refundRequestedAt: null,
  latestPayment: { status: "paid" as const, amountMinor: 150000, currency: "MXN", paidAt: PAID_AT },
  media: { mainPhoto: true, galleryCount: 3 },
};

const DETAIL: AdminInvitationDetail = {
  ...SUMMARY,
  packageId: PACKAGE_ID,
  templateVersionId: TEMPLATE_VERSION_ID,
  payments: [
    {
      paymentId: PAYMENT_ID,
      status: "paid",
      amountMinor: 150000,
      currency: "MXN",
      createdAt: CREATED_AT,
      paidAt: PAID_AT,
    },
    {
      paymentId: PACKAGE_ID,
      status: "pending",
      amountMinor: 150000,
      currency: "MXN",
      createdAt: CREATED_AT,
      paidAt: null,
    },
  ],
};

describe("invitationRowView", () => {
  it("shows the slug, its status, the owner's email, the payment, the photos, and the created date", () => {
    const row = invitationRowView(SUMMARY);

    assert.equal(row.invitationId, INVITATION_ID);
    assert.equal(row.href, invitationDetailPath(INVITATION_ID));
    assert.equal(row.href, `/admin/invitaciones/${INVITATION_ID}`);
    assert.equal(row.slug, "ana-y-daniel");
    assert.equal(row.statusLabel, INVITATION_STATUS_LABELS.PUBLISHED);
    assert.equal(row.ownerEmail, "ana@ejemplo.com");
    assert.equal(row.payment, `${PAYMENTS_STATUS_LABELS.paid} · $1,500.00 MXN`);
    assert.equal(row.photos, INVITATIONS_COPY.photosWithGallery(3));
    assert.match(row.created, /10 nov 2026/);
  });

  it("names every stored status in Spanish", () => {
    for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"] as const) {
      const row = invitationRowView({ ...SUMMARY, status });
      assert.equal(row.statusLabel, INVITATION_STATUS_LABELS[status], status);
    }

    assert.deepEqual(Object.values(INVITATION_STATUS_LABELS), [
      "Borrador",
      "Publicada",
      "Archivada",
    ]);
  });

  it("says the owner has no stored address instead of inventing one", () => {
    assert.equal(
      invitationRowView({ ...SUMMARY, ownerEmail: null }).ownerEmail,
      INVITATIONS_COPY.noOwnerEmail,
    );
    assert.equal(
      invitationDetailView({ ...DETAIL, ownerEmail: null }).ownerEmail,
      INVITATIONS_COPY.noOwnerEmail,
    );
  });

  it("says an invitation has no payment yet", () => {
    assert.equal(
      invitationRowView({ ...SUMMARY, latestPayment: null }).payment,
      INVITATIONS_COPY.noPayment,
    );
  });

  it("names each photo count without inventing one", () => {
    const cases: Array<[boolean, number, string]> = [
      [true, 3, INVITATIONS_COPY.photosWithGallery(3)],
      [false, 2, INVITATIONS_COPY.galleryCount(2)],
      [true, 0, INVITATIONS_COPY.mainPhoto],
      [false, 0, INVITATIONS_COPY.noPhotos],
    ];

    for (const [mainPhoto, galleryCount, expected] of cases) {
      assert.equal(
        invitationRowView({ ...SUMMARY, media: { mainPhoto, galleryCount } }).photos,
        expected,
      );
    }

    assert.equal(INVITATIONS_COPY.galleryCount(1), "1 foto en la galería");
    assert.equal(INVITATIONS_COPY.galleryCount(4), "4 fotos en la galería");
  });

  it("prints no amount it could not format", () => {
    const row = invitationRowView({
      ...SUMMARY,
      latestPayment: {
        status: "paid",
        amountMinor: 150000,
        currency: "no-es-moneda",
        paidAt: null,
      },
    });

    assert.equal(row.payment, PAYMENTS_STATUS_LABELS.paid);
  });
});

describe("invitationDetailView", () => {
  it("lists the lifecycle dates, the payments, the photo counts, and the public link of a published invitation", () => {
    const view = invitationDetailView(DETAIL);

    assert.equal(view.slug, "ana-y-daniel");
    assert.equal(view.statusLabel, INVITATION_STATUS_LABELS.PUBLISHED);
    assert.equal(view.ownerEmail, "ana@ejemplo.com");
    assert.deepEqual(
      view.dates.map((date) => date.label),
      [
        INVITATION_DETAIL_COPY.createdAtLabel,
        INVITATION_DETAIL_COPY.publishedAtLabel,
        INVITATION_DETAIL_COPY.firstPublishedAtLabel,
        INVITATION_DETAIL_COPY.archivedAtLabel,
        INVITATION_DETAIL_COPY.refundRequestedAtLabel,
      ],
    );
    assert.match(view.dates[1]?.value ?? "", /12 nov 2026/);
    assert.equal(view.dates[3]?.value, INVITATION_DETAIL_COPY.noDate);
    assert.equal(view.dates[4]?.at, undefined);

    // The API sends the payments newest first; the page keeps that order and shows each state and amount.
    assert.deepEqual(
      view.payments.map((payment) => [payment.paymentId, payment.statusLabel]),
      [
        [PAYMENT_ID, PAYMENTS_STATUS_LABELS.paid],
        [PACKAGE_ID, PAYMENTS_STATUS_LABELS.pending],
      ],
    );
    assert.equal(view.payments[0]?.amount, "$1,500.00 MXN");
    assert.match(view.payments[0]?.paid ?? "", /12 nov 2026/);
    assert.equal(view.payments[1]?.paid, "");

    assert.equal(view.photos.main, INVITATION_DETAIL_COPY.photosYes);
    assert.equal(view.photos.gallery, INVITATIONS_COPY.galleryCount(3));
    assert.equal(view.publicHref, "/i/ana-y-daniel");
  });

  it("shows the public link only while the invitation is published", () => {
    assert.equal(invitationDetailView({ ...DETAIL, status: "DRAFT" }).publicHref, undefined);
    assert.equal(invitationDetailView({ ...DETAIL, status: "ARCHIVED" }).publicHref, undefined);

    const published = invitationDetailView({ ...DETAIL, status: "PUBLISHED" });
    assert.equal(published.publicHref, "/i/ana-y-daniel");
  });

  it("says an invitation has no payments and no photos", () => {
    const view = invitationDetailView({
      ...DETAIL,
      payments: [],
      media: { mainPhoto: false, galleryCount: 0 },
    });

    assert.deepEqual(view.payments, []);
    assert.equal(view.photos.main, INVITATION_DETAIL_COPY.photosNo);
    assert.equal(view.photos.gallery, INVITATION_DETAIL_COPY.noPhotos);
  });

  it("carries only the fields the page may render", () => {
    const view = invitationDetailView(DETAIL);

    // No content, no owner display name, no guests, and no provider payload: the view cannot hold one.
    assert.deepEqual(Object.keys(view).sort(), [
      "dates",
      "ownerEmail",
      "payments",
      "photos",
      "publicHref",
      "slug",
      "statusLabel",
    ]);
    assert.deepEqual(Object.keys(view.payments[0] ?? {}).sort(), [
      "amount",
      "created",
      "paid",
      "paymentId",
      "statusLabel",
    ]);
  });
});
