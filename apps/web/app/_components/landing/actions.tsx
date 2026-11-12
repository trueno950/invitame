import Link from "next/link";

import type {
  AccountAction,
  ComingSoonAction,
  PageAnchor,
  SignInAction,
} from "../../../lib/landing/copy.ts";
import { Ornament } from "../ornament.tsx";
import { focusRing } from "../ui.ts";
import styles from "./landing.module.css";

/*
 * The three kinds of landing actions (M2 T8l; S37). Only «Ingresar» leads somewhere; an in-page
 * anchor only scrolls; a coming-soon action is a quiet label, never a link or a button. Every target
 * comes from `lib/landing/copy.ts`, whose test checks the rules.
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

interface SignInLinkProperties {
  /** «Ingresar», or «Mi cuenta» when the visitor already has a session. */
  action: SignInAction | AccountAction;
  small?: boolean;
}

/** «Ingresar», the only active product action: the wine button to `/ingresar`. */
export function SignInLink({ action, small = false }: SignInLinkProperties) {
  return (
    <Link
      className={`${styles.btn} ${styles.btnPrimary} ${small ? styles.btnSmall : ""} ${focusRing}`}
      href={action.href}
    >
      {action.label}
      <span className={styles.btnIcon}>
        <ArrowIcon />
      </span>
    </Link>
  );
}

interface AnchorLinkProperties {
  anchor: PageAnchor;
  variant: "primary" | "ghost";
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

/** A product action that does not exist yet, shown as «Próximamente». */
export function ComingSoon({ action }: { action: ComingSoonAction }) {
  return (
    <span className={styles.soon}>
      <Ornament name="bud" />
      {action.label}
    </span>
  );
}
