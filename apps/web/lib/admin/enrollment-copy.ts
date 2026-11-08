/**
 * Spanish product copy of the authenticator-app enrollment at `/admin/activar` (M2 T8d; S36, L42),
 * addressed with "tú" like the rest of the product. Kept apart from `copy.ts`, which holds the
 * sign-in and panel copy, because only the enrollment page and `enrollment.ts` use it.
 */
export const ENROLLMENT_COPY = {
  pageTitle: "Activa tu app autenticadora | InvitaMe",
  eyebrow: "Administración",
  heading: "Activa tu app autenticadora",
  intro:
    "Tu cuenta de administración necesita un segundo paso para ingresar. Actívalo una sola vez con una app autenticadora en tu teléfono.",
  passwordStep: "Paso 1 de 3",
  passwordIntro: "Para empezar, confirma tu contraseña.",
  passwordLabel: "Contraseña",
  passwordMissing: "Escribe tu contraseña.",
  start: "Continuar",
  starting: "Preparando…",
  /** Shown only when the browser runs no JavaScript: the activation needs it at every step. */
  noScript: "Para activar tu app, necesitas JavaScript en tu navegador.",
  scanStep: "Paso 2 de 3",
  scanIntro:
    "Abre tu app autenticadora, elige agregar una cuenta y escanea este código. Después escribe el código de 6 dígitos que te muestra.",
  qrLabel: "Código QR para agregar InvitaMe a tu app autenticadora",
  setupKeyHeading: "¿No puedes escanearlo?",
  setupKeyIntro: "Agrega la cuenta a mano con esta clave. Los espacios solo facilitan la lectura.",
  setupKeyLabel: "Clave de configuración",
  codeLabel: "Código de la app",
  codeHint: "El código cambia cada 30 segundos. Usa el que veas en este momento.",
  codeIncomplete: "Escribe los 6 dígitos del código.",
  confirm: "Activar",
  confirming: "Verificando…",
  backupStep: "Paso 3 de 3",
  backupHeading: "Guarda tus códigos de respaldo",
  backupCodesIntro:
    "Si pierdes tu teléfono, cada uno de estos códigos te deja ingresar una vez. Te los mostramos una sola vez: anótalos o guárdalos en un lugar seguro, fuera de esta computadora.",
  backupCodesLabel: "Códigos de respaldo",
  backupCount: (count: number) => `${count} códigos, cada uno sirve una sola vez.`,
  savedCodes: "Ya los guardé",
  savedCheck: "Guardé mis códigos de respaldo en un lugar seguro.",
  savedMissing: "Marca la casilla cuando hayas guardado tus códigos.",
  enrolled: "Listo, tu app quedó activada. Te llevamos al panel…",
  invalidPassword: "La contraseña no es correcta. Revísala y vuelve a intentarlo.",
  invalidCode: "El código no es correcto. Revisa que sea el que muestra tu app ahora mismo.",
  alreadyEnrolled: "Tu app autenticadora ya estaba activada. Te llevamos al panel…",
  sessionEnded: "Tu sesión terminó. Ingresa de nuevo con tu correo y tu contraseña.",
  signInAgain: "Ingresar de nuevo",
  tooManyAttempts: "Hiciste demasiados intentos. Espera un minuto y vuelve a intentarlo.",
  unavailable: "No pudimos continuar. Espera un momento y vuelve a intentarlo.",
  unavailableHeading: "No pudimos cargar esta página",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
} as const;
