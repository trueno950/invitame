import { createElement, type ReactElement } from "react";

import { baptismArchEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import {
  parseBaptismArchConfiguration,
  parseBaptismArchContent,
} from "../../../../lib/renderers/baptism-arch-01.ts";
import { ELEGANT_THEME } from "../../../../lib/renderers/elegant-themes.ts";
import { hiddenFieldSet, nameLines } from "../../../../lib/renderers/invitation-fields.ts";
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
  /** The content fields of the sections this customer switched off (S8.3); absent hides nothing. */
  readonly hiddenFields?: readonly string[];
}

const h = createElement;

export function BaptismArchRenderer({
  configuration,
  content,
  features,
  calendarHref,
  hiddenFields,
}: BaptismArchRendererProperties): ReactElement {
  const { theme: themeKey } = parseBaptismArchConfiguration(configuration);
  const data = parseBaptismArchContent(content, hiddenFields);
  const hidden = hiddenFieldSet(hiddenFields);
  const theme = ELEGANT_THEME[themeKey];

  // A section the customer switched off draws nothing, and a row it covered arrives empty (S8.3).
  const family: ArchNameRow[] = [
    ...(hidden.has("parents")
      ? []
      : [{ key: "parents", label: "Padres", values: nameLines(data.parents) }]),
    ...(hidden.has("godparents")
      ? []
      : [{ key: "godparents", label: "Padrinos", values: nameLines(data.godparents) }]),
  ];

  // The themed baptism schema has no dress code, so the details card only exists when there are gifts — and
  // only when the API gated them on (F7; S7). With no features at all this is a preview, and the content alone
  // decides, as it did before this batch.
  const giftRegistry = showsGiftRegistry(features, data.giftRegistry)
    ? data.giftRegistry
    : undefined;
  const details: ArchDetail[] =
    giftRegistry === undefined
      ? []
      : [{ key: "gift-registry", label: "Mesa de regalos", value: giftRegistry }];

  return h(ArchLayout, {
    componentKey: "baptism-arch-01",
    theme,
    themeKey,
    ariaLabel: `Invitación de bautizo de ${data.celebrantName}`,
    kicker: "Bautizo de",
    names: [data.celebrantName],
    date: data.date,
    photoAlt: `Foto de ${data.celebrantName}`,
    ...(hidden.has("ceremonyPlace")
      ? {}
      : {
          ceremony: {
            key: "ceremony",
            label: "Ceremonia",
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
            label: "Recepción",
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
    facts: baptismArchEventFacts(data, hiddenFields),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
  });
}
