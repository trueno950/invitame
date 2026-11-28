import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CreatorTemplate, OwnedInvitation, RsvpSettings } from "../server/invitations-api.ts";
import type { MediaAsset } from "../server/media-api.ts";
import { OWNER_ACCESS } from "./invitation-access.ts";
import {
  INVITATION_PREVIEW_COPY,
  invitationPreviewPath,
  invitationPreviewView,
  previewRsvpMode,
} from "./invitation-preview.ts";

// The owner's preview of the stored draft (T2b; S3, S4): which pinned version and configuration the preview
// renders through the same registry the guest page uses, what the owner's stored content becomes while the
// draft is still incomplete, which gated features the guest page would show, and which cases have nothing to
// show at all. The renderer's own parsers decide whether a merged snapshot is renderable, so these cases pin
// the projection the page renders, never a copy of a renderer's markup.

const ORIGIN = "https://invitame.test";
const INVITATION_ID = "5c1e2b7a-4c9d-4f2e-8a51-000000000001";
const VERSION_ID = "7f2b9c14-35ad-4d6e-9c02-000000000002";
const COMPONENT_KEY = "xv-ornamental-01";
const CONFIGURATION = { componentKey: COMPONENT_KEY, theme: "terracotta-sage" };
const NOW = new Date("2026-11-20T12:00:00.000Z");
const LATER = "2027-05-15T18:00:00.000Z";
const EARLIER = "2026-01-01T18:00:00.000Z";
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

/** The pinned schema of the elegant XV años layout: thirteen required properties and three optional ones. */
const XV_SCHEMA = {
  type: "object",
  properties: {
    celebrantName: { type: "string", maxLength: 60 },
    date: { type: "string", format: "date" },
    parents: { type: "string", maxLength: 200 },
    honorSponsors: { type: "string", maxLength: 200 },
    ceremonyPlace: { type: "string", maxLength: 120 },
    ceremonyAddress: { type: "string", maxLength: 200 },
    ceremonyTime: { type: "string", format: "time" },
    receptionPlace: { type: "string", maxLength: 120 },
    receptionAddress: { type: "string", maxLength: 200 },
    receptionTime: { type: "string", format: "time" },
    dressCode: { type: "string", maxLength: 120 },
    message: { type: "string", maxLength: 400 },
    rsvpContact: { type: "string", maxLength: 120 },
    chambelanes: { type: "string", maxLength: 200 },
    giftRegistry: { type: "string", maxLength: 200 },
    mainPhoto: { type: "string", format: "uri" },
  },
  required: [
    "celebrantName",
    "date",
    "parents",
    "honorSponsors",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "dressCode",
    "message",
    "rsvpContact",
  ],
};

/** The thirteen required fields of the pinned schema, as a complete draft stores them. */
const COMPLETE_CONTENT = {
  celebrantName: "Valentina Ramírez",
  date: "2026-08-15",
  parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
  honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
  ceremonyPlace: "Parroquia de San Agustín",
  ceremonyAddress: "Calle de los Fresnos 132, San Pedro de los Pinos, Ciudad de México",
  ceremonyTime: "18:00",
  receptionPlace: "Jardín de los Olivos",
  receptionAddress: "Camino Real a Santa Fe 41, Santa Fe, Ciudad de México",
  receptionTime: "20:30",
  dressCode: "Formal · etiqueta",
  message: "Hay días que se esperan toda una vida.",
  rsvpContact: "Confirma con Adriana al 55 8120 4471",
};

function xvTemplate(
  overrides: { componentKey?: string; versionId?: string; categoryKey?: string } = {},
): CreatorTemplate {
  return {
    id: "3d8a1c55-2f1e-4b6a-9d70-000000000003",
    key: "elegant-xv",
    name: "Ornamental",
    description: null,
    category: { key: overrides.categoryKey ?? "quinceanera", name: "XV años" },
    publishedVersion: {
      id: overrides.versionId ?? VERSION_ID,
      version: 1,
      componentKey: overrides.componentKey ?? COMPONENT_KEY,
      schema: XV_SCHEMA,
      configuration: CONFIGURATION,
    },
  };
}

