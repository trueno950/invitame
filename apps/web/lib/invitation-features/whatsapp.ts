import { guestFormats } from "../i18n/guest-texts.ts";
import type { Locale } from "../i18n/locale.ts";
import { isE164Phone } from "./invitation-features.ts";

/**
 * The WhatsApp button of the guest page (S4): a `wa.me` link to the creator's E.164 number with a neutral
 * prefilled Spanish greeting that names the celebration, so the guest only has to press send. The number is
 * personal data (AGENTS.md: never in logs), so a refusal names the rule and never repeats what it read.
 */

/**
 * The prefilled greeting of the chat, in the language the page renders (F14; L19.2): neutral Spanish with tú, or the
 * English line. The celebration's own title is the owner's, so it travels unchanged.
 */
function greeting(celebrationTitle: string, locale: Locale): string {
  return guestFormats(locale).whatsappGreeting(celebrationTitle);
}

/** The digits of an E.164 number, or a `RangeError` when the stored phone is not E.164. */
export function whatsappDigits(phone: string): string {
  if (!isE164Phone(phone)) {
    throw new RangeError("the WhatsApp phone must be an E.164 number");
  }

  return phone.slice(1);
}

/** The `wa.me` chat that opens with the greeting already written. */
export function whatsappUrl(
  phone: string,
  celebrationTitle: string,
  locale: Locale = "es",
): string {
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(
    greeting(celebrationTitle, locale),
  )}`;
}
