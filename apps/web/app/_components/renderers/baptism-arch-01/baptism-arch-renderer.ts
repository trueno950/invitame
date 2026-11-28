import { createElement, type ReactElement } from "react";

import { baptismArchEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import type { Locale } from "../../../../lib/i18n/locale.ts";
import { rendererTextsFor } from "../../../../lib/i18n/renderer-texts.ts";
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
  /** The locale the guest page renders (F14; L19.2); absent reads as Spanish. */
  readonly locale?: Locale;
}

const h = createElement;

export function BaptismArchRenderer({
  configuration,
  content,
  features,
  calendarHref,
  hiddenFields,
  locale,
}: BaptismArchRendererProperties): ReactElement {
  const { theme: themeKey } = parseBaptismArchConfiguration(configuration);
  const data = parseBaptismArchContent(content, hiddenFields);
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
    ...(hidden.has("godparents")
      ? []
      : [
          {
            key: "godparents",
            label: texts["label.godparents"],
            values: nameLines(data.godparents),
          },
        ]),
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
      : [{ key: "gift-registry", label: texts["label.giftRegistry"], value: giftRegistry }];

  return h(ArchLayout, {
    componentKey: "baptism-arch-01",
    theme,
    themeKey,
    ariaLabel: `${texts["baptism.ariaInvitation"]} ${data.celebrantName}`,
    kicker: texts["baptism.kicker"],
    names: [data.celebrantName],
    date: data.date,
    photoAlt: `${texts["invitation.photoAlt"]} ${data.celebrantName}`,
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
      : { message: { text: data.message, signature: data.celebrantName } }),
    ...(hidden.has("rsvpContact") ? {} : { rsvpContact: data.rsvpContact }),
    ...(data.mainPhoto === undefined ? {} : { mainPhoto: data.mainPhoto }),
    facts: baptismArchEventFacts(data, hiddenFields, locale),
    ...(features === undefined ? {} : { features }),
    ...(calendarHref === undefined ? {} : { calendarHref }),
    ...(locale === undefined ? {} : { locale }),
  });
}
