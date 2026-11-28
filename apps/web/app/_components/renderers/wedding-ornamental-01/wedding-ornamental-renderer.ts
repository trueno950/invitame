import { createElement, type ReactElement } from "react";

import { weddingOrnamentalEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import type { Locale } from "../../../../lib/i18n/locale.ts";
import { rendererTextsFor } from "../../../../lib/i18n/renderer-texts.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { hiddenFieldSet, nameLines } from "../../../../lib/renderers/invitation-fields.ts";
import {
  parseWeddingOrnamentalConfiguration,
  parseWeddingOrnamentalContent,
  WEDDING_ORNAMENTAL_COMPONENT_KEY,
} from "../../../../lib/renderers/wedding-ornamental-01.ts";
import type { ArchDetail, ArchNameRow } from "../elegant-arch/arch-layout.ts";
import { OrnamentalLayout } from "../elegant-ornamental/ornamental-layout.ts";

/*
 * The `wedding-ornamental-01` invitation — «Ornamental» for a wedding (E4b; S5): the couple's two names in
 * script on a centered stationery card, the laurel monogram, the cameo, the families and the sponsors when
 * the couple announces them, one block per place of the day, the dress code and gift registry, the message
 * with its hashtag, and the RSVP. The shared `OrnamentalLayout` draws the form; this module reads the
 * wedding content and writes the few strings only a wedding uses.
 *
 * A server component with no client script: `.ts` + `createElement`.
 */

export interface WeddingOrnamentalRendererProperties {
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

export function WeddingOrnamentalRenderer({
  configuration,
  content,
  features,
  calendarHref,
  hiddenFields,
  locale,
}: WeddingOrnamentalRendererProperties): ReactElement {
  const { theme: themeKey } = parseWeddingOrnamentalConfiguration(configuration);
  const data = parseWeddingOrnamentalContent(content, hiddenFields);
  const hidden = hiddenFieldSet(hiddenFields);
  const theme = ELEGANT_THEME[themeKey];
  const texts = rendererTextsFor(locale);
  const couple = `${data.coupleNameOne} ${texts["invitation.nameJoin"]} ${data.coupleNameTwo}`;

  // A wedding that announces no family and no sponsors shows no family block at all.
  const family: ArchNameRow[] = [
    ...(data.firstFamilyParents === undefined
      ? []
      : [
          {
            key: "first-family",
            label: `${texts["label.familyOf"]} ${data.coupleNameOne}`,
            values: nameLines(data.firstFamilyParents),
          },
        ]),
    ...(data.secondFamilyParents === undefined
      ? []
      : [
          {
            key: "second-family",
            label: `${texts["label.familyOf"]} ${data.coupleNameTwo}`,
            values: nameLines(data.secondFamilyParents),
          },
        ]),
    ...(data.weddingSponsors === undefined
      ? []
      : [
          {
            key: "sponsors",
            label: texts["label.sponsors"],
            values: nameLines(data.weddingSponsors),
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
    componentKey: WEDDING_ORNAMENTAL_COMPONENT_KEY,
    theme,
    themeKey,
    ariaLabel: `${texts["wedding.ariaInvitation"]} ${couple}`,
    kicker: texts["wedding.kicker"],
    names: [data.coupleNameOne, data.coupleNameTwo],
    date: data.date,
    photoAlt: `${texts["invitation.photoAlt"]} ${couple}`,
    ...(hidden.has("ceremonyPlace")
      ? {}
      : {
          ceremony: {
            key: "ceremony",
            label: texts["label.ceremony"],
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
      : {
          message: {
            text: data.message,
            signature: couple,
            ...(data.hashtag === undefined ? {} : { hashtag: data.hashtag }),
          },
        }),
    ...(hidden.has("rsvpContact") ? {} : { rsvpContact: data.rsvpContact }),
    ...(data.mainPhoto === undefined ? {} : { mainPhoto: data.mainPhoto }),
    facts: weddingOrnamentalEventFacts(data, hiddenFields, locale),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
    ...(locale === undefined ? {} : { locale }),
  });
}
