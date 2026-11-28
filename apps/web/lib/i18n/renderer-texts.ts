import { formatClockTime, formatLongDate } from "./format.ts";
import { DEFAULT_LOCALE, type Locale } from "./locale.ts";

import { formatLongDate as formatSpanishLongDate } from "../renderers/invitation-fields.ts";

/**
 * The fixed texts every renderer writes (F14; S2.14, L19.2): the kickers, headings, labels, aria labels, alt texts,
 * and the date and clock words of the eleven layouts, in the same shape as `./dictionary.ts`. Spanish is the source of
 * truth — every key is declared once in `RENDERER_SPANISH_TEXTS` with the exact copy the layouts wrote before the
 * setting existed, and `RENDERER_ENGLISH_TEXTS` is typed by those very keys, so a key added without its English value
 * fails `tsc` instead of rendering a blank line. Nothing is machine translated: each English value is written and
 * reviewed here.
 *
 * What the owner wrote — a name, the message, an address, a dress code — never reaches this module: it is the guest's
 * own content and is rendered as written in whichever language the invitation declares.
 *
 * Two texts carry a placeholder — `{age}` in a birthday's age line, `{name}` in the polaroid caption — because the word
 * order, or the punctuation around the guest's own name, differs between the languages; everything else is a fixed
 * string.
 */

/** Every fixed text a renderer writes, in neutral Spanish, exactly as the layouts wrote it (L19.2). */
export const RENDERER_SPANISH_TEXTS = {
  /** The invitation's own aria label and photo description, shared by every layout. */
  "invitation.family": "La familia",
  "invitation.details": "Detalles",
  "invitation.message": "Mensaje",
  "invitation.rsvp": "Confirma tu asistencia",
  /** The word that joins a couple's two names in the name lockup, and in a composed name. */
  "invitation.nameJoin": "y",
  /** The prefix of an image description: «Foto de Valentina». */
  "invitation.photoAlt": "Foto de",
  /** The ornamental card's cameo label. */
  "invitation.portrait": "Retrato",

  /** The label of one value inside a card: the date, the hour, the place, the address. */
  "label.date": "Fecha",
  "label.time": "Hora",
  "label.place": "Lugar",
  "label.address": "Dirección",
  "label.hosts": "Anfitriones",
  "label.parents": "Padres",
  "label.godparents": "Padrinos",
  "label.honorSponsors": "Padrinos de honor",
  "label.sponsors": "Padrinos",
  "label.chambelanes": "Chambelanes",
  "label.familyOf": "Familia de",
  "label.dressCode": "Vestimenta",
  "label.giftRegistry": "Mesa de regalos",
  "label.ceremony": "Ceremonia",
  "label.reception": "Recepción",
  "label.mass": "Misa",
  "label.genderReveal": "Revelación de género",

  /** The three themed birthday layouts. */
  "birthday.ariaInvitation": "Invitación de cumpleaños de",
  "birthday.kicker": "¡Te invitamos a una aventura!",
  "birthday.sticker": "¡Gran expedición!",
  "birthday.route": "La ruta de la fiesta",
  "birthday.when": "¿Cuándo?",
  "birthday.whenTime": "¿A qué hora?",
  "birthday.where": "¿Dónde?",
  /** The cardinal knobs of the compass rose; west is «O» in Spanish and «W» in English. */
  "birthday.compassNorth": "N",
  "birthday.compassSouth": "S",
  "birthday.compassEast": "E",
  "birthday.compassWest": "O",
  /** The age line, singular and plural, with the number where the placeholder sits. */
  "birthday.ageLabelOne": "Cumple 1 año",
  "birthday.ageLabelMany": "Cumple {age} años",
  /** The unit a layout sets apart from the number: «7» and «años». */
  "birthday.ageUnitOne": "año",
  "birthday.ageUnitMany": "años",
  /** `birthday-map-01` and `birthday-poster-01` copy. */
  "birthday.posterKicker": "¡Es mi fiesta!",
  "birthday.posterLaughs": "de risas",
  "birthday.ticketTitle": "Tu boleto de entrada",
  /** The polaroid's caption: the guest's own name between the exclamation marks Spanish sets around it. */
  "birthday.posterNameCheer": "¡{name}!",
  /** Under the time stub of the admission ticket: «19:30» and «horas». */
  "birthday.ticketHours": "horas",
  /** `birthday-story-01` reads as a story, one sentence per chapter. */
  "birthday.storyOpener": "Había una vez alguien muy especial llamado",
  "birthday.storyNoAge":
    "y en este capítulo de su historia te esperamos. ¡Queremos que seas parte del cuento!",
  "birthday.storyTurns": "y en este capítulo de su historia cumple",
  "birthday.storyExclaim": ". ¡Queremos que seas parte del cuento!",
  "birthday.chapterDetails": "Capítulo 1 · Detalles",
  "birthday.chapterPlace": "Capítulo 2 · Lugar",
  "birthday.chapterMessage": "Capítulo 3 · Mensaje",
  "birthday.bigDay": "El gran día",
  "birthday.storyContinues": "…y la fiesta continúa contigo.",

  /** The baby shower layout. */
  "babyShower.ariaInvitation": "Invitación de baby shower",
  /** Joins the invitation's own name to the celebrant: «Invitación de baby shower de Sofía». */
  "babyShower.ariaOf": "de",
  "babyShower.kicker": "Baby shower",
  "babyShower.kickerOf": "Baby shower de",
  "babyShower.details": "Los detalles",
  "babyShower.photo": "La foto",
  "babyShower.genderRevealValue": "¡Habrá revelación!",
  "babyShower.expect": "¡Te esperamos!",

  /** The formal baptism layout. */
  "baptism.ariaInvitation": "Invitación de bautizo de",
  "baptism.kicker": "Bautizo de",
  "baptism.photoCaption": "Un día para recordar",

  /** The XV años layouts. */
  "xv.ariaInvitation": "Invitación de XV años de",
  "xv.kicker": "Mis XV años",

  /** The wedding layouts. */
  "wedding.ariaInvitation": "Invitación de boda de",
  "wedding.kicker": "Nuestra boda",
} as const;

