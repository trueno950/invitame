import {
  type BabyShowerContent,
  parseBabyShowerClassicContent,
} from "../renderers/baby-shower-classic-01.ts";
import {
  type BaptismContent,
  parseBaptismClassicContent,
} from "../renderers/baptism-classic-01.ts";
import type { BirthdayContent } from "../renderers/birthday-content.ts";
import { parseBirthdayMapContent } from "../renderers/birthday-map-01.ts";
import { parseBirthdayPosterContent } from "../renderers/birthday-poster-01.ts";
import { parseBirthdayStoryContent } from "../renderers/birthday-story-01.ts";

/**
 * The event facts of a layout (S4): the celebration's title, when it starts, and the places a guest can be
 * sent to. The features block needs them for the countdown, the calendar, and the map, and they are read
 * from the layout's own content — the address fields the invitation already shows — so no guest feature ever
 * asks the owner for the same data twice.
 *
 * `EVENT_FACTS` is the allow-listed `componentKey -> facts` map, the second place where a key becomes code
 * besides `lib/renderers/registry.ts`. Every entry is a pure function of one content snapshot: it parses that
 * snapshot with the layout's own parser, so a drifted invitation fails here exactly as it fails in the
 * renderer, and it returns fresh, frozen-in-spirit data without touching its input.
 */

/** One place of the celebration, in the words the layout uses: «Lugar», «Ceremonia», «Recepción». */
export interface EventPlace {
  readonly label: string;
  readonly name: string;
  readonly address: string;
}

/** Everything a guest feature needs to know about the celebration itself. */
export interface EventFacts {
  /** The celebration's name, as the calendar and the WhatsApp greeting say it. */
  readonly title: string;
  /** The calendar day, as `YYYY-MM-DD`. */
  readonly date: string;
  /** The start time, as `HH:MM`, in the invitation's time zone. */
  readonly time: string;
  /** At least one place; a baptism has its ceremony and its reception. */
  readonly places: readonly EventPlace[];
}

/** The facts function of one layout: pure, and it refuses content its layout cannot render. */
export type EventFactsOf = (content: unknown) => EventFacts;

/** The three birthday layouts share one content shape, so they share one mapping. */
function birthdayFacts(content: BirthdayContent): EventFacts {
  return {
    title: `Cumpleaños de ${content.celebrantName}`,
    date: content.date,
    time: content.time,
    places: [{ label: "Lugar", name: content.location, address: content.address }],
  };
}

/** The facts of a stored `birthday-map-01` invitation. */
export function birthdayMapEventFacts(content: unknown): EventFacts {
  return birthdayFacts(parseBirthdayMapContent(content));
}

/** The facts of a stored `birthday-poster-01` invitation. */
export function birthdayPosterEventFacts(content: unknown): EventFacts {
  return birthdayFacts(parseBirthdayPosterContent(content));
}

/** The facts of a stored `birthday-story-01` invitation. */
export function birthdayStoryEventFacts(content: unknown): EventFacts {
  return birthdayFacts(parseBirthdayStoryContent(content));
}

/**
 * The facts of a stored `baby-shower-classic-01` invitation. A shower whose baby's name is a surprise is
 * named after the hosts, so the calendar and the greeting never say «Baby shower» alone.
 */
function babyShowerFacts(content: BabyShowerContent): EventFacts {
  const celebration = content.babyName ?? content.hosts;

  return {
    title: `Baby shower de ${celebration}`,
    date: content.date,
    time: content.time,
    places: [{ label: "Lugar", name: content.location, address: content.address }],
  };
}

/** The facts of a stored `baby-shower-classic-01` invitation. */
export function babyShowerEventFacts(content: unknown): EventFacts {
  return babyShowerFacts(parseBabyShowerClassicContent(content));
}

/**
 * The facts of a baptism: the ceremony starts the day, and the reception is the second place, so the map,
 * the calendar description, and the copy all carry both.
 */
function baptismFacts(content: BaptismContent): EventFacts {
  return {
    title: `Bautizo de ${content.celebrantName}`,
    date: content.date,
    time: content.ceremonyTime,
    places: [
      { label: "Ceremonia", name: content.ceremonyPlace, address: content.ceremonyAddress },
      { label: "Recepción", name: content.receptionPlace, address: content.receptionAddress },
    ],
  };
}

/** The facts of a stored `baptism-classic-01` invitation. */
export function baptismEventFacts(content: unknown): EventFacts {
  return baptismFacts(parseBaptismClassicContent(content));
}

/** The allow-listed facts functions, keyed by the `componentKey` they belong to. */
export const EVENT_FACTS: ReadonlyMap<string, EventFactsOf> = new Map<string, EventFactsOf>([
  ["birthday-map-01", birthdayMapEventFacts],
  ["birthday-poster-01", birthdayPosterEventFacts],
  ["birthday-story-01", birthdayStoryEventFacts],
  ["baby-shower-classic-01", babyShowerEventFacts],
  ["baptism-classic-01", baptismEventFacts],
]);

/** The facts of a stored invitation, or undefined for a key this map does not allow. */
export function eventFactsFor(componentKey: string, content: unknown): EventFacts | undefined {
  const facts = EVENT_FACTS.get(componentKey);

  return facts === undefined ? undefined : facts(content);
}
