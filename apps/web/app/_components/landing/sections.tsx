import type { ReactNode } from "react";

import { type Heading, LANDING_COPY } from "../../../lib/landing/copy.ts";
import { Ornament } from "../ornament.tsx";
import { ComingSoon } from "./actions.tsx";
import { Art, type ArtName, pick } from "./art.tsx";
import styles from "./landing.module.css";
import { DesignThumbnail } from "./stationery.tsx";

const { occasions, gallery, steps } = LANDING_COPY;

interface SectionHeadProperties {
  id: string;
  eyebrow: string;
  heading: Heading;
  intro: string;
  /** Show the gold flourish under the heading. */
  flourish?: boolean;
  className?: string;
}

/** The centered head of a section: eyebrow pill, heading with its accent, flourish, and intro. */
export function SectionHead({
  id,
  eyebrow,
  heading,
  intro,
  flourish = true,
  className = "",
}: SectionHeadProperties) {
  return (
    <div className={`${styles.sectionHead} ${className}`}>
      <p className={styles.eyebrow}>
        <Ornament name="bud" />
        {eyebrow}
      </p>
      <h2 className={styles.sectionTitle} id={id}>
        <AccentHeading heading={heading} />
      </h2>
      {flourish ? <Ornament className={styles.flourish} name="divider" /> : null}
      <p className={styles.sectionIntro}>{intro}</p>
    </div>
  );
}

export function AccentHeading({ heading }: { heading: Heading }): ReactNode {
  return (
    <>
      {heading.before}
      <em className={styles.accent}>{heading.accent}</em>
      {heading.after}
    </>
  );
}

const OCCASION_ICONS: readonly [ArtName, ...ArtName[]] = ["iconTiara", "iconRings", "iconBalloons"];

export function OccasionsBand() {
  return (
    <section aria-label={occasions.label} className={styles.occasions}>
      <ul className={`${styles.wrap} ${styles.occasionList}`}>
        <li aria-hidden="true" className={styles.occasionLead}>
          {occasions.lead}
        </li>
        {occasions.items.map((item, index) => (
          <li className={styles.occasion} key={item}>
            <span className={styles.medal}>
              <Art name={pick(OCCASION_ICONS, index)} />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Diseños de muestra»: sample designs that cannot be chosen yet (S37). */
export function SampleGallery() {
  return (
    <section
      aria-labelledby="disenos-title"
      className={`${styles.section} ${styles.gallery}`}
      id="disenos"
    >
      <div className={styles.wrap}>
        <SectionHead
          eyebrow={gallery.badge}
          heading={gallery.heading}
          id="disenos-title"
          intro={gallery.intro}
        />
        <ul className={styles.designs}>
          {gallery.designs.map((design, index) => (
            <li className={styles.design} key={design.name}>
              <span className={styles.shell}>
                <DesignThumbnail design={design} index={index} />
              </span>
              <div className={styles.designMeta}>
                <span className={styles.tag}>{design.tag}</span>
                <h3 className={styles.designName}>{design.name}</h3>
              </div>
              <ComingSoon action={design.action} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEP_ICONS: readonly [ArtName, ...ArtName[]] = ["iconCards", "iconQuill", "iconEnvelope"];

/** «Así funcionará»: the three planned steps, in the future tense (S37). */
export function PlannedSteps() {
  return (
    <section
      aria-labelledby="como-funcionara-title"
      className={`${styles.section} ${styles.steps}`}
      id="como-funcionara"
    >
      <div className={styles.wrap}>
        <SectionHead
          eyebrow={steps.eyebrow}
          heading={steps.heading}
          id="como-funcionara-title"
          intro={steps.intro}
        />
        <ol className={styles.stepList}>
          {steps.items.map((step, index) => (
            <li className={styles.step} key={step.title}>
              <div className={styles.medallion}>
                <span aria-hidden="true" className={styles.stepNumber}>
                  {index + 1}
                </span>
                <Art name={pick(STEP_ICONS, index)} />
              </div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
