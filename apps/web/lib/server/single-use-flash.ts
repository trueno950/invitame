import { randomBytes } from "node:crypto";

/**
 * The one-time hand-off between a server action and the page it redirects to (M6 G4; S1, S4). Two things this
 * product must pass to a page and never show twice: the plain personal token the API answers once when a guest is
 * created or their link is rotated, and the page a signed-out owner was trying to open before signing in.
 *
 * A URL is out of the question (S4: no personal data in a URL except the opaque token, and the token is exactly
 * what must not travel again), and a plain cookie cannot be deleted while a server component renders — Next.js
 * allows cookie writes only in a server action or a route handler. So the value stays in this process's memory and
 * the browser carries only an opaque handle, in a cookie that is httpOnly, `SameSite=Strict`, path-scoped to the
 * single page that reads it, and short-lived. The page takes the value out of the store as it renders it, which
 * deletes it: a reload, a second tab, or a later visit cannot show it again, and the lingering cookie names nothing.
 * The render that takes it therefore has to be the render the browser paints, so a form that hands one of these values
 * over posts natively instead of calling its action from the browser: a page that consumes one must not be rendered
 * twice (F13; L18.1).
 *
 * Boundaries: the store is this Node.js process's memory. The deployment runs one web server, so the action and the
 * page it redirects to see the same map; a second web replica would need a shared store, and the hand-off would
 * then degrade to showing nothing (never to showing it twice). Entries expire after five minutes and the map is
 * bounded, dropping the oldest entry, so a burst cannot grow it without limit. No value is ever logged.
 */

/** The longest a flash value lives, and the cookie's own `Max-Age` (S4). */
export const FLASH_COOKIE_MAX_AGE_SECONDS = 300;
const FLASH_TTL_MS = FLASH_COOKIE_MAX_AGE_SECONDS * 1000;

/** The most values one store keeps; the oldest is dropped when a new one arrives at the limit. */
export const FLASH_CAPACITY = 1_000;

/** The exact width of a flash handle: 128 bits as 22 base64url characters, the same shape as a guest token. */
export const FLASH_HANDLE_LENGTH = 22;
const FLASH_HANDLE = /^[A-Za-z0-9_-]{22}$/;

/** Whether the text is a handle this store could have minted; anything else names nothing. */
export function isFlashHandle(value: unknown): value is string {
  return typeof value === "string" && FLASH_HANDLE.test(value);
}

/** The cookie that carries a guest's one-time personal link, scoped to the attendance page of one invitation. */
export const GUEST_LINK_COOKIE = "invitame-enlace-invitado";

/** The cookie that carries the page a signed-out visitor asked for, scoped to `/cuenta`. */
export const AFTER_SIGN_IN_COOKIE = "invitame-despues-de-ingresar";

/**
 * The cookie that carries the ready-to-share message of one invitation's access code (F13; S2.13, L18.1). The message
 * quotes the code the owner just typed, so it is never part of a URL, a query, or a stored fact: it lives in this
 * process's store for one render and the browser carries only an opaque handle.
 */
export const PASSWORD_SHARE_COOKIE = "invitame-contrasena-compartir";

/** The options Next.js needs for one flash cookie; `secure` follows the scheme the request arrived on. */
export interface FlashCookieOptions {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "strict";
  path: string;
  maxAge: number;
  secure: boolean;
}

function flashCookie(
  name: string,
  value: string,
  path: string,
  secure: boolean,
): FlashCookieOptions {
  return {
    name,
    value,
    httpOnly: true,
    sameSite: "strict",
    path,
    maxAge: FLASH_COOKIE_MAX_AGE_SECONDS,
    secure,
  };
}

/**
 * The cookie of the attendance page of one invitation: path-scoped, so the browser sends it to that page and to
 * nothing else, and never to `/i`, `/cuenta`, or the API.
 */
export function guestLinkCookie(
  invitationId: string,
  handle: string,
  secure: boolean,
): FlashCookieOptions {
  return flashCookie(
    GUEST_LINK_COOKIE,
    handle,
    `/cuenta/invitaciones/${invitationId}/asistencia`,
    secure,
  );
}

/** The cookie that survives a trip through sign-in, scoped to the customer area that reads it. */
export function afterSignInCookie(handle: string, secure: boolean): FlashCookieOptions {
  return flashCookie(AFTER_SIGN_IN_COOKIE, handle, "/cuenta", secure);
}

/**
 * The cookie of the ready-to-share message of one invitation's access code (F13; L18.1): scoped to that invitation's own
 * editor, so the page of another invitation can never read the message — and the code inside it.
 */
