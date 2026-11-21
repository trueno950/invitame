import type { SettingsField } from "../../server/admin-settings-client.ts";

/**
 * Spanish product copy of the administrator configuration page `/admin/configuracion` (M9 T14; S5, S8, L15).
 * Administrators are addressed with "tú" in neutral Mexican Spanish, like the rest of the administration
 * (`../copy.ts`). Keep every string of the page here so the wording is reviewed in one place.
 *
 * The owner fixed the four groups and their field labels (S8, L15). The page also says the rule the owner chose for a
 * lowered limit: «Conservan lo que tienen» — nothing is deleted, hidden, or rewritten; the new limit only stops what is
 * added afterwards (S8). And it says that a save always records the before and the after, with the note as optional
 * (S8, L15), because that is what the API's audit row does.
 */

export const SETTINGS_PATHS = {
  panel: "/admin",
  index: "/admin/configuracion",
} as const;

export const SETTINGS_COPY = {
  pageTitle: "Configuración | InvitaMe",
  heading: "Configuración",
  intro: "Ajusta los límites generales de InvitaMe y revisa qué se ofrece a la venta.",
  /** The owner's rule for a lowered limit (S8, L15): it only stops new additions. */
  lowerLimitNote:
    "Bajar un límite no borra ni oculta nada de lo que ya existe: el límite nuevo solo frena lo que se agregue después.",
  /** The audit always records the before and the after; only the note is optional (S8, L15). */
  auditNote: "Guardar registra el antes y el después en la auditoría. La nota es opcional.",
  formHeading: "Límites generales",
  formIntro:
    "Cada campo acepta un número entero dentro de su rango. El servidor revisa los límites otra vez al guardar.",
  save: "Guardar",
  noteLabel: "Nota (opcional)",
  noteHint: "Hasta 200 caracteres. Se guarda junto con el cambio en la auditoría.",
  updatedAt: (instant: string): string => `Última actualización: ${instant}.`,
  updatedAtUnknown: "Todavía no hay una fecha de actualización.",
  bounds: (min: number, max: number): string => `De ${min} a ${max}.`,
  hubHeading: "Catálogo",
  hubIntro: "Las cuatro secciones del catálogo que administran lo que se ofrece a la venta.",
  unavailableHeading: "No pudimos cargar la configuración",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
} as const;

/** One group of the form, as the owner grouped the seven settings (S8, L15). */
export interface SettingsGroup {
  readonly title: string;
  /** What the group's limits govern, in one line. */
  readonly hint: string;
  readonly fields: readonly SettingsField[];
}

/**
 * The four groups of the form, in the owner's order: the RSVP party limits, the photos and stored assets of one
 * invitation, the weight of one photo, and place search with the analytics window (S8, L15).
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    title: "Acompañantes RSVP",
    hint: "Cuántos acompañantes puede confirmar quien recibe la invitación.",
    fields: ["rsvpDefaultPartyLimit", "rsvpMaxPartyLimit"],
  },
  {
    title: "Fotos por invitación",
    hint: "Cuántas fotos y cuántos archivos se guardan en una invitación.",
    fields: ["galleryPhotoLimit", "storedAssetLimit"],
  },
  {
    title: "Tamaño de foto",
    hint: "El peso máximo de cada foto que se sube.",
    fields: ["maxUploadMegabytes"],
  },
  {
    title: "Búsqueda y analítica",
    hint: "Los resultados de la búsqueda de lugares y el periodo inicial de la analítica.",
    fields: ["placeSearchResultLimit", "analyticsDefaultWindowDays"],
  },
];

/** What one field of the form is called and what it governs. */
export interface SettingsFieldCopy {
  readonly label: string;
  readonly hint: string;
}

