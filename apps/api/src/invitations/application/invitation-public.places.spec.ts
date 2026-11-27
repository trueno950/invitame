import assert from "node:assert/strict";
import { it } from "node:test";

import { WEDDING_ARCH_TEMPLATE_SEEDS } from "../../../prisma/catalog-seed";
import { toPublicInvitationResponse } from "../presentation/invitation.response";
import { GetPublicInvitationUseCase } from "./invitation.use-cases";

/** The seeded wedding arch schema, which declares the omittable ceremony and reception groups. */
function weddingSchema() {
  const seed = WEDDING_ARCH_TEMPLATE_SEEDS[0];
  assert.ok(seed);
  return seed.schema;
}

// S8.3: a guest never receives the value of a field an omitted section covers. The map point the owner stored
// for a hidden address carries that same text (its label) and its coordinates, so it must not travel either.

const HIDDEN_PLACE = "RECINTO-OCULTO";
const HIDDEN_ADDRESS = "CALLE-OCULTA-123";

const CONTENT = {
  coupleNameOne: "Ana",
  coupleNameTwo: "Daniel",
  date: "2026-09-12",
  ceremonyPlace: HIDDEN_PLACE,
  ceremonyAddress: HIDDEN_ADDRESS,
  ceremonyTime: "17:00",
  receptionPlace: "Hacienda San Gabriel",
  receptionAddress: "Camino a la Hacienda 8",
  receptionTime: "19:30",
  dressCode: "Formal",
  message: "Nos encantaría celebrar contigo.",
  rsvpContact: "Confirma al 55 1234 5678",
  omittedSections: ["ceremony"],
};

it("withholds the stored point of an omitted place from the public read (S8.3)", async () => {
  const record = {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "22222222-2222-4222-8222-222222222222",
    templateVersionId: "33333333-3333-4333-8333-333333333333",
    packageId: "44444444-4444-4444-8444-444444444444",
    slug: "invitacion-k7m2qx",
    status: "PUBLISHED",
    content: CONTENT,
    timeZone: "America/Mexico_City",
    whatsappPhone: null,
    playlistUrl: null,
    playlistTitle: null,
    playlistCoverUrl: null,
    rsvpDeadline: null,
    rsvpPartyLimit: 4,
    archivedAt: null,
    publishedAt: new Date("2026-01-05T12:00:00.000Z"),
    firstPublishedAt: new Date("2026-01-05T12:00:00.000Z"),
    expiresAt: new Date("2027-01-05T12:00:00.000Z"),
    createdAt: new Date("2026-01-04T12:00:00.000Z"),
    updatedAt: new Date("2026-01-05T12:00:00.000Z"),
    places: {
      ceremonyAddress: { label: HIDDEN_ADDRESS, lat: 20.58, lng: -100.39 },
      receptionAddress: { label: "Camino a la Hacienda 8", lat: 20.6, lng: -100.4 },
    },
  };

  const useCase = new GetPublicInvitationUseCase(
    { findPublishedBySlug: async () => record } as never,
    {
      findVersionRenderData: async () => ({
        componentKey: "wedding-arch-01",
        configuration: { componentKey: "wedding-arch-01", theme: "champagne" },
        schema: weddingSchema(),
      }),
      isRendererRegistered: () => true,
      findPackageEntitlements: async () => ({
        status: "ACTIVE",
        includedFeatureKeys: ["MAP"],
        durationDays: 365,
      }),
    } as never,
    // The album is a required dependency of the public read (F8; L26); this package does not grant it.
    { readPublishedPhotos: async () => ({ photos: [], count: 0 }) },
  );

  const published = await useCase.execute("invitacion-k7m2qx");
  assert.ok(published);
  const body = JSON.stringify(toPublicInvitationResponse(published));

  assert.deepEqual(Object.keys(published.places), ["receptionAddress"]);
  assert.equal(body.includes(HIDDEN_ADDRESS), false);
  assert.equal(body.includes("20.58"), false);
});
