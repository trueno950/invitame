import { headers } from "next/headers";

import { sessionCookieHeader } from "../lib/server/api-client.ts";
import { ClosingBand, LandingFooter } from "./_components/landing/closing.tsx";
import { LandingHeader, LandingHero } from "./_components/landing/hero.tsx";
import styles from "./_components/landing/landing.module.css";
import { DesignGallery, Faq, HowItWorks, Pricing } from "./_components/landing/sections.tsx";

/**
 * The launch landing (odd/tasks/launch-landing.md; S1-S6): the chosen direction «Editorial romántica»
 * mapped onto the app theme. It sells the product that already exists — the gallery names the
 * published occasion lines (S3), the pricing shows the seeded packages (S4), the steps describe
 * choosing, filling, paying, and sharing (S5), and the FAQ answers duration, RSVP, payment, and
 * refunds (S6). The main action starts a new invitation in `/cuenta/invitaciones/nueva` (S2). All
 * copy lives in `lib/landing/copy.ts`. A server component without client JavaScript.
 *
 * A visitor who still carries a Better Auth session cookie sees «Mi cuenta» instead of «Ingresar». The
 * cookie only chooses a link, so no API call is made here; `/cuenta` checks the session on the server
 * and sends an expired one back to `/ingresar`.
 */
export default async function HomePage() {
  const signedIn = sessionCookieHeader((await headers()).get("cookie")) !== undefined;

  return (
    <div className={styles.page}>
      <LandingHeader signedIn={signedIn} />
      <main id="contenido" tabIndex={-1}>
        <LandingHero />
        <div aria-hidden="true" className={`${styles.wrap} ${styles.hairline}`} />
        <DesignGallery />
        <Pricing />
        <HowItWorks />
        <Faq />
        <ClosingBand signedIn={signedIn} />
      </main>
      <LandingFooter signedIn={signedIn} />
    </div>
  );
}
