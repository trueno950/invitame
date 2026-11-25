import type { Page } from "@playwright/test";

import { AUTOSAVE_COPY, EDITOR_COPY, INVITATION_COPY } from "../lib/customer/copy.ts";
import {
  expect,
  fillAutosaved,
  openContentCard,
  openEditorSection,
  signIn,
  test,
} from "./support/customer.ts";

/**
 * Invitation drafting in a real browser (M4 T5; M5 T5; T2c: S1-S4). The browser drives the production build of
 * `apps/web`, whose server actions call the real API with the session cookie: create a draft from the creator
 * catalog, fill it in the tabbed editor, and see every field save on its own while the tab switching and the actions
 * that navigate keep what was typed.
 *
 * The journey needs a published template, which the reference seed creates (`pnpm db:seed`). The harness itself only
 * applies migrations, so a database without the seed skips this spec with that reason instead of failing a required
 * browser suite on a missing fixture.
 */

const DRAFT_URL = /\/cuenta\/invitaciones\/[0-9a-f-]{36}/;

/** The «N de M listos» the first-steps card states, as numbers (T1; S2.1). */
async function readProgress(page: Page): Promise<{ done: number; total: number }> {
  const text = await page
    .getByRole("region", { name: EDITOR_COPY.firstSteps.heading })
    .getByRole("progressbar")
    .getAttribute("aria-valuetext");
  const match = /(\d+) de (\d+) listos/u.exec(text ?? "");

  expect(
    match,
    `the first-steps card states its progress, and it read «${String(text)}»`,
  ).not.toBeNull();
  return { done: Number(match?.[1]), total: Number(match?.[2]) };
}

/** Creates a draft from the first published design, its first theme, and its first package. */
async function createDraft(page: Page): Promise<void> {
  await page.getByRole("link", { name: INVITATION_COPY.newLink }).click();
  await expect(page).toHaveURL("/cuenta/invitaciones/nueva");

  // Three steps, each one a server URL: the design, then the theme, then the package (T10b; S10).
  const designLinks = page
    .getByRole("list", { name: INVITATION_COPY.templateLabel })
    .getByRole("link");
  test.skip(
    (await designLinks.count()) === 0,
    "the e2e database has no published template; seed the catalog with `pnpm db:seed`",
  );

  await designLinks.first().click();
  await expect(page).toHaveURL(/[?&]paso=2/);
  await page
    .getByRole("list", { name: INVITATION_COPY.themeLabel })
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]paso=3/);
  await page.getByRole("button", { name: INVITATION_COPY.createSubmit }).click();

  await expect(page).toHaveURL(DRAFT_URL);
  await expect(page.getByRole("status").filter({ hasText: "Creamos tu invitación" })).toBeVisible();
}

