/**
 * Spanish product copy of the administrator sign-in and panel (M2 T8d; S36, L42). Administrators are
 * addressed with "tú" in neutral Mexican Spanish, like customers. Keep every administrator-facing
 * string of these pages here so the wording is reviewed in one place. One message covers a wrong
 * address, a wrong password, a customer address, and an expired initial password (S20, S22), so the
 * page never reveals whether an address has an account or what kind.
 */

/**
 * The second-factor policy the sign-in copy states. The API sets it in `TWO_FACTOR_OPTIONS`
 * (`apps/api/src/auth/administrator-enrollment.ts`): TOTP codes of 6 digits with a 30-second period,
 * and a lock of 900 seconds after repeated failures. The web never imports API code, so these values
 * mirror it by hand; `copy.test.ts` pins the copy's numbers to them, and `sign-in.ts` checks a code's
 * length with `codeDigits`.
 */
export const SECOND_FACTOR_POLICY = {
  codeDigits: 6,
  codePeriodSeconds: 30,
  lockoutMinutes: 15,
} as const;

export const ADMIN_SIGN_IN_COPY = {
  pageTitle: "Ingreso de administración | InvitaMe",
  eyebrow: "Administración",
  heading: "Ingresa al panel",
  intro: "Escribe tu correo y tu contraseña. Después te pedimos el código de tu app autenticadora.",
  emailLabel: "Correo electrónico",
  emailPlaceholder: "nombre@ejemplo.com",
  emailInvalid: "Escribe un correo válido, por ejemplo nombre@ejemplo.com.",
  passwordLabel: "Contraseña",
  passwordMissing: "Escribe tu contraseña.",
  continue: "Continuar",
  checking: "Verificando…",
  /** Shown only when the browser runs no JavaScript: the form needs it to send anything. */
  noScript: "Para ingresar, activa JavaScript en tu navegador.",
  invalidCredentials:
    "El correo o la contraseña no son correctos. Revísalos y vuelve a intentarlo.",
  codeHeading: "Confirma que eres tú",
  codeIntro:
    "Abre tu app autenticadora y escribe el código de 6 dígitos que muestra para InvitaMe.",
  codeLabel: "Código de la app",
  codeHint: "El código cambia cada 30 segundos. Usa el que veas en este momento.",
  codeIncomplete: "Escribe los 6 dígitos del código.",
  backupIntro:
    "Escribe uno de los códigos de respaldo que guardaste al activar tu app. Cada uno sirve una sola vez.",
  backupLabel: "Código de respaldo",
  backupPlaceholder: "aBc12-dEf34",
  backupHint: "Son 10 letras o números, con un guion en medio. Respeta mayúsculas y minúsculas.",
  backupIncomplete: "Escribe el código de respaldo completo, por ejemplo aBc12-dEf34.",
  signIn: "Ingresar",
  useBackupCode: "Usar un código de respaldo",
  useAuthenticatorCode: "Usar el código de la app",
  startOver: "Volver a empezar",
  signedIn: "Listo, ya ingresaste. Te llevamos al panel…",
  invalidCode: "El código no es correcto. Revisa que sea el que muestra tu app ahora mismo.",
  invalidBackupCode: "Ese código de respaldo no es correcto o ya lo usaste. Revísalo o usa otro.",
  challengeExpired: "Tu ingreso venció. Escribe de nuevo tu correo y tu contraseña.",
  attemptsExhausted:
    "Hiciste demasiados intentos con códigos. Escribe de nuevo tu correo y tu contraseña.",
  locked:
    "Por seguridad, pausamos el ingreso con códigos durante 15 minutos. Vuelve a intentarlo después.",
  tooManyAttempts: "Hiciste demasiados intentos. Espera un minuto y vuelve a intentarlo.",
  unavailable: "No pudimos continuar. Espera un momento y vuelve a intentarlo.",
} as const;

export const ADMIN_PANEL_COPY = {
  pageTitle: "Panel de administración | InvitaMe",
  eyebrow: "Administración",
  heading: "Panel de administración",
  intro: "Ingresaste con tu contraseña y tu app autenticadora.",
  emailLabel: "Correo electrónico",
  sessionNote: "Por seguridad, tu sesión termina 12 horas después de ingresar.",
  catalog: "Administrar el catálogo",
  signOut: "Cerrar sesión",
  signingOut: "Cerrando sesión…",
  noScript: "Para cerrar sesión, activa JavaScript en tu navegador.",
  signOutFailed: "No pudimos cerrar tu sesión. Inténtalo de nuevo.",
  unavailableHeading: "No pudimos cargar el panel",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
} as const;

/** The frame of every administration page: the sidebar and its navigation. */
export const ADMIN_SHELL_COPY = {
  brand: "InvitaMe",
  area: "Administración",
  navigationLabel: "Navegación de administración",
  breadcrumbLabel: "Ruta de navegación",
  generalGroup: "General",
  catalogGroup: "Catálogo",
  operationsGroup: "Operación",
  panel: "Panel",
  settings: "Configuración",
  catalogOverview: "Resumen del catálogo",
  payments: "Pagos",
  invitations: "Invitaciones",
  analytics: "Analítica",
} as const;
