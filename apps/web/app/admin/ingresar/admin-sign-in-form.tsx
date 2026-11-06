"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { ADMIN_SIGN_IN_COPY } from "../../../lib/admin/copy.ts";
import {
  adminSignInFailureMessage,
  isCompleteAuthenticatorCode,
  isPlausibleBackupCode,
  normalizeAuthenticatorCode,
  normalizeBackupCode,
  type SecondFactorOutcome,
  secondFactorFailureMessage,
  signInWithPassword,
  verifyAuthenticatorCode,
  verifyBackupCode,
} from "../../../lib/admin/sign-in.ts";
import {
  type BrowserFetch,
  isPlausibleEmail,
  normalizeEmail,
} from "../../../lib/customer/sign-in.ts";
import {
  errorNote,
  fieldHint,
  fieldLabel,
  primaryButton,
  statusNote,
  textButton,
  textField,
} from "../../_components/ui.ts";

/** Same-origin requests to the `/api/auth` proxy, so the browser stores the cookies itself. */
const browserFetch: BrowserFetch = (input, init) => fetch(input, init);

type Step = "password" | "code" | "backup";

/**
 * Administrator sign-in in two steps (M2 T8d; S6, S20, S22, S36): the email and password, then the
 * authenticator app's 6-digit code or, as an alternative, a backup code. Status and errors are
 * announced through live regions that stay mounted across the steps, and focus moves to the field
 * that needs attention. The password is cleared from memory once the first step is answered.
 */
