import Link from "next/link";

import { LANDING_COPY } from "../../../lib/landing/copy.ts";
import { Ornament } from "../ornament.tsx";
import { focusRing } from "../ui.ts";
import { Wordmark } from "../wordmark.tsx";
import { ComingSoon, SignInLink } from "./actions.tsx";
import { Art, type ArtName, pick } from "./art.tsx";
import styles from "./landing.module.css";
import { SectionHead } from "./sections.tsx";

const { experience, closing, footer, hero } = LANDING_COPY;

const PERK_ICONS: readonly [ArtName, ...ArtName[]] = ["iconCalendar", "iconPin", "iconHeart"];

/** The guest experience, shown on an example phone; its features are still coming (S37). */
export function GuestExperience() {
  const { phone } = experience;
  return (
    <section
      aria-labelledby="experiencia-title"
      className={`${styles.section} ${styles.experience}`}
    >
      <div className={`${styles.wrap} ${styles.experienceGrid}`}>
        <div>
          <SectionHead
            eyebrow={experience.eyebrow}
            flourish={false}
            heading={experience.heading}
            id="experiencia-title"
            intro={experience.intro}
          />
          <ul className={styles.perks}>
            {experience.perks.map((perk, index) => (
              <li className={styles.perk} key={perk.title}>
                <span className={styles.perkIcon}>
                  <Art name={pick(PERK_ICONS, index)} />
                </span>
                <div>
                  <h3 className={styles.perkTitle}>{perk.title}</h3>
                  <p className={styles.perkBody}>{perk.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <figure className={styles.showcase}>
          <span aria-hidden="true" className={styles.halo} />
          <Art className={`${styles.showcaseRoses} ${styles.showcaseRosesLow}`} name="bouquet" />
          <Art className={`${styles.showcaseRoses} ${styles.showcaseRosesHigh}`} name="bouquet" />
          <div aria-label={experience.phoneLabel} className={styles.phoneLarge} role="img">
            <span className={styles.screen}>
              <span className={styles.island} />
              <span className={styles.cover}>
                <Art name="garland" />
                <span className={styles.kicker}>{phone.kicker}</span>
                <span className={styles.name}>{phone.name}</span>
              </span>
              <span className={styles.date}>{phone.date}</span>
              <span className={styles.venue}>
                <Art className={styles.venueIcon} name="iconPin" />
                <span>
                  <span className={styles.venueName}>{phone.venue}</span>
                  <span className={styles.venueNote}>{phone.venueNote}</span>
                </span>
              </span>
              <span className={styles.countLabel}>{phone.countdownLabel}</span>
              <span className={styles.count}>
                {phone.countdown.map(({ value, unit }) => (
                  <span key={unit}>
                    {value}
                    <small>{unit}</small>
                  </span>
                ))}
              </span>
              <span className={styles.reply}>{phone.reply}</span>
            </span>
          </div>
          <figcaption className={`${styles.chip} ${styles.chipExample}`}>
            <span aria-hidden="true" className={styles.chipDot}>
              <Ornament className={styles.chipIcon} name="bud" />
            </span>
            {experience.phoneBadge}
          </figcaption>
          <span aria-hidden="true" className={`${styles.chip} ${styles.chipCountdown}`}>
            <span className={styles.chipDot}>
              <Art className={styles.chipIcon} name="iconCalendar" />
            </span>
            <span>
              <b className={styles.chipValue}>{experience.countdownChip.value}</b>
              {experience.countdownChip.label}
            </span>
          </span>
        </figure>
      </div>
    </section>
  );
}

/** The closing band: the wax seal in its crest, the aspiration, and «Ingresar». */
export function ClosingBand() {
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
            <SignInLink action={closing.signIn} />
            <span className={styles.closingUpcoming}>
              {closing.upcoming.feature}
              <ComingSoon action={closing.upcoming.action} />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
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
          <Link className={`${styles.footerLink} ${focusRing}`} href={footer.signIn.href}>
            {footer.signIn.label}
          </Link>
        </nav>
        <small className={styles.footerNote}>{footer.copyright(new Date().getFullYear())}</small>
      </div>
    </footer>
  );
}