export function passwordShareCookie(
  invitationId: string,
  handle: string,
  secure: boolean,
): FlashCookieOptions {
  return flashCookie(PASSWORD_SHARE_COOKIE, handle, `/cuenta/invitaciones/${invitationId}`, secure);
}

/** What one store answers. */
export interface SingleUseFlash<T> {
  /** Stores one value and answers the opaque handle that names it; the value is never the handle. */
  put(value: T): string;
  /**
   * Answers the value of one handle and deletes it. A handle that cannot have been minted, an expired value, and a
   * value the caller's `accept` predicate refuses all answer nothing; only a value that is answered is deleted.
   */
  take(handle: unknown, accept?: (value: T) => boolean): T | undefined;
  /** How many values are stored right now, after dropping the expired ones. */
  size(): number;
}

/** The random source minting reads; injected so a test can observe the exact width. */
export type FlashRandom = (size: number) => Buffer;

export interface SingleUseFlashSettings {
  ttlMs?: number;
  capacity?: number;
  now?: () => number;
  random?: FlashRandom;
}

interface Stored<T> {
  value: T;
  expiresAt: number;
}

/**
 * One bounded, expiring, single-use value store. Nothing is shared between two stores, so a test, the guest link, and
 * the after-sign-in hand-off each keep their own map.
 */
export function createSingleUseFlash<T>(settings: SingleUseFlashSettings = {}): SingleUseFlash<T> {
  const ttlMs = settings.ttlMs ?? FLASH_TTL_MS;
  const capacity = settings.capacity ?? FLASH_CAPACITY;
  const now = settings.now ?? Date.now;
  const random = settings.random ?? randomBytes;
  const stored = new Map<string, Stored<T>>();

  /** Drops every expired value, so neither a read nor a size ever counts one. */
  function prune(): void {
    const at = now();

    for (const [handle, entry] of stored) {
      if (entry.expiresAt <= at) {
        stored.delete(handle);
      }
    }
  }

  return {
    put(value: T): string {
      prune();
      // The oldest first: a Map keeps insertion order, so the first key is the one to go.
      while (stored.size >= capacity) {
        const oldest = stored.keys().next();

        if (oldest.done === true) {
          break;
        }
        stored.delete(oldest.value);
      }

      const handle = random(16).toString("base64url");

      if (handle.length !== FLASH_HANDLE_LENGTH) {
        // A random source of another width would make the format check lie about the entropy.
        throw new Error("the random source answered a handle of an unexpected width");
      }
      stored.set(handle, { value, expiresAt: now() + ttlMs });
      return handle;
    },

    take(handle: unknown, accept?: (value: T) => boolean): T | undefined {
      if (!isFlashHandle(handle)) {
        return undefined;
      }
      const entry = stored.get(handle);

      if (entry === undefined) {
        return undefined;
      }
      if (entry.expiresAt <= now()) {
        stored.delete(handle);
        return undefined;
      }
      if (accept !== undefined && !accept(entry.value)) {
        return undefined;
      }
      stored.delete(handle);
      return entry.value;
    },

    size(): number {
      prune();
      return stored.size;
    },
  };
}

/** The guest's personal link, handed from the action that minted it to the attendance page that shows it once. */
export interface GuestLinkFlash {
  /** The invitation the action wrote, so another invitation's page cannot read it. */
  readonly invitationId: string;
  /** The guest's name, as the page labels the link. */
  readonly guestName: string;
  /** The absolute personal link `/i/<slug>/g/<token>`; the token inside is the secret answered once (S4). */
  readonly personalUrl: string;
  /** The «Compartir por WhatsApp» link, already carrying the personal link prefilled, when one can be built. */
  readonly whatsAppUrl?: string;
}

/** The one guest-link store of this process. */
export const guestLinks = createSingleUseFlash<GuestLinkFlash>();

/**
 * The ready-to-share message of one invitation's access code (F13; L18.1), handed from the action that saved the code to
 * the editor that shows it once. It carries the code the owner typed because that is the only moment the value exists
 * anywhere on the web: the API stores a hash and answers whether a code is set, never the code itself.
 */
export interface PasswordShareFlash {
  /** The invitation the action wrote, so another invitation's editor cannot read the message. */
  readonly invitationId: string;
  /** The whole line the owner pastes with her invitation: the public link and the code that was just saved. */
  readonly message: string;
}

/** The one ready-to-share store of this process. */
export const passwordShares = createSingleUseFlash<PasswordShareFlash>();

/** The one after-sign-in store of this process: the customer path to reopen once the visitor is signed in. */
export const afterSignIn = createSingleUseFlash<string>();
