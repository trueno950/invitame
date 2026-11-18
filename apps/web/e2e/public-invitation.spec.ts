import { ACCOUNT_COPY, INVITATION_COPY, PUBLIC_INVITATION_COPY } from "../lib/customer/copy.ts";
import { expect, fillAutosaved, openEditorSection, signIn, test } from "./support/customer.ts";

/**
 * The guest's page of a published invitation (M5 T5; S1, S5, S7, S9) and the editor that publishes it (T2c: S2, S4).
 * The browser drives the production build of `apps/web`, whose public page reads the API anonymously and renders the
 * invitation through the web renderer registry.
 *
 * The first case needs no fixture at all: an unknown slug answers a 404 whatever the database holds, so it runs in CI
 * without the seed. The full journey needs a published template and a package that fits it, both of which the
 * reference seed creates (`pnpm db:seed`); the harness itself only applies migrations, so a database without the seed
 * skips that case with the reason instead of failing a required suite.
 */

const DRAFT_URL = /\/cuenta\/invitaciones\/[0-9a-f-]{36}/;
const PUBLIC_URL = /^\/i\/[a-z0-9]+(-[a-z0-9]+)*$/;

test.describe("public invitation", () => {
  test("answers a friendly 404 for a slug that names no invitation (A3, S9)", async ({ page }) => {
    const response = await page.goto("/i/invitacion-que-no-existe");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: PUBLIC_INVITATION_COPY.notFoundTitle,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(PUBLIC_INVITATION_COPY.notFoundBody)).toBeVisible();
    // The guest page carries no customer navigation, only the discreet way back home.
    await expect(page.getByRole("link", { name: PUBLIC_INVITATION_COPY.home })).toHaveAttribute(
      "href",
      "/",
    );
    await expect(page.getByRole("link", { name: ACCOUNT_COPY.invitationsLink })).toHaveCount(0);

    // The page stays out of search results, and every robots tag it answers says so (A5).
    const robots = await page.locator('meta[name="robots"]').all();
    expect(robots.length).toBeGreaterThan(0);
    for (const tag of robots) {
      expect(await tag.getAttribute("content")).toMatch(/noindex/);
    }
  });

  test("publishes a completed draft without losing what was typed, shows it to a guest, and withholds it once unpublished (S1, S2, S5, S7)", async ({
    page,
    customerEmail,
  }) => {
    await signIn(page, customerEmail);

    // The chooser's three steps: the design, the theme, then the package and the create form (T10b; S10).
    await page.goto("/cuenta/invitaciones/nueva");
    const designLinks = page
      .getByRole("list", { name: INVITATION_COPY.templateLabel })
      .getByRole("link");
    test.skip(
      (await designLinks.count()) === 0,
      "the e2e database has no published template; seed the catalog with `pnpm db:seed`",
    );

    await designLinks.first().click();
    await page
      .getByRole("list", { name: INVITATION_COPY.themeLabel })
      .getByRole("link")
      .first()
      .click();
    await page.getByRole("button", { name: INVITATION_COPY.createSubmit }).click();
    await expect(page).toHaveURL(DRAFT_URL);

    // Every property of the pinned schema, so the API's completeness rule lets the draft publish (A1). The three that
    // are filled last are not waited for: the publish below has to flush them itself (S2).
    await fillAutosaved(page, "Nombre del festejado", "Lucía");
    await fillAutosaved(page, "Edad", "7");
    await fillAutosaved(page, "Fecha", "2026-12-05");
    await fillAutosaved(page, "Hora", "16:30");
    await fillAutosaved(page, "Lugar", "Jardín Los Pinos");
    await page.getByLabel("Dirección").fill("Calle Reforma 123");
    await page.getByLabel("Foto principal (URL)").fill("https://example.com/lucia.jpg");
    await page.getByLabel("Mensaje").fill("Ven a celebrar conmigo.");

    // Publishing navigates, and it navigates only after the save the owner just typed on the way is stored (S2).
    await openEditorSection(page, "Publicar");
    await page.getByRole("button", { name: INVITATION_COPY.publish, exact: true }).click();
    await expect(page).toHaveURL(/\?notice=published&seccion=publicar$/);
    await expect(page.getByText("Publicada", { exact: true })).toBeVisible();
    await expect(page.getByText(INVITATION_COPY.publishedNote)).toBeVisible();

    // The published invitation shows its public link, which is easy to copy as text.
    const publicPath = await page.getByLabel(INVITATION_COPY.publicLinkLabel).inputValue();
    expect(publicPath).toMatch(PUBLIC_URL);

    // The three fields typed last are on the guest's page: the submit flushed them instead of discarding them.
    const publicPage = await page.goto(publicPath);
    expect(publicPage?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Lucía" })).toBeVisible();
    await expect(page.getByText("Ven a celebrar conmigo.")).toBeVisible();
    await expect(page.getByText("Calle Reforma 123", { exact: true })).toBeVisible();
    await expect(page.getByText(PUBLIC_INVITATION_COPY.madeWith)).toBeVisible();

    // Unpublishing returns the invitation to draft, on the tab it was asked from, and the public URL stops answering.
    await page.goto("/cuenta/invitaciones");
    await page.getByRole("link", { name: INVITATION_COPY.editLink }).first().click();
    await expect(page).toHaveURL(DRAFT_URL);
    await openEditorSection(page, "Publicar");
    await page.getByRole("button", { name: INVITATION_COPY.unpublish, exact: true }).click();
    await expect(page).toHaveURL(/\?notice=unpublished&seccion=publicar$/);
    await expect(page.getByText("Borrador", { exact: true })).toBeVisible();

    const gone = await page.goto(publicPath);
    expect(gone?.status()).toBe(404);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: PUBLIC_INVITATION_COPY.notFoundTitle,
        exact: true,
      }),
    ).toBeVisible();
  });
});
