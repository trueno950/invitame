/**
 * Spanish product copy of the administrator catalog pages (M3 T8a; S1). Administrators are addressed
 * with "tú" in neutral Mexican Spanish, like the rest of the administration (`../copy.ts`). Keep every
 * catalog string here so the wording is reviewed in one place. "Funciones" is the label of what the
 * code calls features.
 */

export const CATALOG_PATHS = {
  panel: "/admin",
  index: "/admin/catalogo",
  categories: "/admin/catalogo/categorias",
  features: "/admin/catalogo/funciones",
  packages: "/admin/catalogo/paquetes",
} as const;

/** The two kinds that share one shape (`CatalogEntry`): a category and a feature. */
export type EntrySection = "categories" | "features";

export const CATALOG_INDEX_COPY = {
  pageTitle: "Catálogo | InvitaMe",
  eyebrow: "Administración",
  heading: "Catálogo",
  intro: "Administra las categorías, las funciones y los paquetes de InvitaMe.",
  backToPanel: "Volver al panel",
  sections: [
    {
      path: CATALOG_PATHS.categories,
      title: "Categorías",
      description: "Agrupan las plantillas, por ejemplo cumpleaños o baby shower.",
    },
    {
      path: CATALOG_PATHS.features,
      title: "Funciones",
      description: "Capacidades que un paquete puede incluir, por ejemplo confirmar asistencia.",
    },
    {
      path: CATALOG_PATHS.packages,
      title: "Paquetes",
      description: "Lo que se ofrece a la venta, con sus funciones y su precio.",
    },
  ],
} as const;

/** Labels and hints shared by every create and edit form. */
export const CATALOG_FIELD_COPY = {
  keyLabel: "Clave",
  nameLabel: "Nombre",
  nameHint: "Hasta 120 caracteres.",
  descriptionLabel: "Descripción",
  descriptionHint: "Opcional. Hasta 1000 caracteres.",
  keyReadOnlyHint: "La clave no se puede cambiar.",
  save: "Guardar cambios",
  backToCatalog: "Volver al catálogo",
} as const;

export interface EntryCopy {
  pageTitle: string;
  heading: string;
  intro: string;
  empty: string;
  newLink: string;
  createPageTitle: string;
  createHeading: string;
  createIntro: string;
  keyHint: string;
  keyPlaceholder: string;
  createSubmit: string;
  editPageTitle: string;
  editHeading: string;
  editIntro: string;
  activeLabel: string;
  activeHint: string;
  activeBadge: string;
  inactiveBadge: string;
  backToList: string;
  notFoundHeading: string;
  notFoundBody: string;
}

export const ENTRY_COPY: Record<EntrySection, EntryCopy> = {
  categories: {
    pageTitle: "Categorías | InvitaMe",
    heading: "Categorías",
    intro: "Las categorías agrupan las plantillas. No se borran: puedes desactivarlas.",
    empty: "Todavía no hay categorías.",
    newLink: "Nueva categoría",
    createPageTitle: "Nueva categoría | InvitaMe",
    createHeading: "Nueva categoría",
    createIntro: "Elige una clave con cuidado: no se puede cambiar después.",
    keyHint: "Minúsculas, números y guiones, por ejemplo baby-shower. Hasta 100 caracteres.",
    keyPlaceholder: "baby-shower",
    createSubmit: "Crear categoría",
    editPageTitle: "Editar categoría | InvitaMe",
    editHeading: "Editar categoría",
    editIntro: "Cambia el nombre, la descripción o si está activa.",
    activeLabel: "Categoría activa",
    activeHint: "Una categoría inactiva se conserva, pero deja de ofrecerse.",
    activeBadge: "Activa",
    inactiveBadge: "Inactiva",
    backToList: "Volver a categorías",
    notFoundHeading: "No encontramos la categoría",
    notFoundBody: "Puede que ya no exista. Vuelve a la lista para elegir otra.",
  },
  features: {
    pageTitle: "Funciones | InvitaMe",
    heading: "Funciones",
    intro: "Las funciones son lo que un paquete puede incluir. No se borran: puedes desactivarlas.",
    empty: "Todavía no hay funciones.",
    newLink: "Nueva función",
    createPageTitle: "Nueva función | InvitaMe",
    createHeading: "Nueva función",
    createIntro: "Elige una clave con cuidado: no se puede cambiar después.",
    keyHint: "Mayúsculas, números y guion bajo, por ejemplo GUEST_LIST. Hasta 100 caracteres.",
    keyPlaceholder: "GUEST_LIST",
    createSubmit: "Crear función",
    editPageTitle: "Editar función | InvitaMe",
    editHeading: "Editar función",
    editIntro: "Cambia el nombre, la descripción o si está activa.",
    activeLabel: "Función activa",
    activeHint: "Una función inactiva se conserva, pero deja de ofrecerse.",
    activeBadge: "Activa",
    inactiveBadge: "Inactiva",
    backToList: "Volver a funciones",
    notFoundHeading: "No encontramos la función",
    notFoundBody: "Puede que ya no exista. Vuelve a la lista para elegir otra.",
  },
};

