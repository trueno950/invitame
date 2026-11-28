import { personalGuestPath } from "../public/guest-pass.ts";
import { publicInvitationPath } from "../public/invitation-page.ts";
import { isGuestToken, isInvitationSlug } from "../server/invitations-api.ts";
import { storedInvitationLanguage } from "./invitation-language.ts";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locale.ts";

/**
 * The locale one guest page renders (F14; S2.14, L19.2, L19.3). Three inputs decide it, in this order:
 *
 * 1. the owner's setting: `es` renders Spanish and `en` renders English always, whatever the guest asked;
 * 2. with `es-en`, the `?idioma=` query of the request that carries the guest's choice;
 * 3. with `es-en` and no query, the cookie this product remembered for that invitation;
 * 4. and Spanish when none of them names a language.
 *
 * Only one request writes anything: the route handler under `/i/<slug>/idioma` reads `?idioma=`, stores the cookie
 * scoped to that invitation's own page for a year, and answers a redirect to the clean URL. This module holds the
 * whole decision, so the page, the switch, and that handler read the same rules and nothing is duplicated.
 *
 * Nothing here is a secret: the cookie carries a language a guest picked, so it is not `HttpOnly` and no signature is
 * needed. A hand-edited value is simply not one of the two locales and is ignored.
 */

/** The one query parameter of a language choice (L19.3). */
export const LANGUAGE_PARAM = "idioma";

/** The query parameter that brings a guest back to their own personal page after choosing (L19.3). */
export const LANGUAGE_GUEST_PARAM = "invitado";

/** The path segment of the one route handler that remembers a choice: `/i/<slug>/idioma`. */
export const LANGUAGE_CHOICE_SEGMENT = "idioma";

/** The one cookie name; its value is scoped by path, so two invitations never share a choice. */
export const LANGUAGE_COOKIE = "invitame-idioma";

/** How long a guest's device remembers a language choice: one year (L19.3). */
export const LANGUAGE_CHOICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** The path the cookie is scoped to: the one invitation's public page, `/i/<slug>` (L19.3). */
export function languageCookiePath(slug: string): string {
  return publicInvitationPath(slug);
}

/**
 * The cookie options Next.js needs for one invitation's language choice. A plain object rather than a
 * `cookies().set()` call, so the rules are provable without a request. `HttpOnly` is deliberately absent: the choice
 * is not a secret, and the page itself may read it.
 */
export interface LanguageCookieOptions {
  name: string;
  value: Locale;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
}

/** The cookie that remembers one guest's choice on one invitation's page (L19.3). */
export function languageCookie(
  slug: string,
  locale: Locale,
  secure: boolean,
): LanguageCookieOptions {
  return {
    name: LANGUAGE_COOKIE,
    value: locale,
    sameSite: "lax",
    path: languageCookiePath(slug),
    maxAge: LANGUAGE_CHOICE_MAX_AGE_SECONDS,
    secure,
  };
}

/** The locale a cookie value names, or nothing at all for a value no guest could have chosen. */
export function rememberedLocale(value: unknown): Locale | undefined {
  return isLocale(value) ? value : undefined;
}

/** The locale a request's query names, or nothing for an absent, repeated, or unknown value. */
export function requestedLocale(
  parameters: Record<string, string | string[] | undefined> = {},
): Locale | undefined {
  return rememberedLocale(parameters[LANGUAGE_PARAM]);
}

/**
 * The two parameters of a language choice, read from one request's query exactly as the shared decision reads them: one
 * value is that value, and a repeated parameter is kept as the list it is — which no reader accepts — instead of the
 * first of its values. `URLSearchParams.get()` would silently take the first, so a hand-edited link could choose a
 * language the guest did not; reading `getAll()` here keeps the route handler and the page on the same rule (L19.3).
 */
export function languageChoiceParameters(
  search: URLSearchParams,
): Record<string, string | string[] | undefined> {
  return {
    [LANGUAGE_PARAM]: oneValue(search.getAll(LANGUAGE_PARAM)),
    [LANGUAGE_GUEST_PARAM]: oneValue(search.getAll(LANGUAGE_GUEST_PARAM)),
  };
}