/** One key of the renderer dictionary: declared by the Spanish source, never by a caller. */
export type RendererTextKey = keyof typeof RENDERER_SPANISH_TEXTS;

/** The same keys with their English text; a missing or unknown key does not compile. */
export const RENDERER_ENGLISH_TEXTS: Readonly<Record<RendererTextKey, string>> = {
  "invitation.family": "The family",
  "invitation.details": "Details",
  "invitation.message": "Message",
  "invitation.rsvp": "Confirm your attendance",
  "invitation.nameJoin": "and",
  "invitation.photoAlt": "Photo of",
  "invitation.portrait": "Portrait",

  "label.date": "Date",
  "label.time": "Time",
  "label.place": "Venue",
  "label.address": "Address",
  "label.hosts": "Hosts",
  "label.parents": "Parents",
  "label.godparents": "Godparents",
  "label.honorSponsors": "Honorary sponsors",
  "label.sponsors": "Sponsors",
  // The quinceañera's escorts keep the tradition's own name, as an English invitation writes it.
  "label.chambelanes": "Chambelanes",
  "label.familyOf": "Family of",
  "label.dressCode": "Dress code",
  "label.giftRegistry": "Gift registry",
  "label.ceremony": "Ceremony",
  "label.reception": "Reception",
  "label.mass": "Mass",
  "label.genderReveal": "Gender reveal",

  "birthday.ariaInvitation": "Birthday invitation for",
  "birthday.kicker": "You're invited to an adventure!",
  "birthday.sticker": "What an expedition!",
  "birthday.route": "The party route",
  "birthday.when": "When?",
  "birthday.whenTime": "What time?",
  "birthday.where": "Where?",
  "birthday.compassNorth": "N",
  "birthday.compassSouth": "S",
  "birthday.compassEast": "E",
  "birthday.compassWest": "W",
  "birthday.ageLabelOne": "Turning 1",
  "birthday.ageLabelMany": "Turning {age}",
  "birthday.ageUnitOne": "year",
  "birthday.ageUnitMany": "years",
  "birthday.posterKicker": "It's my party!",
  "birthday.posterLaughs": "of laughs",
  "birthday.ticketTitle": "Your admission ticket",
  "birthday.posterNameCheer": "{name}!",
  "birthday.ticketHours": "sharp",
  "birthday.storyOpener": "Once upon a time there was someone very special named",
  "birthday.storyNoAge":
    "and in this chapter of their story we are waiting for you. We want you to be part of the tale!",
  "birthday.storyTurns": "and in this chapter of their story turns",
  "birthday.storyExclaim": ". We want you to be part of the tale!",
  "birthday.chapterDetails": "Chapter 1 · Details",
  "birthday.chapterPlace": "Chapter 2 · Venue",
  "birthday.chapterMessage": "Chapter 3 · Message",
  "birthday.bigDay": "The big day",
  "birthday.storyContinues": "…and the party goes on with you.",

  "babyShower.ariaInvitation": "Baby shower invitation",
  "babyShower.ariaOf": "for",
  "babyShower.kicker": "Baby shower",
  "babyShower.kickerOf": "Baby shower for",
  "babyShower.details": "The details",
  "babyShower.photo": "The photo",
  "babyShower.genderRevealValue": "There will be a reveal!",
  "babyShower.expect": "We can't wait to see you!",

  "baptism.ariaInvitation": "Baptism invitation for",
  "baptism.kicker": "Baptism of",
  "baptism.photoCaption": "A day to remember",

  "xv.ariaInvitation": "Quinceañera invitation for",
  "xv.kicker": "My quinceañera",

  "wedding.ariaInvitation": "Wedding invitation for",
  "wedding.kicker": "Our wedding",
};

/** Both renderer dictionaries, keyed by the locale they render. */
const RENDERER_DICTIONARIES: Readonly<Record<Locale, Readonly<Record<RendererTextKey, string>>>> = {
  es: RENDERER_SPANISH_TEXTS,
  en: RENDERER_ENGLISH_TEXTS,
};

