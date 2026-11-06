import type { CSSProperties } from "react";

import { LANDING_COPY } from "../../../lib/landing/copy.ts";
import { Ornament } from "../ornament.tsx";
import { focusRing } from "../ui.ts";
import { Wordmark } from "../wordmark.tsx";
import { AnchorLink, SignInLink } from "./actions.tsx";
import { Art, DrawnBouquet } from "./art.tsx";
import styles from "./landing.module.css";
import { HeroStationery } from "./stationery.tsx";

const { skipLink, nav, hero } = LANDING_COPY;

/** The sticky pill header: the wordmark, the in-page anchors, and «Ingresar». */
export function LandingHeader() {
  return (
    <>
      <a className={`${styles.skip} ${focusRing}`} href={skipLink.href}>
        {skipLink.label}
      </a>
      <header className={styles.header}>
        <nav aria-label={nav.label} className={styles.nav}>
          <Wordmark />
          <div className={styles.navLinks}>
            {nav.links.map((link) => (
              <a className={`${styles.navLink} ${focusRing}`} href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </div>
          <SignInLink action={nav.signIn} small />
        </nav>
      </header>
    </>
  );
}

/** Petals drifting down behind the illustration: position, size, duration, delay, and drift. */
const PETALS = [
  ["8%", 25, 17, -3, 160],
  ["22%", 18, 21, -11, 90],
  ["38%", 30, 19, -7, 140],
  ["52%", 20, 23, -15, -80],
  ["64%", 28, 18, -5, 120],
  ["78%", 19, 20, -13, -110],
  ["90%", 24, 22, -9, -60],
] as const;

const SPARKLES: CSSProperties[] = [
  { left: "18%", top: "8%" },
  { left: "68%", top: "4%", animationDelay: "-1.2s", width: "1.8cqw" },
  { left: "96%", top: "56%", animationDelay: "-2.4s" },
];

export function LandingHero() {
  return (
    <section aria-labelledby="hero-title" className={styles.hero}>
      <div aria-hidden="true" className={styles.petals}>
        {PETALS.map(([x, size, duration, delay, drift]) => (
          <Art
            key={x}
            name="petal"
            style={
              {
                "--x": x,
                "--s": `${size}px`,
                "--t": `${duration}s`,
                "--d": `${delay}s`,
                "--dx": `${drift}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className={`${styles.wrap} ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <Ornament name="bud" />
            {hero.eyebrow}
          </p>
          <h1 className={styles.heroTitle} id="hero-title">
            {hero.heading.before}
            <em className={styles.accent}>{hero.heading.accent}</em>
            {hero.heading.after}
          </h1>
          <p className={styles.heroLead}>{hero.lead}</p>
          <div className={styles.heroActions}>
            <AnchorLink anchor={hero.primary} variant="primary" />
            <AnchorLink anchor={hero.secondary} variant="ghost" />
          </div>
          <ul className={styles.heroNotes}>
            {hero.notes.map((note) => (
              <li key={note}>
                <Ornament name="bud" />
                {note}
              </li>
            ))}
          </ul>
        </div>

        <div aria-label={hero.illustrationLabel} className={styles.stage} role="img">
          <HeroStationery />
          <DrawnBouquet className={styles.rosesFront} />
          <Art className={styles.rosesLow} eager name="bouquet" />
          {SPARKLES.map((style) => (
            <span className={styles.sparkle} key={String(style.left)} style={style} />
          ))}
        </div>
      </div>
    </section>
  );
}