/** The same version, extended with the sections a customer may switch off (S8.1, S8.4). */
function omittableTemplate(): CreatorTemplate {
  const template = xvTemplate();

  return {
    ...template,
    publishedVersion: {
      ...template.publishedVersion,
      schema: {
        ...XV_SCHEMA,
        "x-omittable": [
          { key: "ceremony", fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"] },
          { key: "reception", fields: ["receptionPlace", "receptionAddress", "receptionTime"] },
        ],
        "x-require-one": [["ceremony", "reception"]],
      },
    },
  };
}

function invitation(overrides: Partial<OwnedInvitation> = {}): OwnedInvitation {
  return {
    id: INVITATION_ID,
    templateVersionId: VERSION_ID,
    packageId: "0a1b2c3d-4e5f-4a6b-8c7d-000000000004",
    slug: "valentina-2027",
    // The invitation never renamed, so it keeps every rename it may make (F11; L15.2).
    slugRenamesRemaining: 5,
    status: "DRAFT",
    publishedAt: null,
    archivedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    content: { celebrantName: "Ana Sofía" },
    missingRequiredFields: [],
    access: OWNER_ACCESS,
    timeZone: "America/Mexico_City",
    featureSettings: {
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
      itinerary: null,
      giftRegistry: null,
    },
    availableFeatures: [],
    places: {},
    ...overrides,
  };
}

function asset(kind: MediaAsset["kind"], position: number | null, alt: string | null): MediaAsset {
  return {
    id: `asset-${String(position ?? "main")}`,
    kind,
    url: `${ORIGIN}/media/${String(position ?? "main")}`,
    width: 1200,
    height: 1600,
    alt,
    position,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
}

/** The one view the page renders, or a failure if the projection did not render. */
function rendered(input: Parameters<typeof invitationPreviewView>[0]) {
  const view = invitationPreviewView(input);

  assert.equal(view.status, "ok", `expected a rendered preview, got ${view.status}`);

  return view as Extract<typeof view, { status: "ok" }>;
}

describe("invitationPreviewPath", () => {
  it("is the owner-only page of one invitation", () => {
    assert.equal(
      invitationPreviewPath(INVITATION_ID),
      `/cuenta/invitaciones/${INVITATION_ID}/vista-previa`,
    );
  });
});

describe("invitationPreviewView: what it renders", () => {
  it("renders the pinned version's key and configuration, never a guess from the catalog name", () => {
    const view = rendered({
      invitation: invitation(),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.componentKey, COMPONENT_KEY);
    assert.deepEqual(view.configuration, CONFIGURATION);
  });

  it("keeps every stored field and stands in the template's sample only for a required field left empty", () => {
    const view = rendered({
      invitation: invitation({
        content: { celebrantName: "Ana Sofía", ceremonyPlace: "", giftRegistry: "" },
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    // The owner's own words always win.
    assert.equal(view.content.celebrantName, "Ana Sofía");
    // A required field the owner has not filled yet renders the template's own sample, so a draft still renders.
    assert.equal(view.content.ceremonyPlace, "Parroquia de San Agustín");
    assert.equal(view.content.ceremonyTime, "18:00");
    // An optional field left empty stays empty: the renderer draws nothing for it, exactly as it does for a draft.
    assert.equal("giftRegistry" in view.content, false);
  });

  it("passes the fields an omitted section covers, so the preview hides it too (S8.3)", () => {
    const view = rendered({
      invitation: invitation({
        content: { ...COMPLETE_CONTENT, omittedSections: ["ceremony"] },
      }),
      templates: [omittableTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.deepEqual(view.hiddenFields, ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]);
  });

  it("renders a draft whose only empty required fields belong to an omitted section (S8.3)", () => {
    const {
      ceremonyPlace: _place,
      ceremonyAddress: _address,
      ceremonyTime: _time,
      ...rest
    } = COMPLETE_CONTENT;
    const content = { ...rest, omittedSections: ["ceremony"] };

    // The section is not shown, so its required fields are not missing and no sample is stood in for them.
    const view = rendered({
      invitation: invitation({ content }),
      templates: [omittableTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });
    assert.equal("ceremonyPlace" in view.content, false);
    assert.equal("ceremonyTime" in view.content, false);

    // Without the omitted keys the same draft gets the template's own sample for those fields instead, exactly as a
    // draft with an empty section did before the switch existed.
    const shown = rendered({
      invitation: invitation({ content: rest }),
      templates: [omittableTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });
    assert.equal(shown.content.ceremonyPlace, "Parroquia de San Agustín");
    assert.deepEqual(shown.hiddenFields, []);
  });

  it("renders a stored optional field the owner filled", () => {
    const view = rendered({
      invitation: invitation({
        content: { celebrantName: "Ana Sofía", giftRegistry: "Liverpool" },
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.content.giftRegistry, "Liverpool");
  });

  it("renders an archived invitation as nothing at all", () => {
    assert.deepEqual(
      invitationPreviewView({
        invitation: invitation({ status: "ARCHIVED" }),
        templates: [xvTemplate()],
        media: [],
        rsvp: undefined,
        origin: ORIGIN,
        now: NOW,
      }),
      { status: "archived" },
    );
  });

  it("renders a published invitation like a draft, because the owner edits both", () => {
    const view = rendered({
      invitation: invitation({ status: "PUBLISHED", publishedAt: "2026-11-02T00:00:00.000Z" }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.componentKey, COMPONENT_KEY);
  });
});

describe("invitationPreviewView: nothing to show", () => {
  it("has nothing to show when the pinned version left the creator catalog", () => {
    assert.deepEqual(
      invitationPreviewView({
        invitation: invitation(),
        templates: [xvTemplate({ versionId: "0f1e2d3c-4b5a-4968-8776-000000000005" })],
        media: [],
        rsvp: undefined,
        origin: ORIGIN,
        now: NOW,
      }),
      { status: "unavailable" },
    );
  });

  it("has nothing to show when the creator catalog could not be read", () => {
    assert.deepEqual(
      invitationPreviewView({
        invitation: invitation(),
        templates: undefined,
        media: [],
        rsvp: undefined,
        origin: ORIGIN,
        now: NOW,
      }),
      { status: "unavailable" },
    );
  });

  it("has nothing to show for a componentKey this deployment does not render", () => {
    assert.deepEqual(
      invitationPreviewView({
        invitation: invitation(),
        templates: [xvTemplate({ componentKey: "xv-poster-99" })],
        media: [],
        rsvp: undefined,
        origin: ORIGIN,
        now: NOW,
      }),
      { status: "unavailable" },
    );
  });

  it("has nothing to show when the renderer refuses the stored snapshot", () => {
    assert.deepEqual(
      invitationPreviewView({
        invitation: invitation({ content: { celebrantName: "Ana Sofía", date: "15/05/2027" } }),
        templates: [xvTemplate()],
        media: [],
        rsvp: undefined,
        origin: ORIGIN,
        now: NOW,
      }),
      { status: "unavailable" },
    );
  });

  it("says so in one short Spanish note", () => {
    assert.equal(INVITATION_PREVIEW_COPY.unavailableTitle, "La vista previa no está disponible");
    assert.notEqual(INVITATION_PREVIEW_COPY.unavailableBody.trim(), "");
  });

  it("renders a complete draft even when the request carries no origin to build a sample photo from", () => {
    const view = rendered({
      invitation: invitation({ content: COMPLETE_CONTENT }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: undefined,
      now: NOW,
    });

    assert.equal(view.content.ceremonyPlace, "Parroquia de San Agustín");
  });

  it("has nothing to show for an incomplete draft when the request carries no origin to stand in a field from", () => {
    assert.deepEqual(
      invitationPreviewView({
        invitation: invitation(),
        templates: [xvTemplate()],
        media: [],
        rsvp: undefined,
        origin: undefined,
        now: NOW,
      }),
      { status: "unavailable" },
    );
  });
});

describe("invitationPreviewView: the features the guest page would show", () => {
  it("turns the gated keys of the package into the block's features", () => {
    const view = rendered({
      invitation: invitation({
        availableFeatures: ["COUNTDOWN", "MAP", "CALENDAR", "WHATSAPP", "MUSIC", "GIFT_REGISTRY"],
        featureSettings: {
          whatsappPhone: "+525512345678",
          playlistUrl: PLAYLIST,
          playlistTitle: "Today’s Top Hits",
          playlistCoverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",
        },
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.features?.countdown, true);
    assert.equal(view.features?.map, true);
    assert.equal(view.features?.calendar, true);
    assert.deepEqual(view.features?.whatsapp, { phone: "+525512345678" });
    // The service the stored link names, so the block shows «Abrir en Spotify», with the cover and the title the
    // owner read answered: the preview shows the same card a guest sees (S2).
    assert.deepEqual(view.features?.music, {
      url: PLAYLIST,
      provider: "spotify",
      title: "Today’s Top Hits",
      coverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",
    });
    assert.equal(view.features?.giftRegistry, true);
  });

  it("shows the structured gift registry and withholds the legacy text, so the preview never draws both (F2; L4.3)", () => {
    const withRegistry = rendered({
      invitation: invitation({
        availableFeatures: ["CALENDAR", "GIFT_REGISTRY"],
        content: {
          ...COMPLETE_CONTENT,
          giftRegistry: "Mesa de regalos Liverpool · Código 5123 4471",
        },
        featureSettings: {
          whatsappPhone: null,
          playlistUrl: null,
          playlistTitle: null,
          playlistCoverUrl: null,
          itinerary: null,
          giftRegistry: {
            version: 1,
            stores: [{ name: "Liverpool", url: "https://x.mx/1" }],
            envelopes: false,
          },
        },
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    // The preview keeps the stored text in `content` the same way it keeps every other omitted value, and the renderer
    // hides it by name: the layout draws no legacy block, and the card below is the only registry the preview shows.
    assert.deepEqual(withRegistry.hiddenFields, ["giftRegistry"]);
    assert.deepEqual(withRegistry.features?.giftRegistryDetails, {
      stores: [{ name: "Liverpool", url: "https://x.mx/1" }],
      transfer: null,
      envelopes: false,
      note: null,
    });
    assert.equal(withRegistry.features?.giftRegistry, true);

    // An invitation with only the old text keeps it, exactly as a guest sees it: the legacy field travels and no card is
    // drawn for it.
    const legacy = rendered({
      invitation: invitation({
        availableFeatures: ["CALENDAR", "GIFT_REGISTRY"],
        content: {
          ...COMPLETE_CONTENT,
          giftRegistry: "Mesa de regalos Liverpool · Código 5123 4471",
        },
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.deepEqual(legacy.hiddenFields, []);
    assert.equal(legacy.content.giftRegistry, "Mesa de regalos Liverpool · Código 5123 4471");
    assert.equal(legacy.features?.giftRegistryDetails, undefined);
  });

  it("shows no features block when the package grants none", () => {
    const view = rendered({
      invitation: invitation(),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.features, undefined);
  });

  it("keeps the map and drops the two wall-clock features when the zone cannot be formatted", () => {
    const view = rendered({
      invitation: invitation({
        timeZone: "Mars/Olympus_Mons",
        availableFeatures: ["COUNTDOWN", "MAP", "CALENDAR"],
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.features?.countdown, false);
    assert.equal(view.features?.calendar, false);
    assert.equal(view.features?.map, true);
  });

  it("shows no WhatsApp contact and no music while the invitation stores none", () => {
    const view = rendered({
      invitation: invitation({
        availableFeatures: ["MAP", "WHATSAPP", "MUSIC"],
        featureSettings: {
          whatsappPhone: null,
          playlistUrl: null,
          playlistTitle: null,
          playlistCoverUrl: null,
        },
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.features?.map, true);
    assert.equal(view.features?.whatsapp, null);
    assert.equal(view.features?.music, null);
  });

  it("shows no music link the API would not have accepted", () => {
    const view = rendered({
      invitation: invitation({
        availableFeatures: ["MAP", "MUSIC"],
        featureSettings: {
          whatsappPhone: null,
          playlistUrl: "https://playlists.example.com/mia",
          playlistTitle: null,
          playlistCoverUrl: null,
        },
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.features?.music, null);
  });

  it("reads the gallery from the owner's own media, in the creator's order", () => {
    const view = rendered({
      invitation: invitation({ availableFeatures: ["GALLERY"] }),
      templates: [xvTemplate()],
      media: [
        asset("gallery", 1, "El brindis"),
        asset("main-photo", null, null),
        asset("gallery", 0, null),
      ],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.deepEqual(view.features?.gallery, [
      { url: `${ORIGIN}/media/0`, width: 1200, height: 1600, alt: null },
      { url: `${ORIGIN}/media/1`, width: 1200, height: 1600, alt: "El brindis" },
    ]);
  });

  it("shows no gallery while the package does not grant it", () => {
    const view = rendered({
      invitation: invitation({ availableFeatures: ["MAP"] }),
      templates: [xvTemplate()],
      media: [asset("gallery", 0, null)],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.deepEqual(view.features?.gallery, []);
  });

  it("shows no gallery when the owner's media read failed", () => {
    const view = rendered({
      invitation: invitation({ availableFeatures: ["MAP", "GALLERY"] }),
      templates: [xvTemplate()],
      media: undefined,
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.deepEqual(view.features?.gallery, []);
  });

  it("shows the stored itinerary only while the package grants it (F1; L3.3)", () => {
    const itinerary = {
      version: 1 as const,
      items: [
        { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
        { time: "19:30", title: "Recepción y cóctel" },
      ],
    };
    const granted = rendered({
      invitation: invitation({
        availableFeatures: ["ITINERARY"],
        featureSettings: {
          whatsappPhone: null,
          playlistUrl: null,
          playlistTitle: null,
          playlistCoverUrl: null,
          itinerary,
        },
      }),
      templates: [xvTemplate()],
      media: undefined,
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.deepEqual(granted.features?.itinerary, itinerary.items);

    const withheld = rendered({
      invitation: invitation({
        availableFeatures: ["MAP"],
        featureSettings: {
          whatsappPhone: null,
          playlistUrl: null,
          playlistTitle: null,
          playlistCoverUrl: null,
          itinerary,
        },
      }),
      templates: [xvTemplate()],
      media: undefined,
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(withheld.features?.itinerary, undefined);
  });
});

describe("previewRsvpMode", () => {
  it("is the guest list when the package grants it, even beside RSVP", () => {
    assert.equal(previewRsvpMode(["RSVP", "GUEST_LIST"]), "guest-list");
    assert.equal(previewRsvpMode(["GUEST_LIST"]), "guest-list");
  });

  it("is the open form when the package grants RSVP alone", () => {
    assert.equal(previewRsvpMode(["RSVP"]), "open");
  });

  it("is nothing when the package grants neither", () => {
    assert.equal(previewRsvpMode([]), null);
    assert.equal(previewRsvpMode(["COUNTDOWN", "MAP"]), null);
  });
});

describe("invitationPreviewView: the attendance card", () => {
  const settings: RsvpSettings = { deadline: LATER, partyLimit: 6 };

  it("shows the card the guest page shows, with nothing to submit", () => {
    const view = rendered({
      invitation: invitation({ availableFeatures: ["RSVP"] }),
      templates: [xvTemplate()],
      media: [],
      rsvp: settings,
      origin: ORIGIN,
      now: NOW,
    });

    const card = view.features?.rsvp;

    assert.equal(card?.slug, "valentina-2027");
    assert.equal(card?.partyLimit, 6);
    assert.equal(card?.deadline, LATER);
    assert.equal(card?.closed, false);
    // No server action, so the preview's form sends no answer anywhere (S4).
    assert.equal(card === undefined ? "missing" : "action" in card, false);
  });

  it("shows the closing note once the deadline passed", () => {
    const view = rendered({
      invitation: invitation({ availableFeatures: ["RSVP"] }),
      templates: [xvTemplate()],
      media: [],
      rsvp: { deadline: EARLIER, partyLimit: 4 },
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.features?.rsvp?.closed, true);
  });

  it("shows no card for a guest-list package, whose guests answer from their own link", () => {
    const view = rendered({
      invitation: invitation({ availableFeatures: ["GUEST_LIST"] }),
      templates: [xvTemplate()],
      media: [],
      rsvp: settings,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.features?.rsvp, undefined);
  });

  it("shows no card while the RSVP settings could not be read", () => {
    const view = rendered({
      invitation: invitation({ availableFeatures: ["RSVP"] }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });

    assert.equal(view.features?.rsvp, undefined);
  });
});

// The owner's preview of the guest's map (S1, S2): the owner read answers every stored point, so the preview applies
// the same rule the API applies to a guest — a point belongs to its field only while the address text still equals the
// label it was stored with — and shows the map the guest will see.

describe("invitationPreviewView: the confirmed points of the map (S1, S2)", () => {
  const CEREMONY = {
    label: "Calle de los Fresnos 132, San Pedro de los Pinos, Ciudad de México",
    lat: 19.4,
    lng: -99.17,
  };

  function previewWith(places: Record<string, unknown>, availableFeatures = ["MAP"]) {
    return rendered({
      invitation: invitation({
        content: COMPLETE_CONTENT,
        places: places as OwnedInvitation["places"],
        availableFeatures,
      }),
      templates: [xvTemplate()],
      media: [],
      rsvp: undefined,
      origin: ORIGIN,
      now: NOW,
    });
  }

  it("carries a point whose label is still the address the layout shows", () => {
    const view = previewWith({ ceremonyAddress: CEREMONY });

    assert.deepEqual(view.features?.places, { ceremonyAddress: CEREMONY });
  });

  it("drops a point the owner retyped, and keeps the map itself", () => {
    const view = previewWith({ receptionAddress: { ...CEREMONY, label: "Una dirección vieja" } });

    assert.equal(view.features?.places, undefined);
    assert.equal(view.features?.map, true);
  });

  it("carries them only for a package that grants MAP", () => {
    const view = previewWith({ ceremonyAddress: CEREMONY }, ["CALENDAR"]);

    assert.equal(view.features?.map, false);
    assert.equal(view.features?.places, undefined);
  });
});
