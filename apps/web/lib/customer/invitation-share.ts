import { INVITATION_COPY } from "./copy.ts";

/**
 * The share panel of a published invitation (T1; S2.2). The owner reaches three large actions once the invitation is
 * published — copy the link, share it by WhatsApp, and open it — from the same page that published it.
 *
 * The address is absolute because the owner sends it outside the site: it is built from the origin the page resolved
 * from its own request (`requestOrigin`), never from a hardcoded host, so a preview deployment shares its own address.
 * An origin the page could not trust leaves the path alone, and the share panel then states a relative link instead of
 * pointing a guest at somebody else's host. This module is pure, so `node --test` proves the shapes.
 */

/** The endpoint that opens WhatsApp with a message, and the only one the panel ever links to. */
export const WHATSAPP_SHARE_ENDPOINT = "https://wa.me/";

/** A bare http(s) origin: a scheme, a host, and nothing that could turn into a path, a query, or a fragment. */
const BARE_ORIGIN = /^https?:\/\/[^/?#@\s]+\/?$/i;

/**
 * The absolute public address of an invitation, from the origin the page resolved and the path of its public page. An
 * origin that is not a bare http(s) one is refused instead of trusted, so a hand-edited header can never send a guest
 * somewhere else; the path is then what the panel offers.
 */
export function absolutePublicUrl(origin: string | undefined, path: string): string {
  const trimmed = origin?.trim();
  const suffix = path.startsWith("/") ? path : `/${path}`;

  if (trimmed === undefined || trimmed === "") {
    return suffix;
  }
  if (!BARE_ORIGIN.test(trimmed)) {
    return suffix;
  }
  return `${trimmed.replace(/\/+$/u, "")}${suffix}`;
}

/** The message that travels with the link: one neutral Spanish line and the absolute address. */
export function shareMessage(url: string): string {
  return INVITATION_COPY.shareWhatsAppMessage(url);
}

/**
 * The WhatsApp link of one invitation: the share endpoint with the message as its single `text` value, encoded so the
 * address inside it can carry its own query without breaking this one.
 */
export function whatsappShareHref(url: string): string {
  return `${WHATSAPP_SHARE_ENDPOINT}?text=${encodeURIComponent(shareMessage(url))}`;
}
