/**
 * Spanish product copy of the administrator catalog pages (M3 T8a and T8b; S1). Administrators are addressed
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
  templates: "/admin/catalogo/plantillas",
} as const;

/** The two kinds that share one shape (`CatalogEntry`): a category and a feature. */
export type EntrySection = "categories" | "features";

export const CATALOG_INDEX_COPY = {
  pageTitle: "Catálogo | InvitaMe",
  eyebrow: "Administración",
  heading: "Catálogo",
  intro: "Administra las categorías, las funciones, los paquetes y las plantillas de InvitaMe.",
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
    {
      path: CATALOG_PATHS.templates,
      title: "Plantillas",
      description: "Los diseños de invitación y sus versiones: crea, publica y retira versiones.",
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

export const TEMPLATE_STATUS_LABELS = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada",
} as const;

export const VERSION_STATUS_LABELS = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
  RETIRED: "Retirada",
} as const;

export const TEMPLATE_COPY = {
  pageTitle: "Plantillas | InvitaMe",
  heading: "Plantillas",
  intro:
    "Las plantillas son los diseños de invitación. No se borran: puedes archivarlas. Su contenido vive en versiones que no se editan.",
  empty: "Todavía no hay plantillas.",
  newLink: "Nueva plantilla",
  noPublishedVersion: "Sin versión publicada",
  publishedVersion: "Versión publicada",
  versionCount: "Versiones",
  createPageTitle: "Nueva plantilla | InvitaMe",
  createHeading: "Nueva plantilla",
  createIntro:
    "Elige una clave con cuidado: no se puede cambiar después. La plantilla nace como borrador y sin versiones.",
  keyHint: "Minúsculas, números y guiones, por ejemplo aventura-cumple. Hasta 100 caracteres.",
  keyPlaceholder: "aventura-cumple",
  createSubmit: "Crear plantilla",
  categoryLabel: "Categoría",
  categoryHint: "La categoría agrupa la plantilla. Una categoría inactiva se marca como tal.",
  categoryInactive: "inactiva",
  noCategories: "Todavía no hay categorías. Créalas primero en Categorías.",
  editPageTitle: "Editar plantilla | InvitaMe",
  editHeading: "Editar plantilla",
  editIntro:
    "Cambia los datos de la plantilla y administra sus versiones. Cada formulario se guarda por separado.",
  detailsHeading: "Datos de la plantilla",
  statusLabel: "Estado",
  statusHint:
    "Solo puede estar publicada mientras tenga una versión publicada. Archivarla la saca del catálogo, pero se conserva.",
  backToList: "Volver a plantillas",
  notFoundHeading: "No encontramos la plantilla",
  notFoundBody: "Puede que ya no exista. Vuelve a la lista para elegir otra.",
} as const;

export const VERSION_COPY = {
  heading: "Versiones",
  intro:
    "Una versión es una copia fija del renderizador, el esquema y la configuración. Nunca se edita: para cambiar algo, crea una versión nueva. Solo una versión puede estar publicada; al publicar otra, la anterior se retira, y las invitaciones que ya la usan la conservan.",
  empty: "Esta plantilla todavía no tiene versiones.",
  versionLabel: "Versión",
  rendererLabel: "Renderizador",
  createdLabel: "Creada",
  publish: "Publicar",
  retire: "Retirar",
  retireBlocked:
    "Para retirar la versión publicada, primero cambia la plantilla a borrador o archivada.",
  formHeading: "Nueva versión",
  formIntro:
    "Se crea siempre como borrador y se revisa contra el renderizador antes de guardarse. Después la puedes publicar desde la lista.",
  prefilled: (version: number, status: string): string =>
    `Los campos parten de una copia de la versión ${version} (${status.toLowerCase()}). Edítala: la versión original no cambia.`,
  notPrefilled: "Esta plantilla todavía no tiene versiones: escribe el esquema y la configuración.",
  rendererHint: "Solo aparecen los renderizadores aprobados en la aplicación.",
  noRenderers: "No hay renderizadores disponibles, así que no se puede crear una versión.",
  schemaLabel: "Esquema (JSON)",
  configurationLabel: "Configuración (JSON)",
  jsonHint: "Un JSON válido de hasta 64 KiB.",
  submit: "Crear versión como borrador",
  submitting: "Creando versión…",
  contractInvalid:
    "El renderizador no aceptó el esquema o la configuración. No se guardó nada: corrige lo que indican los detalles técnicos y vuelve a intentarlo.",
  validation:
    "El esquema y la configuración deben ser JSON de hasta 64 KiB y 32 niveles de anidación, sin caracteres no permitidos.",
  technicalDetails: "Detalles técnicos",
  technicalDetailsNote: "Texto técnico de la API, en inglés. Se muestran como máximo 20.",
  schemaName: "El esquema",
  configurationName: "La configuración",
  jsonEmpty: (subject: string): string =>
    `${subject} no puede estar en blanco. Escribe un JSON válido.`,
  jsonSyntax: (subject: string): string =>
    `${subject} no es un JSON válido. Revisa las comas, las comillas y las llaves.`,
  jsonTooLarge: (subject: string): string => `${subject} es demasiado grande: el máximo es 64 KiB.`,
} as const;

/** Column headers and row actions of the catalog tables. */
export const CATALOG_TABLE_COPY = {
  name: "Nombre",
  key: "Clave",
  status: "Estado",
  category: "Categoría",
  price: "Precio",
  publishedVersion: "Versión publicada",
  actions: "Acciones",
  edit: "Editar",
  cancel: "Cancelar",
  count: (total: number): string => (total === 1 ? "1 registro" : `${total} registros`),
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
  "version-created": "Creamos la versión como borrador. Ya la puedes publicar.",
  "version-published": "Publicamos la versión. La anterior quedó retirada.",
  "version-retired": "Retiramos la versión.",
} as const;

export const CATALOG_ERROR_COPY = {
  validation:
    "Revisa los datos: la clave con el formato indicado, el nombre de 1 a 120 caracteres y la descripción de hasta 1000.",
  "key-taken": "Ya existe un registro con esa clave. Escribe otra.",
  "concurrent-update": "Otra persona cambió esto al mismo tiempo. Vuelve a intentarlo.",
  "feature-not-found":
    "Alguna de las funciones elegidas ya no existe. Recarga la página y vuelve a elegir.",
  "category-not-found": "La categoría elegida ya no existe. Recarga la página y vuelve a elegir.",
  "template-not-publishable":
    "No se pudo hacer: una plantilla solo está publicada mientras tenga una versión publicada. Publica una versión primero, o cambia la plantilla a borrador o archivada antes de retirarla.",
  "transition-not-allowed":
    "Esa versión ya no está en un estado que permita esta acción. Recarga la página para ver su estado actual.",
  "contract-invalid":
    "El renderizador ya no acepta el contenido de esta versión, así que no se publicó. Crea una versión nueva con el contenido corregido para ver el detalle.",
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
