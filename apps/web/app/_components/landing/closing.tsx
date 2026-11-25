import Link from "next/link";

import { accountAction, LANDING_COPY } from "../../../lib/landing/copy.ts";
import { Ornament } from "../ornament.tsx";
import { focusRing } from "../ui.ts";
import { Wordmark } from "../wordmark.tsx";
import { CreateInvitationLink, SignInLink } from "./actions.tsx";
import { Art } from "./art.tsx";
import styles from "./landing.module.css";

const { closing, footer, hero } = LANDING_COPY;

/** The closing band: the wax seal in its crest, the invitation, and the two ways forward. */
export function ClosingBand({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="cierre-title" className={styles.section}>
      <div className={`${styles.wrap} ${styles.closingShell}`}>
        <div className={styles.closing}>
          <Art className={`${styles.closingRoses} ${styles.closingRosesLow}`} name="bouquet" />
          <Art className={`${styles.closingRoses} ${styles.closingRosesHigh}`} name="bouquet" />
          <div aria-hidden="true" className={styles.crest}>
            <span className={styles.seal}>
              <span className={styles.monogram}>{hero.monogram}</span>
            </span>
          </div>
          <h2 className={`${styles.sectionTitle} ${styles.closingTitle}`} id="cierre-title">
            {closing.heading}
          </h2>
          <p className={styles.closingBody}>{closing.body}</p>
          <div className={styles.closingActions}>
            <CreateInvitationLink action={closing.create} />
            <SignInLink action={signedIn ? accountAction(true) : closing.account} variant="ghost" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter({ signedIn }: { signedIn: boolean }) {
  const account = signedIn ? accountAction(true) : footer.signIn;
  return (
    <footer className={styles.footer}>
      <Ornament className={styles.footerDivider} name="divider" />
      <div className={`${styles.wrap} ${styles.footerRow}`}>
        <Wordmark />
        <nav aria-label={footer.label} className={styles.footerNav}>
          {footer.links.map((link) => (
            <a className={`${styles.footerLink} ${focusRing}`} href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
          <Link className={`${styles.footerLink} ${focusRing}`} href={account.href}>
            {account.label}
          </Link>
        </nav>
        <small className={styles.footerNote}>{footer.copyright(new Date().getFullYear())}</small>
      </div>
    </footer>
  );
}
