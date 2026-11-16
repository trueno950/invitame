import { createElement, type ReactElement } from "react";

import { weddingOrnamentalEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { nameLines } from "../../../../lib/renderers/invitation-fields.ts";
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
}

const h = createElement;

export function WeddingOrnamentalRenderer({
  configuration,
  content,
  features,
  calendarHref,
}: WeddingOrnamentalRendererProperties): ReactElement {
  const { theme: themeKey } = parseWeddingOrnamentalConfiguration(configuration);
  const data = parseWeddingOrnamentalContent(content);
  const theme = ELEGANT_THEME[themeKey];
  const couple = `${data.coupleNameOne} y ${data.coupleNameTwo}`;

  // A wedding that announces no family and no sponsors shows no family block at all.
  const family: ArchNameRow[] = [
    ...(data.firstFamilyParents === undefined
      ? []
      : [
          {
            key: "first-family",
            label: `Familia de ${data.coupleNameOne}`,
            values: nameLines(data.firstFamilyParents),
          },
        ]),
    ...(data.secondFamilyParents === undefined
      ? []
      : [
          {
            key: "second-family",
            label: `Familia de ${data.coupleNameTwo}`,
            values: nameLines(data.secondFamilyParents),
          },
        ]),
    ...(data.weddingSponsors === undefined
      ? []
      : [
          {
            key: "sponsors",
            label: "Padrinos",
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
    { key: "dress-code", label: "Vestimenta", value: data.dressCode },
    ...(giftRegistry === undefined
      ? []
      : [{ key: "gift-registry", label: "Mesa de regalos", value: giftRegistry }]),
  ];

  return h(OrnamentalLayout, {
    componentKey: WEDDING_ORNAMENTAL_COMPONENT_KEY,
    theme,
    themeKey,
    ariaLabel: `Invitación de boda de ${couple}`,
    kicker: "Nuestra boda",
    names: [data.coupleNameOne, data.coupleNameTwo],
    date: data.date,
    photoAlt: `Foto de ${couple}`,
    ceremony: {
      key: "ceremony",
      label: "Ceremonia",
      place: data.ceremonyPlace,
      address: data.ceremonyAddress,
      time: data.ceremonyTime,
    },
    reception: {
      key: "reception",
      label: "Recepción",
      place: data.receptionPlace,
      address: data.receptionAddress,
      time: data.receptionTime,
    },
    family,
    details,
    message: {
      text: data.message,
      signature: couple,
      ...(data.hashtag === undefined ? {} : { hashtag: data.hashtag }),
    },
    rsvpContact: data.rsvpContact,
    ...(data.mainPhoto === undefined ? {} : { mainPhoto: data.mainPhoto }),
    facts: weddingOrnamentalEventFacts(data),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
  });
}
