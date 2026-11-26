import type { GalleryPhoto } from "../invitation-features/gallery.ts";
import {
  type InvitationFeatures,
  isE164Phone,
  isInvitationFeatureKey,
  type RsvpBlockView,
} from "../invitation-features/invitation-features.ts";
import {
  type MusicLink,
  type MusicProvider,
  withMusicMetadata,
} from "../invitation-features/music.ts";
import { featureBlockParts, type GatedFeatures } from "../public/invitation-features.ts";
import { rendererAcceptsProps } from "../public/invitation-render.ts";
import { publicRsvpBlock } from "../public/invitation-rsvp.ts";
import { hiddenFieldsOf } from "../renderers/hidden-fields.ts";
import { sampleContentFor } from "../renderers/samples.ts";
import type { CreatorTemplate, OwnedInvitation, RsvpSettings } from "../server/invitations-api.ts";
import type { MediaAsset } from "../server/media-api.ts";
import { contentFields, INVITATION_PATHS, invitationFieldsFor } from "./invitations.ts";

/**
 * The owner's preview of a stored draft (T2b; S3, S4): `/cuenta/invitaciones/<id>/vista-previa` renders one
 * invitation through the same renderer registry the guest page uses, so the editor can show it in a phone-width
 * frame instead of sending the owner to open the invitation.
 *
 * Four decisions live here, and the page only reads them:
 *
 * - which snapshot is rendered: the published version the invitation is pinned to, taken from the creator catalog
 *   like the draft's own form does. A version that left the catalog, a catalog that could not be read, a
 *   `componentKey` this deployment does not render, and content the renderer refuses all answer the same
 *   «La vista previa no está disponible» note instead of a guess;
 * - what the content is: exactly what the API stored, with the template's own sample standing in for a required
 *   field the owner has not filled yet, because a draft is allowed to stay partial and its renderer refuses an
 *   incomplete snapshot. An optional field left empty stays empty, so the layout draws nothing for it, exactly as
 *   it does on a guest page. An archived invitation has no preview at all;
 * - which features are shown: the gated keys the owner read answered, mapped by the same rules the API applies to
 *   a guest, with WhatsApp only while an E.164 number is stored and music only while a link names an allow-listed
 *   service. The gallery comes from the owner's own media read, the countdown and the calendar stay off while the
 *   stored zone cannot be formatted, and the `.ics` download the guest page offers is left out because no download
 *   serves an unpublished invitation;
 * - what the attendance card is: the same card the guest page shows, built without a server action so nothing can
 *   be submitted from the preview (S4). A guest-list package shows no card here, because its guests answer from
 *   their own personal link.
 *
 * This module is pure and has no `server-only` marker, so `node --test` proves every decision; the page owns the
 * reads and their failures. Copy is here, untranslated and in Spanish, because it is the preview's own.
 */

/** Where one invitation's preview lives, under the account: the frame the editor shows (S4). */
export function invitationPreviewPath(id: string): string {
  return `${INVITATION_PATHS.detail(id)}/vista-previa`;
}

/** The preview's own Spanish copy: a page title, the one note of an unavailable preview, and the 404 (S4). */
export const INVITATION_PREVIEW_COPY = {
  pageTitle: "Vista previa de tu invitación",
  unavailableTitle: "La vista previa no está disponible",
  unavailableBody:
    "No pudimos preparar la vista previa de esta invitación. Puede que su plantilla ya no esté publicada. Tu borrador sigue guardado.",
  notFoundTitle: "No encontramos esa invitación",
  notFoundBody: "Puede que ya no exista o que no sea tuya.",
} as const;

/** Which attendance answers this invitation takes, read from the gated keys the owner read answered (S4). */
export function previewRsvpMode(
  availableFeatures: readonly string[],
): "open" | "guest-list" | null {
  if (availableFeatures.includes("GUEST_LIST")) {
    return "guest-list";
  }

  return availableFeatures.includes("RSVP") ? "open" : null;
}

/**
 * The services a stored playlist link may name, keyed by the exact host (S7). This mirrors the API's own
 * allow-list, which stays the authority that stores the link: the owner read answers only the stored URL, while
 * the public read answers the service the API recognized. A link on any other host names no service here, so the
 * preview shows no music section instead of guessing a label.
 */
const PLAYLIST_HOSTS: Readonly<Record<string, MusicProvider>> = {
  "open.spotify.com": "spotify",
  "music.apple.com": "apple_music",
  "music.youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "www.deezer.com": "deezer",
  "deezer.com": "deezer",
  "soundcloud.com": "soundcloud",
};