export function AdminSignInForm() {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const emailField = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const backupField = useRef<HTMLInputElement>(null);
  const ids = useId();
  const errorId = `${ids}-error`;
  const codeHintId = `${ids}-code-hint`;
  const backupHintId = `${ids}-backup-hint`;

  function fail(message: string, field: HTMLInputElement | null) {
    setPending(false);
    setError(message);
    field?.focus();
  }

  function showStep(next: Step, message = "") {
    flushSync(() => {
      setPending(false);
      setStep(next);
      setCode("");
      setBackupCode("");
      setStatus("");
      setError(message);
    });
    const field = { password: passwordField, code: codeField, backup: backupField }[next];
    field.current?.focus();
  }

  function enterPanel() {
    // Stay pending: a full navigation loads `/admin`, whose server render picks the right page.
    setStatus(ADMIN_SIGN_IN_COPY.signedIn);
    window.location.assign("/admin");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const address = normalizeEmail(email);
    if (!isPlausibleEmail(address)) {
      fail(ADMIN_SIGN_IN_COPY.emailInvalid, emailField.current);
      return;
    }
    if (password.length === 0) {
      fail(ADMIN_SIGN_IN_COPY.passwordMissing, passwordField.current);
      return;
    }

    setPending(true);
    setError("");
    setStatus("");
    const outcome = await signInWithPassword(browserFetch, address, password);
    setPassword("");

    if (!outcome.ok) {
      fail(adminSignInFailureMessage(outcome.failure), passwordField.current);
      return;
    }

    if (outcome.next === "signed-in") {
      enterPanel();
      return;
    }

    setEmail(address);
    showStep("code");
  }

  function handleSecondFactor(outcome: SecondFactorOutcome, field: HTMLInputElement | null) {
    if (outcome.ok) {
      enterPanel();
      return;
    }

    const message = secondFactorFailureMessage(outcome.failure);
    if (outcome.failure === "challenge-expired" || outcome.failure === "attempts-exhausted") {
      showStep("password", message);
      return;
    }
    fail(message, field);
    field?.select();
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (!isCompleteAuthenticatorCode(code)) {
      fail(ADMIN_SIGN_IN_COPY.codeIncomplete, codeField.current);
      return;
    }

    setPending(true);
    setError("");
    handleSecondFactor(await verifyAuthenticatorCode(browserFetch, code), codeField.current);
  }

  async function submitBackupCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const normalized = normalizeBackupCode(backupCode);
    if (!isPlausibleBackupCode(normalized)) {
      fail(ADMIN_SIGN_IN_COPY.backupIncomplete, backupField.current);
      return;
    }

    setPending(true);
    setError("");
    setBackupCode(normalized);
    handleSecondFactor(await verifyBackupCode(browserFetch, normalized), backupField.current);
  }

  const describedByError = error ? errorId : undefined;

  return (
    <div className="flex flex-col gap-6">
      {step !== "password" ? (
        <div className="text-center">
          <h2 className="font-display text-[1.75rem] font-semibold leading-tight text-ink">
            {ADMIN_SIGN_IN_COPY.codeHeading}
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-pretty text-muted">
            {step === "code" ? ADMIN_SIGN_IN_COPY.codeIntro : ADMIN_SIGN_IN_COPY.backupIntro}
          </p>
        </div>
      ) : null}

      <div aria-live="polite" role="status">
        {status ? <p className={statusNote}>{status}</p> : null}
      </div>

      {step === "password" ? (
        <form className="flex flex-col gap-6" noValidate onSubmit={submitPassword}>
          <div>
            <label className={fieldLabel} htmlFor={`${ids}-email`}>
              {ADMIN_SIGN_IN_COPY.emailLabel}
            </label>
            <input
              aria-describedby={describedByError}
              aria-invalid={error ? true : undefined}
              autoCapitalize="none"
              autoComplete="username"
              className={textField}
              id={`${ids}-email`}
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={ADMIN_SIGN_IN_COPY.emailPlaceholder}
              ref={emailField}
              required
              spellCheck={false}
              type="email"
              value={email}
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor={`${ids}-password`}>
              {ADMIN_SIGN_IN_COPY.passwordLabel}
            </label>
            <input
              aria-describedby={describedByError}
              aria-invalid={error ? true : undefined}
              autoComplete="current-password"
              className={textField}
              id={`${ids}-password`}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              ref={passwordField}
              required
              type="password"
              value={password}
            />
          </div>
          <button className={primaryButton} disabled={pending} type="submit">
            {pending ? ADMIN_SIGN_IN_COPY.checking : ADMIN_SIGN_IN_COPY.continue}
          </button>
        </form>
      ) : null}

      {step === "code" ? (
        <form className="flex flex-col gap-6" noValidate onSubmit={submitCode}>
          <div>
            <label className={fieldLabel} htmlFor={`${ids}-code`}>
              {ADMIN_SIGN_IN_COPY.codeLabel}
            </label>
            <input
              aria-describedby={describedByError ? `${codeHintId} ${errorId}` : codeHintId}
              aria-invalid={error ? true : undefined}
              autoComplete="one-time-code"
              className={`${textField} text-center text-2xl font-medium tracking-[0.4em] tabular-nums`}
              id={`${ids}-code`}
              inputMode="numeric"
              name="code"
              onChange={(event) => setCode(normalizeAuthenticatorCode(event.target.value))}
              pattern="[0-9]*"
              ref={codeField}
              required
              type="text"
              value={code}
            />
            <p className={fieldHint} id={codeHintId}>
              {ADMIN_SIGN_IN_COPY.codeHint}
            </p>
          </div>
          <button className={primaryButton} disabled={pending} type="submit">
            {pending ? ADMIN_SIGN_IN_COPY.checking : ADMIN_SIGN_IN_COPY.signIn}
          </button>
        </form>
      ) : null}

      {step === "backup" ? (
        <form className="flex flex-col gap-6" noValidate onSubmit={submitBackupCode}>
          <div>
            <label className={fieldLabel} htmlFor={`${ids}-backup`}>
              {ADMIN_SIGN_IN_COPY.backupLabel}
            </label>
            <input
              aria-describedby={describedByError ? `${backupHintId} ${errorId}` : backupHintId}
              aria-invalid={error ? true : undefined}
              autoCapitalize="none"
              autoComplete="off"
              className={`${textField} text-center text-xl font-medium tracking-[0.18em]`}
              id={`${ids}-backup`}
              name="backupCode"
              onChange={(event) => setBackupCode(event.target.value)}
              placeholder={ADMIN_SIGN_IN_COPY.backupPlaceholder}
              ref={backupField}
              required
              spellCheck={false}
              type="text"
              value={backupCode}
            />
            <p className={fieldHint} id={backupHintId}>
              {ADMIN_SIGN_IN_COPY.backupHint}
            </p>
          </div>
          <button className={primaryButton} disabled={pending} type="submit">
            {pending ? ADMIN_SIGN_IN_COPY.checking : ADMIN_SIGN_IN_COPY.signIn}
          </button>
        </form>
      ) : null}

      {step !== "password" ? (
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
          <button
            className={textButton}
            disabled={pending}
            onClick={() => showStep(step === "code" ? "backup" : "code")}
            type="button"
          >
            {step === "code"
              ? ADMIN_SIGN_IN_COPY.useBackupCode
              : ADMIN_SIGN_IN_COPY.useAuthenticatorCode}
          </button>
          <button
            className={textButton}
            disabled={pending}
            onClick={() => showStep("password")}
            type="button"
          >
            {ADMIN_SIGN_IN_COPY.startOver}
          </button>
        </div>
      ) : null}

      <div aria-live="assertive" id={errorId} role="alert">
        {error ? <p className={errorNote}>{error}</p> : null}
      </div>
    </div>
  );
}
