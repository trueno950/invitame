import { createElement, type ReactElement } from "react";

import { baptismOrnamentalEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import {
  BAPTISM_ORNAMENTAL_COMPONENT_KEY,
  parseBaptismOrnamentalConfiguration,
  parseBaptismOrnamentalContent,
} from "../../../../lib/renderers/baptism-ornamental-01.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { nameLines } from "../../../../lib/renderers/invitation-fields.ts";
import type { ArchDetail, ArchNameRow } from "../elegant-arch/arch-layout.ts";
import { OrnamentalLayout } from "../elegant-ornamental/ornamental-layout.ts";

/*
 * The `baptism-ornamental-01` invitation — «Ornamental» for the formal baptism (E4b; S5), the third design
 * of the `baptism` category next to the themed «Clásica» and the elegant «Arco y foto». The content is the
 * themed baptism schema unchanged; the shared `OrnamentalLayout` draws the stationery card, the monogram,
 * the cameo, the parents and godparents, the two places, the gift registry when there is one, the message,
 * and the RSVP.
 *
 * A server component with no client script: `.ts` + `createElement`.
 */

export interface BaptismOrnamentalRendererProperties {
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

export function BaptismOrnamentalRenderer({
  configuration,
  content,
  features,
  calendarHref,
}: BaptismOrnamentalRendererProperties): ReactElement {
  const { theme: themeKey } = parseBaptismOrnamentalConfiguration(configuration);
  const data = parseBaptismOrnamentalContent(content);
  const theme = ELEGANT_THEME[themeKey];

  const family: ArchNameRow[] = [
    { key: "parents", label: "Padres", values: nameLines(data.parents) },
    { key: "godparents", label: "Padrinos", values: nameLines(data.godparents) },
  ];

  // The themed baptism schema has no dress code, so the details block only exists when there are gifts — and
  // only when the API gated them on (F7; S7). With no features at all this is a preview, and the content alone
  // decides, as it did before this batch.
  const giftRegistry = showsGiftRegistry(features, data.giftRegistry)
    ? data.giftRegistry
    : undefined;
  const details: ArchDetail[] =
    giftRegistry === undefined
      ? []
      : [{ key: "gift-registry", label: "Mesa de regalos", value: giftRegistry }];

  return h(OrnamentalLayout, {
    componentKey: BAPTISM_ORNAMENTAL_COMPONENT_KEY,
    theme,
    themeKey,
    ariaLabel: `Invitación de bautizo de ${data.celebrantName}`,
    kicker: "Bautizo de",
    names: [data.celebrantName],
    date: data.date,
    photoAlt: `Foto de ${data.celebrantName}`,
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
    message: { text: data.message, signature: data.celebrantName },
    rsvpContact: data.rsvpContact,
    ...(data.mainPhoto === undefined ? {} : { mainPhoto: data.mainPhoto }),
    facts: baptismOrnamentalEventFacts(data),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
  });
}
