// Absolute media URLs (M8 S4). A URL is built from the API's configured public origin and the asset id only, never
// from the storage provider's endpoint, a bucket name, a signed URL, or a credential. The id is a UUID the database
// generated, and the route answers only what the invitation's state allows, so the URL itself reveals nothing.

/** The public URL of one asset: `<publicBaseUrl>/media/<assetId>`. */
export function mediaUrl(publicBaseUrl: string, assetId: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/media/${assetId}`;
}

/** Builds the public URL of an asset; the module binds it to the validated public origin. */
export type AssetUrl = (assetId: string) => string;
