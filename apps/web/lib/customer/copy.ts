/**
 * Spanish product copy of the customer pages (M2 T8c; L39). Customers are addressed with "tú" in
 * neutral Mexican Spanish. Keep every customer-facing string here so the wording is reviewed in one
 * place. Sign-in copy never says whether an address has an account or what kind (S24).
 */

/**
 * The sign-in code policy the copy states. The API sets it (`SIGN_IN_CODE_LENGTH` and
 * `SIGN_IN_CODE_EXPIRES_IN_SECONDS` in `apps/api/src/auth/sign-in-code/sign-in-code-message.ts`);
 * the web never imports API code, so these values mirror it by hand. `copy.test.ts` pins every
 * number of digits and minutes in the copy to them, and `sign-in.ts` checks a code's length with
 * `digits`.
 */
export const SIGN_IN_CODE_POLICY = { digits: 6, validityMinutes: 5 } as const;

export const SIGN_IN_COPY = {
  pageTitle: "Ingresar | InvitaMe",
  eyebrow: "Tu cuenta",
  heading: "Ingresa con tu correo",
  intro: "Ingresa tu correo y te enviamos un código de 6 dígitos. No necesitas contraseña.",
  asideHeading: "Sin contraseñas que recordar",
  asideBody:
    "Cada vez que ingreses, pides un código nuevo a tu correo. Sirve una sola vez y vence en 5 minutos.",
  emailLabel: "Correo electrónico",
  emailPlaceholder: "nombre@ejemplo.com",
  emailInvalid: "Escribe un correo válido, por ejemplo nombre@ejemplo.com.",
  sendCode: "Enviar código",
  sending: "Enviando…",
  /** Shown only when the browser runs no JavaScript: the form needs it to ask for a code. */
  noScript: "Para pedir tu código, activa JavaScript en tu navegador.",
  codeHeading: "Revisa tu correo",
  codeRequested: (email: string) =>
    `Pedimos un código para ${email}. Puede tardar un par de minutos en llegar y vence en 5 minutos.`,
  newCodeRequested: (email: string) =>
    `Pedimos un código nuevo para ${email}. Usa el más reciente.`,
  codeLabel: "Código de acceso",
  codeHint: "Son 6 dígitos. Si no lo ves, revisa tu carpeta de correo no deseado.",
  codeIncomplete: "Escribe los 6 dígitos del código.",
  signIn: "Ingresar",
  verifying: "Verificando…",
  resendCode: "Enviar un código nuevo",
  changeEmail: "Cambiar correo",
  signedIn: "Listo, ya ingresaste. Te llevamos a tu cuenta…",
  invalidCode: "El código no es correcto o ya venció. Revísalo o pide uno nuevo.",
  tooManyAttempts: "Hiciste demasiados intentos. Espera un minuto y vuelve a intentarlo.",
  unavailable:
    "No pudimos continuar. Espera un momento y vuelve a intentarlo; si sigue sin funcionar, pide un código nuevo.",
} as const;

export const ACCOUNT_COPY = {
  pageTitle: "Tu cuenta | InvitaMe",
  eyebrow: "Cuenta",
  heading: "Tu cuenta",
  intro: "Aquí ves los datos con los que ingresas a InvitaMe.",
  emailLabel: "Correo electrónico",
  nameLabel: "Nombre para mostrar",
  nameEmpty: "Aún no agregas un nombre.",
  nameHint: "Es opcional, de hasta 120 caracteres. Déjalo vacío para quitarlo.",
  saveName: "Guardar nombre",
  saving: "Guardando…",
  nameSaved: "Listo, guardamos tu nombre.",
  nameCleared: "Listo, quitamos tu nombre.",
  nameInvalid: "Revisa tu nombre: debe tener entre 1 y 120 caracteres.",
  nameFailed: "No pudimos guardar tu nombre. Inténtalo de nuevo en unos minutos.",
  signOut: "Cerrar sesión",
  signingOut: "Cerrando sesión…",
  noScript: "Para cerrar sesión, activa JavaScript en tu navegador.",
  signOutFailed: "No pudimos cerrar tu sesión. Inténtalo de nuevo.",
  unavailableHeading: "No pudimos cargar tu cuenta",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
  notCustomer: "Esta página es para cuentas de clientes.",
  /** The administrator notice links to the panel (M2 T8d; S36); no public page links to `/admin`. */
  adminPanel: "Ir al panel de administración",
  home: "Ir al inicio",
} as const;
