/**
 * The origin of the request that is rendering a page (T9; S9). A page that builds an absolute address from
 * its own request — the chooser's sample photo is one, because the renderer's content parser accepts only an
 * http(s) URL — must not trust what the browser sent beyond a bare origin. The value honours
 * `x-forwarded-proto` when it names http or https (as the platform edge sets it), assumes `http` for a
 * loopback host and `https` for any other, and answers nothing for a host that would turn into a path, a
 * query, a fragment, credentials, or another scheme. A page that receives nothing drops the address instead
 * of pointing an `<img>` at a foreign one.
 *
 * This module has no `server-only` marker, so `node --test` can prove the rules; only a page passes it the
 * request headers.
 */

/** A loopback host is the only one served over plain `http` when no forwarded protocol says otherwise. */
const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3})(?::\d{1,5})?$/i;
/** A bare host with an optional port: the only shape a `Host` header may have (RFC 9110). */
const HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::\d{1,5})?$/i;

/** The first hop of a `Forwarded`-style list, lower-cased, or nothing. */
function firstValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim().toLowerCase();
  return first ? first : undefined;
}

/**
 * `http://localhost:3000`-shaped origin of the request, or undefined when the headers do not describe one.
 * Call it with the page's request headers: `requestOrigin(await headers())`.
 */
export function requestOrigin(headers: { get(name: string): string | null }): string | undefined {
  const host = headers.get("host")?.trim().toLowerCase();

  if (!host || host.includes("@") || !HOST.test(host)) {
    return undefined;
  }

  const forwarded = firstValue(headers.get("x-forwarded-proto"));
  const protocol = forwarded ?? (LOOPBACK_HOST.test(host) ? "http" : "https");

  if (protocol !== "http" && protocol !== "https") {
    return undefined;
  }

  const origin = `${protocol}://${host}`;

  try {
    return new URL(origin).origin === origin ? origin : undefined;
  } catch {
    return undefined;
  }
}