export const PACKAGE_STATUS_LABELS = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  ARCHIVED: "Archivado",
} as const;

export const PACKAGE_COPY = {
  pageTitle: "Paquetes | InvitaMe",
  heading: "Paquetes",
  intro:
    "Los paquetes se ofrecen a la venta con sus funciones y su precio. No se borran: puedes archivarlos.",
  empty: "Todavía no hay paquetes.",
  newLink: "Nuevo paquete",
  noPrice: "Sin precio",
  createPageTitle: "Nuevo paquete | InvitaMe",
  createHeading: "Nuevo paquete",
  createIntro:
    "Elige una clave con cuidado: no se puede cambiar después. El paquete nace como borrador.",
  keyHint: "Minúsculas, números y guiones, por ejemplo fiesta-basico. Hasta 100 caracteres.",
  keyPlaceholder: "fiesta-basico",
  createSubmit: "Crear paquete",
  editPageTitle: "Editar paquete | InvitaMe",
  editHeading: "Editar paquete",
  editIntro:
    "Cambia los datos, las funciones incluidas y el precio. Cada formulario se guarda por separado.",
  backToList: "Volver a paquetes",
  notFoundHeading: "No encontramos el paquete",
  notFoundBody: "Puede que ya no exista. Vuelve a la lista para elegir otro.",
  detailsHeading: "Datos del paquete",
  statusLabel: "Estado",
  statusHint: "Solo un paquete activo se ofrece a la venta.",
  featuresHeading: "Funciones incluidas",
  featuresHint: "Marca las funciones que incluye este paquete.",
  featuresEmpty: "Todavía no hay funciones. Créalas primero en Funciones.",
  featuresSave: "Guardar funciones",
  featureInactive: "inactiva",
  priceHeading: "Precio",
  priceCurrent: "Precio actual",
  priceLabel: "Precio en pesos mexicanos (MXN)",
  priceHint: "Hasta 2 decimales, sin comas ni símbolos, por ejemplo 1500 o 1500.50.",
  priceSave: "Guardar precio",
  priceNote: "Al cambiar el precio, el anterior pasa al historial.",
  historyHeading: "Historial de precios",
  historyEmpty: "Todavía no se ha fijado ningún precio.",
  historyAmount: "Precio",
  historySince: "Desde",
  historyUntil: "Hasta",
  historyCurrent: "Vigente",
} as const;

/** The notice of a catalog page whose data could not be loaded. */
export const CATALOG_UNAVAILABLE_COPY = {
  heading: "No pudimos cargar el catálogo",
  body: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
} as const;

export const CATALOG_NOTICE_COPY = {
  created: "Listo, lo creamos.",
  saved: "Guardamos los cambios.",
  "features-saved": "Guardamos las funciones del paquete.",
  "price-saved": "Guardamos el precio nuevo. El anterior quedó en el historial.",
} as const;

export const CATALOG_ERROR_COPY = {
  validation:
    "Revisa los datos: la clave con el formato indicado, el nombre de 1 a 120 caracteres y la descripción de hasta 1000.",
  "key-taken": "Ya existe un registro con esa clave. Escribe otra.",
  "concurrent-update": "Otra persona cambió esto al mismo tiempo. Vuelve a intentarlo.",
  "feature-not-found":
    "Alguna de las funciones elegidas ya no existe. Recarga la página y vuelve a elegir.",
  forbidden: "Tu cuenta no tiene permiso para hacer esto.",
  "not-found": "No encontramos ese registro. Puede que ya no exista.",
  unavailable: "No pudimos completar la acción. Espera un momento y vuelve a intentarlo.",
  "invalid-form": "No pudimos leer el formulario. Vuelve a intentarlo.",
  "price-empty": "Escribe el precio en pesos.",
  "price-format":
    "Escribe el precio en pesos con hasta 2 decimales, sin comas ni símbolos, por ejemplo 1500 o 1500.50.",
  "price-too-large": "El precio es demasiado alto.",
} as const;

export type CatalogNoticeCode = keyof typeof CATALOG_NOTICE_COPY;
export type CatalogErrorCode = keyof typeof CATALOG_ERROR_COPY;