/** The zone a renderer's own date is read in: its content is a calendar day and a wall clock, never an instant. */
const RENDERER_ZONE = "UTC";

/** Every key the renderer dictionary declares, in the order the Spanish source declares them. */
export function rendererTextKeys(): readonly RendererTextKey[] {
  return Object.keys(RENDERER_SPANISH_TEXTS) as RendererTextKey[];
}

/**
 * The whole renderer dictionary of one locale, for a layout that reads several texts of the same page. An absent
 * locale reads as Spanish (L19.2), so the Spanish markup of a page that never asked for English is unchanged.
 */
export function rendererTextsFor(
  locale: Locale | undefined,
): Readonly<Record<RendererTextKey, string>> {
  return RENDERER_DICTIONARIES[locale ?? DEFAULT_LOCALE] ?? RENDERER_DICTIONARIES[DEFAULT_LOCALE];
}

/** The one fixed text of a locale (L19.2); this accessor is how a renderer's own words reach markup. */
export function rendererText(locale: Locale | undefined, key: RendererTextKey): string {
  return rendererTextsFor(locale)[key];
}

/** The `{age}` template of one count, with the number in it. */
function ageTemplate(template: string, age: number): string {
  return template.replace("{age}", String(age));
}

/**
 * The noon instant of a `YYYY-MM-DD` content date, so no zone shift can move the calendar day. A value that is not a
 * real calendar day answers nothing: `Date.UTC` would otherwise roll it over into another date.
 */
function calendarInstant(isoDate: string): Date | undefined {
  const [year, month, day] = isoDate.split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return undefined;
  }
  if (![year, month, day].every((part) => Number.isInteger(part))) {
    return undefined;
  }
  const instant = new Date(Date.UTC(year, month - 1, day, 12));
  const sameDay =
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day;

  return sameDay ? instant : undefined;
}

/**
 * The instant of an `HH:MM` content time on a fixed neutral day, so only the clock is formatted. A time outside the
 * day answers nothing, for the same reason: rolled over, it would read as a different hour.
 */
function clockInstant(time: string): Date | undefined {
  const [hour, minute] = time.split(":").map(Number);

  if (hour === undefined || minute === undefined) {
    return undefined;
  }
  if (![hour, minute].every((part) => Number.isInteger(part))) {
    return undefined;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }
  return new Date(Date.UTC(2000, 0, 1, hour, minute));
}

/**
 * The long date of a renderer's own content: «5 de diciembre de 2026» in Spanish, «December 5, 2026» in English. The
 * Spanish wording is the one the layouts wrote before the setting existed, unchanged; another locale formats it with
 * `Intl`. A value this runtime cannot format keeps that same Spanish wording, because a page never fails to render
 * over a missing line, and the parser already guaranteed the date is a real calendar day.
 */
export function rendererLongDate(locale: Locale | undefined, isoDate: string): string {
  if ((locale ?? DEFAULT_LOCALE) === DEFAULT_LOCALE) {
    return formatSpanishLongDate(isoDate);
  }
  const instant = calendarInstant(isoDate);
  const formatted =
    instant === undefined ? undefined : formatLongDate(locale as Locale, instant, RENDERER_ZONE);

  return formatted ?? formatSpanishLongDate(isoDate);
}

/**
 * The clock of a renderer's own content, without the Spanish «h»: «16:30» in Spanish, «4:30 PM» in English. One layout
 * prints the unit under the hour itself (the admission ticket of a birthday), so it needs the hour alone.
 *
 * The Spanish wording is the value as the owner typed it, exactly as the layouts wrote it before the setting existed;
 * another locale formats it with `Intl` and keeps the value unchanged when this runtime cannot format it.
 */
export function rendererWallClock(locale: Locale | undefined, time: string): string {
  if ((locale ?? DEFAULT_LOCALE) === DEFAULT_LOCALE) {
    return time;
  }
  const instant = clockInstant(time);
  const formatted =
    instant === undefined ? undefined : formatClockTime(locale as Locale, instant, RENDERER_ZONE);

  return formatted ?? time;
}

/**
 * The clock of a renderer's own content: «16:30 h» in Spanish, «4:30 PM» in English. The Spanish sentence marker is
 * the one the layouts wrote before the setting existed; English writes the hour alone, as it reads it.
 */
export function rendererClockTime(locale: Locale | undefined, time: string): string {
  const clock = rendererWallClock(locale, time);

  return (locale ?? DEFAULT_LOCALE) === DEFAULT_LOCALE ? `${clock} h` : clock;
}

/** The age line of a birthday layout: «Cumple 7 años», or «Turning 7» (L19.2). */
export function rendererAgeLabel(locale: Locale | undefined, age: number): string {
  const key: RendererTextKey = age === 1 ? "birthday.ageLabelOne" : "birthday.ageLabelMany";

  return ageTemplate(rendererText(locale, key), age);
}

/** The age unit a layout sets apart from the number: «año» and «años», or «year» and «years». */
export function rendererAgeUnit(locale: Locale | undefined, age: number): string {
  return rendererText(locale, age === 1 ? "birthday.ageUnitOne" : "birthday.ageUnitMany");
}