test.describe("customer invitation editor", () => {
  test("saves every field on its own, keeps what was typed across tabs, and archives it (S2, S4)", async ({
    page,
    customerEmail,
  }) => {
    await signIn(page, customerEmail);
    await page.goto("/cuenta/invitaciones");
    await expect(
      page.getByRole("heading", { level: 1, name: INVITATION_COPY.listHeading, exact: true }),
    ).toBeVisible();
    await createDraft(page);

    // The editor opens on «Contenido», and the tab it opens is the one in the URL (S4).
    await expect(page.getByRole("tab", { name: /^Contenido/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page).toHaveURL(/[?&]seccion=contenido/);

    // Each property of the pinned schema keeps the native input its own definition asks for (S11).
    const age = page.getByLabel("Edad");
    await expect(age).toHaveAttribute("type", "number");
    await expect(age).toHaveAttribute("min", "1");
    await expect(age).toHaveAttribute("max", "120");
    expect(await age.getAttribute("required")).toBeNull();

    // The tab states its progress instead of how much is missing, and the first-steps card states the same count with
    // its three steps, so nobody reads «faltan 8» as a wall (T1; S2.1).
    await expect(page.getByRole("tab", { name: /^Contenido/ })).toContainText(/\d+ de \d+/);
    const initial = await readProgress(page);
    expect(initial.total).toBeGreaterThan(initial.done);
    const firstSteps = page.getByRole("region", { name: EDITOR_COPY.firstSteps.heading });
    for (const title of [
      EDITOR_COPY.firstSteps.content,
      EDITOR_COPY.firstSteps.photos,
      EDITOR_COPY.firstSteps.publish,
    ]) {
      await expect(firstSteps.getByRole("link", { name: new RegExp(`^${title}`) })).toBeVisible();
    }

    // The tab is a stack of cards and opens on the first one that still owes something, so the other groups' fields are
    // not on the page until their card is opened (T2).
    await expect(page.getByRole("button", { name: /^Festejado/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await openContentCard(page, "Fecha y hora");
    await expect(page.getByLabel("Fecha")).toHaveAttribute("type", "date");
    await expect(page.getByLabel("Hora")).toHaveAttribute("type", "time");
    await openContentCard(page, "Mensaje y foto");
    await expect(page.getByLabel("Foto principal (URL)")).toHaveAttribute("type", "url");
    await expect(page.getByLabel("Mensaje")).toHaveJSProperty("tagName", "TEXTAREA");

    // The last card has no «Siguiente»: there is no group after it to open (T2).
    await expect(page.getByRole("button", { name: /^Siguiente: / })).toHaveCount(0);

    // There is no «Guardar cambios» button any more: the field saves when it is finished (S2, S4).
    await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toHaveCount(0);

    await openContentCard(page, "Festejado");
    await fillAutosaved(page, "Nombre del festejado", "Ana");
    await fillAutosaved(page, "Edad", "7");

    // The tab and the first-steps card count what is already filled, computed from the fields as they are typed, and
    // the closed card says it holds everything of its own (T2; T1; S2.1).
    await expect(page.getByRole("tab", { name: /^Contenido/ })).toContainText(/\d+ de \d+/);
    const later = await readProgress(page);
    expect(later.total).toBe(initial.total);
    expect(later.done).toBeGreaterThan(initial.done);
    await expect(page.getByRole("button", { name: /^Festejado/ })).toContainText("Completo");
    await expect(page.getByRole("button", { name: /^Festejado/ })).toContainText("Ana · 7");

    // The footer of the open card names the next group and moves the focus to its header (T2).
    await page.getByRole("button", { name: "Siguiente: Fecha y hora" }).click();
    await expect(page.getByRole("button", { name: /^Fecha y hora/ })).toBeFocused();
    await expect(page.getByRole("button", { name: /^Fecha y hora/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    // Every missing field is a link: it opens the «Contenido» tab with that field's card and puts the focus on the input,
    // so the note is also the way to the field (T1; S2.4).
    await page
      .getByRole("region", { name: EDITOR_COPY.firstSteps.heading })
      .getByRole("link", { name: "Fecha", exact: true })
      .click();
    await expect(page.getByLabel("Fecha")).toBeFocused();
    await expect(page).toHaveURL(/[?&]seccion=contenido/);

    // A reload reads what the API stored, so the save really happened, and the tab reopens on the card that still owes
    // something instead of the one that is complete.
    await page.reload();
    await expect(page.getByRole("button", { name: /^Fecha y hora/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await openContentCard(page, "Festejado");
    await expect(page.getByLabel("Nombre del festejado")).toHaveValue("Ana");
    await expect(page.getByLabel("Edad")).toHaveValue("7");

    // Switching tabs saves nothing and sends nothing: the values typed in another tab are still there (S2).
    await openEditorSection(page, "Funciones");
    await expect(page).toHaveURL(/[?&]seccion=funciones/);
    const zone = page.getByLabel("Zona horaria");
    await zone.selectOption({ label: "Monterrey" });
    await zone.blur();
    await expect(page.getByRole("status", { name: AUTOSAVE_COPY.regionLabel })).toContainText(
      new RegExp(`${AUTOSAVE_COPY.savedMoment}|${AUTOSAVE_COPY.allSaved}`),
    );

    await openEditorSection(page, "Contenido");
    await openContentCard(page, "Festejado");
    await expect(page.getByLabel("Nombre del festejado")).toHaveValue("Ana");
    await expect(page.getByLabel("Edad")).toHaveValue("7");

    // The preview beside the fields is the stored draft, framed at phone width (T2b).
    await expect(page.getByTitle(EDITOR_COPY.previewFrameTitle).first()).toBeVisible();

    // Archiving navigates; it comes back to the tab it was pressed in, and the draft turns read-only (S4).
    await openEditorSection(page, "Publicar");
    await page.getByRole("button", { name: INVITATION_COPY.archive }).click();
    await expect(page).toHaveURL(/\?notice=archived&seccion=publicar$/);
    await expect(page.getByText(INVITATION_COPY.archivedNote)).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByText("Archivada", { exact: true })).toBeVisible();
    // The heading names the customer's own invitation, and the summary still holds what was typed (S2.1).
    await expect(page.getByRole("heading", { level: 1, name: "Ana" })).toBeVisible();
  });

  test("opens the preview in a dialog on a phone and gives the focus back (S3, S4)", async ({
    page,
    customerEmail,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, customerEmail);
    await page.goto("/cuenta/invitaciones");
    await createDraft(page);

    // The phone keeps the tabs on top of the form, the preview behind one fixed action, and the step that comes next
    // beside it, so the small screen is not only a preview (T1; S2.5).
    await expect(page.getByRole("tab", { name: /^Fotos/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Siguiente: Contenido" })).toBeVisible();
    const trigger = page.getByRole("button", { name: EDITOR_COPY.previewOpen });

    await trigger.click();
    const dialog = page.getByRole("dialog", { name: EDITOR_COPY.previewFrameTitle });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTitle(EDITOR_COPY.previewFrameTitle)).toBeVisible();

    // Escape closes it and the focus returns to the button that opened it.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
