import { createElement, type ReactElement } from "react";

import { weddingArchEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import type { Locale } from "../../../../lib/i18n/locale.ts";
import { rendererTextsFor } from "../../../../lib/i18n/renderer-texts.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { hiddenFieldSet, nameLines } from "../../../../lib/renderers/invitation-fields.ts";
import {
  parseWeddingArchConfiguration,
  parseWeddingArchContent,
  WEDDING_ARCH_COMPONENT_KEY,
} from "../../../../lib/renderers/wedding-arch-01.ts";
import { type ArchDetail, ArchLayout, type ArchNameRow } from "../elegant-arch/arch-layout.ts";

/*
 * The `wedding-arch-01` invitation — «Arco y foto» for a wedding (E3c; S3, S4), following
 * `design/elegant-line/03-arco-y-foto.html`: the couple's two names in the arch, the wax seal, the families
 * and the sponsors when the couple announces them, one card per place of the day, the dress code and gift
 * registry, the message with its hashtag, and the RSVP. The shared `ArchLayout` draws the form; this module
 * reads the wedding content and writes the few strings only a wedding uses.
 *
 * A server component with no client script: `.ts` + `createElement`.
 */

export interface WeddingArchRendererProperties {
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

export function WeddingArchRenderer({
  configuration,
  content,
  features,
  calendarHref,
  hiddenFields,
  locale,
}: WeddingArchRendererProperties): ReactElement {
  const { theme: themeKey } = parseWeddingArchConfiguration(configuration);
  const data = parseWeddingArchContent(content, WEDDING_ARCH_COMPONENT_KEY, hiddenFields);
  const hidden = hiddenFieldSet(hiddenFields);
  const theme = ELEGANT_THEME[themeKey];
  const texts = rendererTextsFor(locale);
  const couple = `${data.coupleNameOne} ${texts["invitation.nameJoin"]} ${data.coupleNameTwo}`;

  // A wedding that announces no family and no sponsors shows no family card at all.
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

  return h(ArchLayout, {
    componentKey: "wedding-arch-01",
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
    facts: weddingArchEventFacts(data, hiddenFields),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
    ...(locale === undefined ? {} : { locale }),
  });
}
