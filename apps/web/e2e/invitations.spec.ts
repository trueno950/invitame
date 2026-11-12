import { INVITATION_COPY } from "../lib/customer/copy.ts";
import { expect, signIn, test } from "./support/customer.ts";

/**
 * Invitation drafting in a real browser (M4 T5; S1, S6, S7). The browser drives the production build of
 * `apps/web`, whose server actions call the real API with the session cookie: create a draft from the
 * creator catalog, complete one field, see what is still missing, and archive the draft.
 *
 * The journey needs a published template, which the reference seed creates (`pnpm db:seed`). The harness
 * itself only applies migrations, so a database without the seed skips this spec with that reason instead
 * of failing a required browser suite on a missing fixture.
 */

const DRAFT_URL = /\/cuenta\/invitaciones\/[0-9a-f-]{36}/;

test.describe("customer invitations", () => {
  test("creates a draft, completes a field, sees what is missing, and archives it", async ({
    page,
    customerEmail,
  }) => {
    await signIn(page, customerEmail);

    await page.goto("/cuenta/invitaciones");
    await expect(
      page.getByRole("heading", { level: 1, name: INVITATION_COPY.listHeading, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(INVITATION_COPY.listEmpty)).toBeVisible();

    await page.getByRole("link", { name: INVITATION_COPY.newLink }).click();
    await expect(page).toHaveURL("/cuenta/invitaciones/nueva");

    const templates = page.getByLabel(INVITATION_COPY.templateLabel);
    test.skip(
      (await templates.getByRole("option").count()) === 0,
      "the e2e database has no published template; seed the catalog with `pnpm db:seed`",
    );

    await templates.selectOption({ index: 0 });
    await page.getByLabel(INVITATION_COPY.packageLabel).selectOption({ index: 0 });
    await page.getByRole("button", { name: INVITATION_COPY.createSubmit }).click();

    await expect(page).toHaveURL(DRAFT_URL);
    await expect(page).toHaveURL(/\?notice=created$/);
    await expect(page.getByRole("status").filter({ hasText: "creamos tu borrador" })).toBeVisible();

    // The form has one labelled input per property of the pinned version's schema.
    await page.getByLabel("Nombre del festejado").fill("Ana");
    await page.getByRole("button", { name: INVITATION_COPY.save }).click();

    await expect(page).toHaveURL(/\?notice=saved$/);
    await expect(
      page.getByRole("status").filter({ hasText: "guardamos los cambios" }),
    ).toBeVisible();
    await expect(page.getByLabel("Nombre del festejado")).toHaveValue("Ana");

    // A partial draft is allowed, and the page names the required fields it still lacks (S7).
    await expect(
      page.getByText("Faltan: Edad, Fecha, Hora, Lugar, Dirección, Foto principal (URL), Mensaje."),
    ).toBeVisible();

    await page.getByRole("button", { name: INVITATION_COPY.archive }).click();

    await expect(page).toHaveURL(/\?notice=archived$/);
    await expect(page.getByText(INVITATION_COPY.archivedNote)).toBeVisible();
    await expect(page.getByText("Archivada", { exact: true })).toBeVisible();
    // An archived draft is read-only: its form and its archive button are gone, its content stays.
    await expect(page.getByLabel("Nombre del festejado")).toHaveCount(0);
    await expect(page.getByRole("button", { name: INVITATION_COPY.archive })).toHaveCount(0);
    await expect(page.getByText("Ana", { exact: true })).toBeVisible();
  });
});
