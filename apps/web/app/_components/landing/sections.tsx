import type { ReactNode } from "react";

import {
  type GalleryDesign,
  type Heading,
  LANDING_COPY,
  type PricingPackage,
} from "../../../lib/landing/copy.ts";
import { planFeatures, planPrice, type LandingCatalog } from "../../../lib/landing/pricing.ts";
import { Ornament } from "../ornament.tsx";
import { focusRing } from "../ui.ts";
import { CreateInvitationLink } from "./actions.tsx";
import { Art, type ArtName, pick } from "./art.tsx";
import styles from "./landing.module.css";
import { DesignThumbnail } from "./stationery.tsx";

const { gallery, pricing, steps, faq } = LANDING_COPY;

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

/** «Diseños para cada celebración»: the published occasion lines, each one a way to start (S3). */
export function DesignGallery() {
  return (
    <section
      aria-labelledby="disenos-title"
      className={`${styles.section} ${styles.gallery}`}
      id="disenos"
    >
      <div className={styles.wrap}>
        <SectionHead
          eyebrow={gallery.eyebrow}
          heading={gallery.heading}
          id="disenos-title"
          intro={gallery.intro}
        />
        <ul className={styles.designs}>
          {gallery.designs.map((design: GalleryDesign) => (
            <li className={styles.design} key={design.occasion}>
              <span className={styles.shell}>
                <DesignThumbnail design={design} />
              </span>
              <div className={styles.designMeta}>
                <span className={styles.tag}>{design.occasion}</span>
                <h3 className={styles.designName}>{design.name}</h3>
                <p className={styles.designDetail}>{design.detail}</p>
              </div>
              <CreateInvitationLink action={design.action} small variant="ghost" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * One package card: name, the MXN price the catalog answers, its feature set, and the start action (S4). The price
 * and the features come from the read the page made, so a card never states an amount the administration has not
 * set: without a price it says «Precio por definir», and without a catalog it keeps the seeded feature list.
 */
function PlanCard({ item, catalog }: { item: PricingPackage; catalog: LandingCatalog }) {
  const price = planPrice(catalog, item);

  return (
    <article className={`${styles.plan} ${item.featured ? styles.planFeatured : ""}`}>
      <header className={styles.planHead}>
        <h3 className={styles.planName}>{item.name}</h3>
        {item.badge ? <span className={styles.planBadge}>{item.badge}</span> : null}
      </header>
      <p className={styles.planPrice}>
        {price === null ? (
          <span className={styles.planPriceUnknown}>{pricing.unknownPrice}</span>
        ) : (
          <>
            {price.amount}
            <small>{price.currency}</small>
          </>
        )}
      </p>
      <p className={styles.planSummary}>{item.summary}</p>
      <ul className={styles.planFeatures}>
        {planFeatures(catalog, item).map((feature) => (
          <li key={feature}>
            <Ornament name="bud" />
            {feature}
          </li>
        ))}
      </ul>
      <CreateInvitationLink
        action={item.action}
        small
        variant={item.featured ? "primary" : "ghost"}
      />
    </article>
  );
}

/** «Elige tu paquete»: the three seeded packages and the MXN prices the catalog answers (S4). */
export function Pricing({ catalog }: { catalog: LandingCatalog }) {
  return (
    <section aria-labelledby="precios-title" className={styles.section} id="precios">
      <div className={styles.wrap}>
        <SectionHead
          eyebrow={pricing.eyebrow}
          heading={pricing.heading}
          id="precios-title"
          intro={pricing.intro}
        />
        <div className={styles.plans}>
          {pricing.packages.map((item) => (
            <PlanCard catalog={catalog} item={item} key={item.key} />
          ))}
        </div>
        <p className={styles.plansNote}>{pricing.note}</p>
      </div>
    </section>
  );
}

const STEP_ICONS: readonly [ArtName, ...ArtName[]] = [
  "iconCards",
  "iconQuill",
  "iconCalendar",
  "iconEnvelope",
];

/** «Cómo funciona»: the four steps that work today, in the present tense (S5). */
export function HowItWorks() {
  return (
    <section
      aria-labelledby="como-funciona-title"
      className={`${styles.section} ${styles.steps}`}
      id="como-funciona"
    >
      <div className={styles.wrap}>
        <SectionHead
          eyebrow={steps.eyebrow}
          heading={steps.heading}
          id="como-funciona-title"
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

/** «Preguntas frecuentes»: duration, RSVP, payment, and refunds, as native disclosures (S6). */
export function Faq() {
  return (
    <section aria-labelledby="faq-title" className={styles.section} id="faq">
      <div className={styles.wrap}>
        <SectionHead eyebrow={faq.eyebrow} heading={faq.heading} id="faq-title" intro={faq.intro} />
        <div className={styles.faq}>
          {faq.items.map((item, index) => (
            <details className={styles.faqItem} key={item.question} open={index === 0}>
              <summary className={`${styles.faqQuestion} ${focusRing}`}>{item.question}</summary>
              <p className={styles.faqAnswer}>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
