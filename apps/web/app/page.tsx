import { ClosingBand, GuestExperience, LandingFooter } from "./_components/landing/closing.tsx";
import { LandingHeader, LandingHero } from "./_components/landing/hero.tsx";
import styles from "./_components/landing/landing.module.css";
import { OccasionsBand, PlannedSteps, SampleGallery } from "./_components/landing/sections.tsx";

/**
 * The landing page (M2 T8l; S35, S37): the approved concept «A · Rosa y vino» as an honest pre-launch
 * page. «Ingresar» is the only active product action; the sample designs, the planned steps, and the
 * guest experience describe what is coming. All copy lives in `lib/landing/copy.ts`. A server
 * component without client JavaScript: the bouquet draws itself with the CSS inside its SVG file.
 */
export default function HomePage() {
  return (
    <div className={styles.page}>
      <LandingHeader />
      <main id="contenido" tabIndex={-1}>
        <LandingHero />
        <OccasionsBand />
        <SampleGallery />
        <PlannedSteps />
        <GuestExperience />
        <ClosingBand />
      </main>
      <LandingFooter />
    </div>
  );
}
