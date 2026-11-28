import { createElement, type ReactElement } from "react";

import { xvOrnamentalEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import type { Locale } from "../../../../lib/i18n/locale.ts";
import { rendererTextsFor } from "../../../../lib/i18n/renderer-texts.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { hiddenFieldSet, nameLines } from "../../../../lib/renderers/invitation-fields.ts";
import {
  parseXVOrnamentalConfiguration,
  parseXVOrnamentalContent,
  XV_ORNAMENTAL_COMPONENT_KEY,
} from "../../../../lib/renderers/xv-ornamental-01.ts";
import type { ArchDetail, ArchNameRow } from "../elegant-arch/arch-layout.ts";
import { OrnamentalLayout } from "../elegant-ornamental/ornamental-layout.ts";

/*
 * The `xv-ornamental-01` invitation — «Ornamental» for XV años (E4b; S5), following
 * `design/elegant-line/02-ornamental.html`: a centered stationery card with a double rule over textured
 * paper, the laurel monogram, the name in script, the photo as a cameo, the family card with the honor
 * sponsors and the chambelanes when there are any, one block per place of the day, the dress code and gift
 * registry, the message, and the RSVP. The shared `OrnamentalLayout` draws the form; this module reads the
 * XV content — the same fifteen fields «Arco y foto» reads — and writes the few strings only an XV uses.
 *
 * A server component with no client script: `.ts` + `createElement`, because `node --test` strips types but
 * does not compile JSX.
 */

export interface XVOrnamentalRendererProperties {
  /** The `TemplateVersion.configuration` snapshot; parsed here, so an invalid one throws. */
  readonly configuration: unknown;
  /** The invitation data that fits the version's schema; parsed here, so an invalid one throws. */
  readonly content: unknown;
  /** The features the API gated for this invitation; absent when it has none, which renders nothing. */
  readonly features?: InvitationFeatures;
  /** The `.ics` download the public page owns; absent leaves the Google Calendar link alone. */
  readonly calendarHref?: string;
  /** The content fields of the sections this customer switched off (S8.3); absent hides nothing. */
  readonly hiddenFields?: readonly string[];
  /** The locale the guest page renders (F14; L19.2); absent reads as Spanish. */
  readonly locale?: Locale;
}

const h = createElement;

export function XVOrnamentalRenderer({
  configuration,
  content,
  features,
  calendarHref,
  hiddenFields,
  locale,
}: XVOrnamentalRendererProperties): ReactElement {
  const { theme: themeKey } = parseXVOrnamentalConfiguration(configuration);
  const data = parseXVOrnamentalContent(content, hiddenFields);
  const hidden = hiddenFieldSet(hiddenFields);
  const theme = ELEGANT_THEME[themeKey];
  const texts = rendererTextsFor(locale);

  // A section the customer switched off draws nothing, and a row it covered arrives empty (S8.3).
  const family: ArchNameRow[] = [
    ...(hidden.has("parents")
      ? []
      : [
          {
            key: "parents",
            label: texts["label.parents"],
            values: nameLines(data.parents),
          },
        ]),
    ...(hidden.has("honorSponsors")
      ? []
      : [
          {
            key: "honor-sponsors",
            label: texts["label.honorSponsors"],
            values: nameLines(data.honorSponsors),
          },
        ]),
    ...(data.chambelanes === undefined
      ? []
      : [
          {
            key: "chambelanes",
            label: texts["label.chambelanes"],
            values: nameLines(data.chambelanes),
          },
        ]),
  ];

  // The gift registry is rendered only when the API gated it on and the content carries a value (F7; S7);
  // with no features at all this is a preview, and the content alone decides, as it did before this batch.
  const giftRegistry = showsGiftRegistry(features, data.giftRegistry)
    ? data.giftRegistry
    : undefined;

  const details: ArchDetail[] = [
    ...(hidden.has("dressCode")
      ? []
      : [{ key: "dress-code", label: texts["label.dressCode"], value: data.dressCode }]),
    ...(giftRegistry === undefined
      ? []
      : [{ key: "gift-registry", label: texts["label.giftRegistry"], value: giftRegistry }]),
  ];

  return h(OrnamentalLayout, {
    componentKey: XV_ORNAMENTAL_COMPONENT_KEY,
    theme,
    themeKey,
    ariaLabel: `${texts["xv.ariaInvitation"]} ${data.celebrantName}`,
    kicker: texts["xv.kicker"],
    names: [data.celebrantName],
    date: data.date,
    photoAlt: `${texts["invitation.photoAlt"]} ${data.celebrantName}`,
    ...(hidden.has("ceremonyPlace")
      ? {}
      : {
          ceremony: {
            key: "ceremony",
            label: texts["label.mass"],
            place: data.ceremonyPlace,
            address: data.ceremonyAddress,
            time: data.ceremonyTime,
          },
        }),
    ...(hidden.has("receptionPlace")
      ? {}
      : {
          reception: {
            key: "reception",
            label: texts["label.reception"],
            place: data.receptionPlace,
            address: data.receptionAddress,
            time: data.receptionTime,
          },
        }),
    family,
    details,
    ...(hidden.has("message")
      ? {}
      : { message: { text: data.message, signature: data.celebrantName } }),
    ...(hidden.has("rsvpContact") ? {} : { rsvpContact: data.rsvpContact }),
    ...(data.mainPhoto === undefined ? {} : { mainPhoto: data.mainPhoto }),
    facts: xvOrnamentalEventFacts(data, hiddenFields, locale),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
    ...(locale === undefined ? {} : { locale }),
  });
}
