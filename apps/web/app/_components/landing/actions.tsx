import Link from "next/link";

import type {
  AccountAction,
  CreateInvitationAction,
  PageAnchor,
  SignInAction,
} from "../../../lib/landing/copy.ts";
import { focusRing } from "../ui.ts";
import styles from "./landing.module.css";

/*
 * The kinds of landing actions (odd/tasks/launch-landing.md; S2). «Ingresar» leads to the sign-in
 * page, «Crear mi invitación» starts a new invitation, and an in-page anchor only scrolls. Every
 * target comes from `lib/landing/copy.ts`, whose test checks the rules. A link is always an anchor
 * element, never a button, so the landing needs no client JavaScript.
 */

function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M3 13 13 3M6 3h7v7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function RightIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M2.5 8h11M9.5 4l4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M8 3v10M3.5 8.5 8 13l4.5-4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

type ButtonVariant = "primary" | "ghost";

interface ButtonLinkProperties {
  href: string;
  label: string;
  variant: ButtonVariant;
  small: boolean;
  icon: "arrow" | "right";
}

/** A pill link of the landing: the wine primary style or the quiet outlined one. */
function ButtonLink({ href, label, variant, small, icon }: ButtonLinkProperties) {
  const look = variant === "primary" ? styles.btnPrimary : styles.btnGhost;
  return (
    <Link
      className={`${styles.btn} ${look} ${small ? styles.btnSmall : ""} ${focusRing}`}
      href={href}
    >
      {label}
      <span className={styles.btnIcon}>{icon === "right" ? <RightIcon /> : <ArrowIcon />}</span>
    </Link>
  );
}

interface SignInLinkProperties {
  /** «Ingresar», or «Mi cuenta» when the visitor already has a session. */
  action: SignInAction | AccountAction;
  variant?: ButtonVariant;
  small?: boolean;
}

/** «Ingresar» (or «Mi cuenta»): the way into an existing account. */
export function SignInLink({ action, variant = "primary", small = false }: SignInLinkProperties) {
  return (
    <ButtonLink
      href={action.href}
      icon="arrow"
      label={action.label}
      small={small}
      variant={variant}
    />
  );
}

interface CreateInvitationLinkProperties {
  /** «Crear mi invitación» in the hero and the closing band, «Empezar» inside a package card. */
  action: CreateInvitationAction;
  variant?: ButtonVariant;
  small?: boolean;
}

/** The primary product action: it starts a new invitation in the customer workspace (S2). */
export function CreateInvitationLink({
  action,
  variant = "primary",
  small = false,
}: CreateInvitationLinkProperties) {
  return (
    <ButtonLink
      href={action.href}
      icon="right"
      label={action.label}
      small={small}
      variant={variant}
    />
  );
}

interface AnchorLinkProperties {
  anchor: PageAnchor;
  variant: ButtonVariant;
}

/** A button-shaped link that only scrolls to a section of the landing. */
export function AnchorLink({ anchor, variant }: AnchorLinkProperties) {
  const look = variant === "primary" ? styles.btnPrimary : styles.btnGhost;
  return (
    <a className={`${styles.btn} ${look} ${focusRing}`} href={anchor.href}>
      {anchor.label}
      <span className={styles.btnIcon}>
        <DownIcon />
      </span>
    </a>
  );
}
