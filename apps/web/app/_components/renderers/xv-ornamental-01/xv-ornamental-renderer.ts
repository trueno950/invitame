import { createElement, type ReactElement } from "react";

import { xvOrnamentalEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import type { InvitationFeatures } from "../../../../lib/invitation-features/invitation-features.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { nameLines } from "../../../../lib/renderers/invitation-fields.ts";
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
}

const h = createElement;

export function XVOrnamentalRenderer({
  configuration,
  content,
  features,
  calendarHref,
}: XVOrnamentalRendererProperties): ReactElement {
  const { theme: themeKey } = parseXVOrnamentalConfiguration(configuration);
  const data = parseXVOrnamentalContent(content);
  const theme = ELEGANT_THEME[themeKey];

  const family: ArchNameRow[] = [
    { key: "parents", label: "Padres", values: nameLines(data.parents) },
    {
      key: "honor-sponsors",
      label: "Padrinos de honor",
      values: nameLines(data.honorSponsors),
    },
    ...(data.chambelanes === undefined
      ? []
      : [{ key: "chambelanes", label: "Chambelanes", values: nameLines(data.chambelanes) }]),
  ];

  const details: ArchDetail[] = [
    { key: "dress-code", label: "Vestimenta", value: data.dressCode },
    ...(data.giftRegistry === undefined
      ? []
      : [{ key: "gift-registry", label: "Mesa de regalos", value: data.giftRegistry }]),
  ];

  return h(OrnamentalLayout, {
    componentKey: XV_ORNAMENTAL_COMPONENT_KEY,
    theme,
    themeKey,
    ariaLabel: `Invitación de XV años de ${data.celebrantName}`,
    kicker: "Mis XV años",
    names: [data.celebrantName],
    date: data.date,
    photoAlt: `Foto de ${data.celebrantName}`,
    ceremony: {
      key: "ceremony",
      label: "Misa",
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
    facts: xvOrnamentalEventFacts(data),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
  });
}
