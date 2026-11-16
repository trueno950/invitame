import { createElement, type ReactElement } from "react";

import { baptismArchEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import type { InvitationFeatures } from "../../../../lib/invitation-features/invitation-features.ts";
import {
  parseBaptismArchConfiguration,
  parseBaptismArchContent,
} from "../../../../lib/renderers/baptism-arch-01.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { nameLines } from "../../../../lib/renderers/invitation-fields.ts";
import { type ArchDetail, ArchLayout, type ArchNameRow } from "../elegant-arch/arch-layout.ts";

/*
 * The `baptism-arch-01` invitation — «Arco y foto» for the formal baptism (E3c; S3, S4), the elegant version
 * of `baptism-classic-01` that sits next to it in the `baptism` category. The content is the themed baptism
 * schema unchanged; the shared `ArchLayout` draws the arch, the seal, the parents and godparents, the two
 * places, the gift registry when there is one, the message, and the RSVP.
 *
 * A server component with no client script: `.ts` + `createElement`.
 */

export interface BaptismArchRendererProperties {
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

export function BaptismArchRenderer({
  configuration,
  content,
  features,
  calendarHref,
}: BaptismArchRendererProperties): ReactElement {
  const { theme: themeKey } = parseBaptismArchConfiguration(configuration);
  const data = parseBaptismArchContent(content);
  const theme = ELEGANT_THEME[themeKey];

  const family: ArchNameRow[] = [
    { key: "parents", label: "Padres", values: nameLines(data.parents) },
    { key: "godparents", label: "Padrinos", values: nameLines(data.godparents) },
  ];

  // The themed baptism schema has no dress code, so the details card only exists when there are gifts.
  const details: ArchDetail[] =
    data.giftRegistry === undefined
      ? []
      : [{ key: "gift-registry", label: "Mesa de regalos", value: data.giftRegistry }];

  return h(ArchLayout, {
    componentKey: "baptism-arch-01",
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
    facts: baptismArchEventFacts(data),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
  });
}