/** The label and the help text of each of the seven settings, with the owner's own labels (S8, L15). */
export const SETTINGS_FIELD_COPY: Readonly<Record<SettingsField, SettingsFieldCopy>> = {
  rsvpDefaultPartyLimit: {
    label: "Acompañantes por defecto",
    hint: "Cuántos acompañantes se proponen al confirmar la asistencia.",
  },
  rsvpMaxPartyLimit: {
    label: "Máximo de acompañantes",
    hint: "El máximo que se puede pedir. Nunca queda por debajo de los acompañantes por defecto.",
  },
  galleryPhotoLimit: {
    label: "Fotos de galería",
    hint: "Cuántas fotos de la galería se pueden subir en una invitación.",
  },
  storedAssetLimit: {
    label: "Archivos guardados",
    hint: "Cuántos archivos se guardan por invitación, fotos incluidas. Siempre es al menos uno más que las fotos de galería.",
  },
  maxUploadMegabytes: {
    label: "Peso máximo por foto (MB)",
    hint: "El peso máximo de cada foto que se sube.",
  },
  placeSearchResultLimit: {
    label: "Resultados al buscar un lugar",
    hint: "Cuántos resultados devuelve la búsqueda de lugares al elegir la ubicación.",
  },
  analyticsDefaultWindowDays: {
    label: "Rango por defecto de la analítica (días)",
    hint: "Cuántos días muestra la analítica cuando no se elige un periodo.",
  },
};

/**
 * The error code that names one field of a save the API refused: each of the seven has its own, so the notice after
 * the redirect says which field it was without ever carrying text from the API (S5).
 */
export const SETTINGS_FIELD_ERROR_CODE = {
  rsvpDefaultPartyLimit: "invalid-rsvp-default-party-limit",
  rsvpMaxPartyLimit: "invalid-rsvp-max-party-limit",
  galleryPhotoLimit: "invalid-gallery-photo-limit",
  storedAssetLimit: "invalid-stored-asset-limit",
  maxUploadMegabytes: "invalid-max-upload-megabytes",
  placeSearchResultLimit: "invalid-place-search-result-limit",
  analyticsDefaultWindowDays: "invalid-analytics-default-window-days",
} as const;

export type SettingsFieldErrorCode = (typeof SETTINGS_FIELD_ERROR_CODE)[SettingsField];

/**
 * The refusals the page can show. Each refused field has its own message, so the administrator knows which value to
 * change: the API names the field in its `issues`, and this page keeps the Spanish wording of every one of them.
 */
export const SETTINGS_ERROR_COPY: Readonly<
  Record<
    SettingsFieldErrorCode | "invalid-form" | "invalid-settings" | "forbidden" | "unavailable",
    string
  >
> = {
  "invalid-form": "No pudimos leer el formulario. Vuelve a intentarlo.",
  "invalid-settings":
    "No pudimos guardar los ajustes. Revisa cada campo y su rango, y vuelve a guardar.",
  "invalid-rsvp-default-party-limit":
    "Acompañantes por defecto: elige un número dentro del rango y que no pase del máximo de acompañantes.",
  "invalid-rsvp-max-party-limit":
    "Máximo de acompañantes: elige un número dentro del rango y que no quede por debajo de los acompañantes por defecto.",
  "invalid-gallery-photo-limit": "Fotos de galería: elige un número dentro del rango.",
  "invalid-stored-asset-limit":
    "Archivos guardados: elige un número dentro del rango y al menos uno más que las fotos de galería.",
  "invalid-max-upload-megabytes": "Peso máximo por foto (MB): elige un número dentro del rango.",
  "invalid-place-search-result-limit":
    "Resultados al buscar un lugar: elige un número dentro del rango.",
  "invalid-analytics-default-window-days":
    "Rango por defecto de la analítica (días): elige un número dentro del rango.",
  forbidden: "Tu cuenta no tiene permiso para cambiar la configuración.",
  unavailable: "No pudimos guardar los ajustes. Espera un momento y vuelve a intentarlo.",
};

export type SettingsErrorCode = keyof typeof SETTINGS_ERROR_COPY;

export const SETTINGS_NOTICE_COPY = {
  saved: "Guardamos los ajustes.",
} as const;

export type SettingsNoticeCode = keyof typeof SETTINGS_NOTICE_COPY;