/** One query parameter's value: absent, the single value, or the repeated list no reader accepts. */
function oneValue(values: readonly string[]): string | string[] | undefined {
  if (values.length === 0) {
    return undefined;
  }
  if (values.length === 1) {
    return values[0];
  }

  return [...values];
}

/** What decides one page load: the owner's setting, the query of this request, and the cookie this device carries. */
export interface GuestLocaleInput {
  /** The effective language the public read answered (`features.language`); anything else reads as Spanish. */
  readonly language: unknown;
  /** The `?idioma=` value of this request, when the page was asked for one. */
  readonly requested?: unknown;
  /** The `invitame-idioma` cookie of this request. */
  readonly remembered?: unknown;
}

/**
 * The locale of one guest page (L19.2, L19.3): the owner's single language wins over everything; with both languages
 * offered, the query wins over the cookie, and Spanish is the answer when neither names one.
 */
export function resolveGuestLocale(input: GuestLocaleInput): Locale {
  const language = storedInvitationLanguage(input.language);

  // A single language — including an absent value, which is an API written before F14 — is what the page renders, and
  // neither this request's query nor a remembered cookie changes it (L19.2, L19.5).
  if (language !== "es-en") {
    return language;
  }
  const requested = rememberedLocale(input.requested);

  if (requested !== undefined) {
    return requested;
  }
  return rememberedLocale(input.remembered) ?? DEFAULT_LOCALE;
}

/** Whether one invitation offers the ES / EN switch at all: only `es-en` does (L19.3). */
export function showsLanguageSwitch(language: unknown): boolean {
  return language === "es-en";
}

/**
 * The clean guest page a language choice comes back to: `/i/<slug>`, or the guest's own personal page when the request
 * named a token this deployment could have minted. A slug that cannot be one, or a token of another shape, answers
 * nothing (or the public page), so a language choice never becomes a way to leave the invitation.
 */
export function cleanGuestPath(slug: unknown, guestToken?: unknown): string | undefined {
  if (!isInvitationSlug(slug)) {
    return undefined;
  }
  return isGuestToken(guestToken)
    ? personalGuestPath(slug, guestToken)
    : publicInvitationPath(slug);
}

/** The route-handler address of one choice: it carries `?idioma=` and comes back to the clean page itself (L19.3). */
export function languageChoicePath(slug: string, locale: Locale, guestToken?: unknown): string {
  const query = new URLSearchParams({ [LANGUAGE_PARAM]: locale });

  if (isGuestToken(guestToken)) {
    query.set(LANGUAGE_GUEST_PARAM, guestToken);
  }
  return `${publicInvitationPath(slug)}/${LANGUAGE_CHOICE_SEGMENT}?${query.toString()}`;
}

/** What one language-choice request does: remember the value and where it returns to, or only where it returns to. */
export type LanguageChoiceOutcome =
  | { readonly ok: true; readonly target: string; readonly cookie: LanguageCookieOptions }
  | { readonly ok: false; readonly target: string };

/**
 * The answer of `GET /i/<slug>/idioma` (L19.3): the cookie to set and the clean page to return to. A value that is not
 * one of the two locales sets nothing and still returns to the clean page, so a hand-edited link never traps a guest on
 * a URL with a query this deployment does not understand; a slug that cannot be one names no invitation at all.
 */
export function languageChoiceOutcome(input: {
  readonly slug: unknown;
  readonly parameters: Record<string, string | string[] | undefined>;
  readonly secure: boolean;
}): LanguageChoiceOutcome | undefined {
  const target = cleanGuestPath(input.slug, input.parameters[LANGUAGE_GUEST_PARAM]);

  if (target === undefined) {
    return undefined;
  }

  const locale = requestedLocale(input.parameters);

  return locale === undefined
    ? { ok: false, target }
    : { ok: true, target, cookie: languageCookie(input.slug as string, locale, input.secure) };
}
