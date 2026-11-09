"use server";

import { redirect } from "next/navigation";

import {
  createEntry,
  createPackage,
  createTemplate,
  createTemplateVersion,
  publishTemplateVersion,
  retireTemplateVersion,
  setPackageFeatures,
  setPackagePrice,
  updateEntry,
  updatePackage,
  updateTemplate,
} from "../../../lib/admin/catalog/commands.ts";
import type { VersionFormState } from "../../../lib/admin/catalog/versions.ts";
import { adminCatalog } from "../../../lib/server/admin-catalog-api.ts";

/**
 * The catalog's server actions (M3 T8a and T8b; S1, S9, L8). The browser cannot send `PATCH` or `PUT` to the API
 * (CORS), so every write runs here, on the web server, with the session cookie. Each action passes the
 * submitted form to its command and redirects to the path the command answers (303 after POST), so a
 * form works without JavaScript and a reload never resubmits it. The API authorizes and validates every
 * write; `redirect` is called outside any `try`, as Next.js requires. The one exception to redirecting
 * with a code is `createTemplateVersionAction`: it answers a state for `useActionState`, so the API's
 * contract issues and the typed JSON never travel in a URL.
 */

export async function createCategoryAction(formData: FormData): Promise<void> {
  redirect(await createEntry(adminCatalog, "categories", formData));
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  redirect(await updateEntry(adminCatalog, "categories", formData));
}

export async function createFeatureAction(formData: FormData): Promise<void> {
  redirect(await createEntry(adminCatalog, "features", formData));
}

export async function updateFeatureAction(formData: FormData): Promise<void> {
  redirect(await updateEntry(adminCatalog, "features", formData));
}

export async function createPackageAction(formData: FormData): Promise<void> {
  redirect(await createPackage(adminCatalog, formData));
}

export async function updatePackageAction(formData: FormData): Promise<void> {
  redirect(await updatePackage(adminCatalog, formData));
}

export async function setPackageFeaturesAction(formData: FormData): Promise<void> {
  redirect(await setPackageFeatures(adminCatalog, formData));
}

export async function setPackagePriceAction(formData: FormData): Promise<void> {
  redirect(await setPackagePrice(adminCatalog, formData));
}

export async function createTemplateAction(formData: FormData): Promise<void> {
  redirect(await createTemplate(adminCatalog, formData));
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  redirect(await updateTemplate(adminCatalog, formData));
}

export async function publishTemplateVersionAction(formData: FormData): Promise<void> {
  redirect(await publishTemplateVersion(adminCatalog, formData));
}

export async function retireTemplateVersionAction(formData: FormData): Promise<void> {
  redirect(await retireTemplateVersion(adminCatalog, formData));
}

/** Creates a DRAFT version; a refusal comes back as the form's state, a success redirects. */
export async function createTemplateVersionAction(
  _previous: VersionFormState,
  formData: FormData,
): Promise<VersionFormState> {
  const outcome = await createTemplateVersion(adminCatalog, formData);

  if (outcome.kind === "redirect") {
    redirect(outcome.target);
  }
  return outcome.state;
}