/**
 * The service one stored playlist link names, or undefined when it names none this deployment shows (S7). The title
 * and the cover the owner read answered are attached with the same rules a guest page applies (S2), so the preview
 * shows the card the guest will see.
 */
export function previewMusicLink(
  playlistUrl: string | null,
  playlistTitle: string | null = null,
  playlistCoverUrl: string | null = null,
): MusicLink | undefined {
  if (playlistUrl === null) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(playlistUrl);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return undefined;
  }

  const provider = Object.hasOwn(PLAYLIST_HOSTS, url.hostname)
    ? PLAYLIST_HOSTS[url.hostname]
    : undefined;

  return provider === undefined
    ? undefined
    : withMusicMetadata({ url: playlistUrl, provider }, playlistTitle, playlistCoverUrl);
}

/** Whether a stored value says something: a blank string, a missing value, and a non-finite number say nothing. */
function isFilled(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return typeof value === "boolean";
}

/**
 * The content the preview renders: what the API stored, plus the template's own sample value for every required
 * field the owner has not filled yet. A draft is allowed to stay partial, and its renderer refuses a snapshot
 * missing a required field, so without the stand-in a draft would have no preview until it was complete. The
 * owner's own words always win, an optional field left empty stays empty, and a category the sample does not cover
 * keeps the stored content as it is, so the renderer's own check decides (and refuses) instead of a guess.
 */
export function previewContent(
  template: CreatorTemplate,
  content: Record<string, unknown>,
  origin: string | undefined,
  hiddenFields: readonly string[] = [],
): Record<string, unknown> {
  const stored: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(content)) {
    if (isFilled(value)) {
      stored[name] = value;
    }
  }

  const sample = origin === undefined ? undefined : sampleContentFor(template.category.key, origin);

  if (typeof sample !== "object" || sample === null || Array.isArray(sample)) {
    return stored;
  }

  const standIn = sample as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...stored };

  for (const field of contentFields(template.publishedVersion.schema)) {
    if (!field.required || Object.hasOwn(merged, field.name)) {
      continue;
    }
    // An omitted section is not drawn, so its own required fields are not missing and need no stand-in (S8.3).
    if (hiddenFields.includes(field.name)) {
      continue;
    }

    const value = Object.hasOwn(standIn, field.name) ? standIn[field.name] : undefined;

    if (isFilled(value)) {
      merged[field.name] = value;
    }
  }

  return merged;
}

/** The gated feature flags the owner read answers, as the shared block reads them (S4, S7; M8 S4). */
function gatedFeatures(
  invitation: OwnedInvitation,
  media: readonly MediaAsset[] | undefined,
): GatedFeatures {
  const gated = new Set(invitation.availableFeatures.filter(isInvitationFeatureKey));
  const { whatsappPhone, playlistUrl, playlistTitle, playlistCoverUrl } =
    invitation.featureSettings;
  const music = gated.has("MUSIC")
    ? previewMusicLink(playlistUrl, playlistTitle, playlistCoverUrl)
    : undefined;

  return {
    countdown: gated.has("COUNTDOWN"),
    map: gated.has("MAP"),
    calendar: gated.has("CALENDAR"),
    // The API gates WhatsApp on a stored number and music on a stored link, so a granted key with no value shows
    // nothing here either.
    whatsapp:
      gated.has("WHATSAPP") && whatsappPhone !== null && isE164Phone(whatsappPhone)
        ? { phone: whatsappPhone }
        : null,
    music: music ?? null,
    giftRegistry: gated.has("GIFT_REGISTRY"),
    // The owner's own media read answers the stored photos; a package without `GALLERY` shows none of them.
    gallery: gated.has("GALLERY") ? galleryPhotos(media) : [],
    // The owner read answers the stored plan of the day, and the preview shows it only while the package grants the
    // key, exactly as a guest page does (F1; L3.3).
    itinerary: gated.has("ITINERARY") ? (invitation.featureSettings.itinerary?.items ?? []) : [],
  };
}

/** The stored gallery photos in the creator's order; a failed read, or no photos, is an empty gallery (M8 S4). */
function galleryPhotos(media: readonly MediaAsset[] | undefined): readonly GalleryPhoto[] {
  if (media === undefined) {
    return [];
  }

  return [...media]
    .filter((asset) => asset.kind === "gallery")
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map((asset) => ({
      url: asset.url,
      width: asset.width,
      height: asset.height,
      alt: asset.alt,
    }));
}

