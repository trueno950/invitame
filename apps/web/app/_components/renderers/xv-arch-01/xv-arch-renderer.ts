import { createElement, type ReactElement } from "react";

import { xvArchEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { nameLines } from "../../../../lib/renderers/invitation-fields.ts";
import {
  parseXVArchConfiguration,
  parseXVArchContent,
} from "../../../../lib/renderers/xv-arch-01.ts";
import { type ArchDetail, ArchLayout, type ArchNameRow } from "../elegant-arch/arch-layout.ts";

/*
 * The `xv-arch-01` invitation — «Arco y foto» for XV años (E3c; S3, S4), following
 * `design/elegant-line/03-arco-y-foto.html`: the photo in an arch, the name over a measured scrim, the wax
 * seal, the family card with the honor sponsors and the chambelanes when there are any, one card per place of
 * the day, the dress code and gift registry, the message, and the RSVP. The shared `ArchLayout` draws the
 * form; this module reads the XV content and writes the few strings only an XV uses.
 *
 * A server component with no client script: `.ts` + `createElement`, because `node --test` strips types but
 * does not compile JSX.
 */

export interface XVArchRendererProperties {
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

export function XVArchRenderer({
  configuration,
  content,
  features,
  calendarHref,
}: XVArchRendererProperties): ReactElement {
  const { theme: themeKey } = parseXVArchConfiguration(configuration);
  const data = parseXVArchContent(content);
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

  return h(ArchLayout, {
    componentKey: "xv-arch-01",
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
    facts: xvArchEventFacts(data),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
  });
}
