import type { JsonObject } from "../domain/invitation-content";
import type { PublicInvitationFeatures } from "../domain/invitation-features";

// The public projection of a published invitation (M5 T3; S2, S3, A7). A guest page receives exactly the
// allow-listed renderer identity, its configuration, the content keys the pinned schema declares, the slug, and
// the publication instant. Owner, package, price, status, and every internal id are deliberately absent: the
// page is rendered per request from this projection alone, so nothing else can leak by accident (A7, A6). The
// projection is built here, in the application layer, so the read use case and any later presentation map share
// one definition of what a guest may see.

/** What the public page of a published invitation renders (A7, A8); nothing outside these keys is exposed. */
export interface PublicInvitation {
  slug: string;
  componentKey: string;
  configuration: unknown;
  /** Only the keys the pinned schema declares in `properties`; undeclared stored keys never reach a guest. */
  content: JsonObject;
  /**
   * The instant the invitation was published. The `Invitation_publishedAt_matches_status` check makes it a
   * date for this published row; it stays nullable here so the type never claims a value the read did not see.
   */
  publishedAt: Date | null;
  /** The IANA zone the guest's countdown and calendar links use (F1; S4). */
  timeZone: string;
  /**
   * The gated features the guest page renders (F1; S4): the pinned package's keys intersected with the API's
   * implemented allow-list plus the always-available calendar, with WhatsApp only while a phone is stored.
   * Nothing about the package itself — its keys, id, or name — is here.
   */
  features: PublicInvitationFeatures;
}

/** A JSON object read from a `Json` column; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The property names the schema declares, in schema order. A schema that declares no usable `properties`
 * allows nothing, so the projection fails closed and answers an empty content object instead of the stored
 * payload. Only the keys are read, never the definitions: a stored value is copied, never interpolated or
 * evaluated as code (S3).
 */
export function declaredContentKeys(schema: unknown): string[] {
  if (!isJsonObject(schema) || !Object.hasOwn(schema, "properties")) {
    return [];
  }
  const properties = schema.properties;

  return isJsonObject(properties) ? Object.keys(properties) : [];
}

/**
 * The stored content reduced to the keys the pinned schema declares (A7). Values are copied as they are, in
 * schema order, and each key is defined as an own property, so a declared `__proto__` stays data and can never
 * become the prototype of the projection.
 */
export function projectPublicContent(schema: unknown, content: JsonObject): JsonObject {
  const projected: JsonObject = {};

  for (const key of declaredContentKeys(schema)) {
    if (Object.hasOwn(content, key)) {
      Object.defineProperty(projected, key, {
        value: content[key],
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return projected;
}
