import Link from "next/link";
import type { ReactElement } from "react";

import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import type { InvitationRenderer, InvitationRow } from "../../../../lib/customer/invitations.ts";
import { NAVIGATION_COPY } from "../../../../lib/customer/navigation-copy.ts";
import { rendererAcceptsProps } from "../../../../lib/public/invitation-render.ts";
import { findRenderer } from "../../../../lib/renderers/registry.ts";
import { textButton } from "../../../_components/ui.ts";
import { StatusBadge } from "./status-badge.tsx";

/*
 * One card of "Mis invitaciones" (T2; S2.6). The owner recognized an invitation only by its generated slug, so the
 * card now names the celebration, states its date, and draws a miniature of the invitation's own layout beside them,
 * while the status, «Editar», and «Ver invitación» stay where they were (S7, S3).
 *
 * The miniature is the real, allow-listed renderer drawing the stored content, never a screenshot, and it follows the
 * scaled-miniature approach of the chooser's cards (`template-choice-card.tsx`): the renderer draws its own
 * viewport-sized background layer with `position: fixed`, so the scaled wrapper becomes the containing block of that
 * layer and `contain: paint` clips it to the frame, and a miniature never paints behind the page.
 */

/** The layouts draw a phone-width page of 390 px, and the card shows the top of it, scaled down. */
const RENDER_WIDTH = 390;
/** The miniature's frame: a 3:4 thumbnail that still leaves the card's text room on a phone. */
const FRAME_WIDTH = 84;
const FRAME_HEIGHT = 112;

/**
 * The renderer data this card can actually draw, or null while there is nothing to draw (S2.6, S3): this deployment
 * implements no renderer for the key, or the stored content does not satisfy the renderer's own contract yet — which is
 * the ordinary state of a draft the owner has not finished. The card then shows its text alone, never a broken layout.
 */
function drawable(renderer: InvitationRenderer): InvitationRenderer | null {
  if (findRenderer(renderer.componentKey) === undefined) {
    return null;
  }

  const props = { configuration: renderer.configuration, content: renderer.content };

  return rendererAcceptsProps(renderer.componentKey, props) ? renderer : null;
}

/** One scaled, clipped page of the real renderer; nothing at all when this deployment does not implement it. */
function Miniature({ renderer }: { renderer: InvitationRenderer }): ReactElement | null {
  const Renderer = findRenderer(renderer.componentKey);

  if (Renderer === undefined) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-gold/45"
      data-miniature=""
      style={{ contain: "paint", width: FRAME_WIDTH, height: FRAME_HEIGHT }}
    >
      <div
        className="origin-top-left"
        style={{ width: RENDER_WIDTH, transform: `scale(${FRAME_WIDTH / RENDER_WIDTH})` }}
      >
        <Renderer configuration={renderer.configuration} content={renderer.content} />
      </div>
    </div>
  );
}

/**
 * One invitation of the list: its miniature, the celebration's name, its date (or, while the invitation states none,
 * the slug the old card showed), the status in words, when it was created, and the two ways on — edit it, or read it
 * as a guest while it is published. Every fact is text as well as tone, so nothing here depends on a color (S3).
 */
export function InvitationCard({ row }: { row: InvitationRow }): ReactElement {
  const secondary =
    row.eventDate === null
      ? NAVIGATION_COPY.cardSlug(row.slug)
      : NAVIGATION_COPY.cardDate(row.eventDate);
  const miniature = row.renderer === null ? null : drawable(row.renderer);

  return (
    <li className="flex flex-col gap-3 rounded-panel bg-surface/90 p-4 shadow-soft ring-1 ring-gold/45">
      <div className="flex items-start gap-3">
        {miniature === null ? null : <Miniature renderer={miniature} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-display text-lg leading-snug font-semibold break-words text-pretty text-ink">
            {row.title}
          </p>
          <p className="text-sm break-words text-muted">{secondary}</p>
          <div className="mt-0.5 self-start">
            <StatusBadge label={row.statusLabel} />
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">{INVITATION_COPY.createdOn(row.createdOn)}</p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <Link className={textButton} href={row.href}>
          {INVITATION_COPY.editLink}
        </Link>
        {row.publicHref === null ? null : (
          <Link className={textButton} href={row.publicHref} rel="noreferrer" target="_blank">
            {INVITATION_COPY.viewPublic}
          </Link>
        )}
      </div>
    </li>
  );
}
