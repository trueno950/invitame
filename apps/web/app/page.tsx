import { headers } from "next/headers";

import { ApiClientError, sessionCookieHeader } from "../lib/server/api-client.ts";
import { getWebServerConfig } from "../lib/server/config.ts";
import {
  createPublicCatalogClient,
  type PublicCatalogPackage,
} from "../lib/server/public-catalog-api.ts";
import { errorClass } from "../lib/server/server-log.ts";
import { ClosingBand, LandingFooter } from "./_components/landing/closing.tsx";
import { LandingHeader, LandingHero } from "./_components/landing/hero.tsx";
import styles from "./_components/landing/landing.module.css";
import { DesignGallery, Faq, HowItWorks, Pricing } from "./_components/landing/sections.tsx";

/**
 * The launch landing (odd/tasks/launch-landing.md; S1-S6): the chosen direction «Editorial romántica»
 * mapped onto the app theme. It sells the product that already exists — the gallery names the
 * published occasion lines (S3), the pricing reads the packages and their MXN prices from the public
 * catalog the administration edits (S4), the steps describe choosing, filling, paying, and sharing
 * (S5), and the FAQ answers duration, RSVP, payment, and refunds (S6). The main action starts a new
 * invitation in `/cuenta/invitaciones/nueva` (S2). All copy lives in `lib/landing/copy.ts`. A server
 * component without client JavaScript.
 *
 * A visitor who still carries a Better Auth session cookie sees «Mi cuenta» instead of «Ingresar». The
 * cookie only chooses a link, so the signed-in state costs no API call; `/cuenta` checks the session
 * on the server and sends an expired one back to `/ingresar`.
 *
 * The price list is the one read this page makes, and it is anonymous: `createPublicCatalogClient`
 * sends no cookie, only the web-to-API proxy secret. The shared API client never caches a body
 * (`cache: "no-store"`), and this page renders per request because it reads the incoming headers, so a
 * price the administration changes shows up on the next visit.
 */
const LANDING_CATALOG_READ_FAILED = "landing_catalog_read_failed";

/**
 * The packages the pricing section shows, or `undefined` when the API could not answer. A landing must never break
 * because the catalog is down (S4): every card falls back to «Precio por definir» and to the seeded feature list,
 * and the failure leaves one structured line — the error class, the client's failure kind, and the class of the
 * cause, never a message or a response body, because either could carry personal data.
 */
async function landingPackages(): Promise<readonly PublicCatalogPackage[] | undefined> {
  try {
    return await createPublicCatalogClient({ config: getWebServerConfig() }).listPackages();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: LANDING_CATALOG_READ_FAILED,
        error: errorClass(error),
        ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
        ...(error instanceof Error && error.cause !== undefined
          ? { cause: errorClass(error.cause) }
          : {}),
      }),
    );
    return undefined;
  }
}

export default async function HomePage() {
  const cookie = (await headers()).get("cookie");
  const signedIn = sessionCookieHeader(cookie) !== undefined;
  const packages = await landingPackages();

  return (
    <div className={styles.page}>
      <LandingHeader signedIn={signedIn} />
      <main id="contenido" tabIndex={-1}>
        <LandingHero />
        <div aria-hidden="true" className={`${styles.wrap} ${styles.hairline}`} />
        <DesignGallery />
        <Pricing catalog={packages} />
        <HowItWorks />
        <Faq />
        <ClosingBand signedIn={signedIn} />
      </main>
      <LandingFooter signedIn={signedIn} />
    </div>
  );
}