/**
 * The attendance card of the preview, or undefined when this invitation takes no open answers or its settings
 * could not be read. The card carries no `action`, so its form submits nothing: an owner can see the card and never
 * answer for a guest (S4).
 */
function previewRsvp(
  invitation: OwnedInvitation,
  settings: RsvpSettings | undefined,
  now: Date,
): RsvpBlockView | undefined {
  if (previewRsvpMode(invitation.availableFeatures) !== "open" || settings === undefined) {
    return undefined;
  }

  return publicRsvpBlock(
    { mode: "open", deadline: settings.deadline, partyLimit: settings.partyLimit, qrPass: false },
    invitation.slug,
    undefined,
    now,
  );
}

/** Everything the page reads to decide one preview: the owner's own data and the reads around it. */
export interface InvitationPreviewInput {
  /** The invitation as its owner reads it; a foreign one never reaches this function. */
  readonly invitation: OwnedInvitation;
  /** The creator catalog, or undefined when that read failed. */
  readonly templates: readonly CreatorTemplate[] | undefined;
  /** The owner's stored media, or undefined when that read failed or the package grants no gallery. */
  readonly media: readonly MediaAsset[] | undefined;
  /** The RSVP settings of an invitation that takes open answers, or undefined. */
  readonly rsvp: RsvpSettings | undefined;
  /** The origin of the request rendering the page, which the sample photo of a stand-in field needs. */
  readonly origin: string | undefined;
  /** The instant the attendance card is read at; defaults to now, so no caller computes one by accident. */
  readonly now?: Date;
}

/** What a page shows for one invitation: the rendered snapshot, nothing because it is archived, or the note. */
export type InvitationPreview =
  | {
      readonly status: "ok";
      readonly componentKey: string;
      readonly configuration: unknown;
      readonly content: Record<string, unknown>;
      /** The features block's props, or absent when this invitation has nothing to show. */
      readonly features?: InvitationFeatures;
      /** The content fields the omitted sections cover, so the renderer hides them here too (S8.3). */
      readonly hiddenFields: readonly string[];
    }
  | { readonly status: "archived" }
  | { readonly status: "unavailable" };

/** The preview of one invitation, as the page renders it (S3, S4). */
export function invitationPreviewView(input: InvitationPreviewInput): InvitationPreview {
  const { invitation } = input;

  // An archived invitation is a closed draft: there is nothing left to preview, and the page answers not-found.
  if (invitation.status === "ARCHIVED") {
    return { status: "archived" };
  }

  const pinned =
    input.templates === undefined
      ? undefined
      : invitationFieldsFor(input.templates, invitation.templateVersionId);

  if (pinned === undefined) {
    return { status: "unavailable" };
  }

  const version = pinned.template.publishedVersion;
  // The omitted sections are read from the pinned schema and the stored content, exactly as the API reads them for a
  // guest, so the preview hides the same sections the published invitation will hide (S8.3).
  const hiddenFields = hiddenFieldsOf(version.schema, invitation.content);
  const content = previewContent(pinned.template, invitation.content, input.origin, hiddenFields);
  const rsvp = previewRsvp(invitation, input.rsvp, input.now ?? new Date());
  const parts = featureBlockParts({
    componentKey: version.componentKey,
    content,
    timeZone: invitation.timeZone,
    gated: gatedFeatures(invitation, input.media),
    // The owner read answers every stored point, so the preview applies the guest's own rule here: a point belongs to
    // a place only while the address text still equals the label it was stored with (S1, S2), and only a package that
    // grants MAP shows a map at all.
    places: invitation.availableFeatures.includes("MAP") ? invitation.places : {},
    ...(rsvp === undefined ? {} : { rsvp }),
  });

  // The renderer's own parsers decide, exactly as they do on the guest page: a snapshot they refuse is a preview
  // that cannot be shown, never a page that throws. The hidden fields travel with it, so a required field of an
  // omitted section is not a reason to refuse the snapshot.
  if (
    !rendererAcceptsProps(version.componentKey, {
      configuration: version.configuration,
      content,
      hiddenFields,
    })
  ) {
    return { status: "unavailable" };
  }

  return {
    status: "ok",
    componentKey: version.componentKey,
    configuration: version.configuration,
    content,
    hiddenFields,
    ...(parts === undefined ? {} : { features: parts.features }),
  };
}
