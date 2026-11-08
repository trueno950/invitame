"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  confirmEnrollment,
  confirmFailureMessage,
  type Enrollment,
  enableFailureMessage,
  groupSetupKey,
  startEnrollment,
} from "../../../lib/admin/enrollment.ts";
import { ENROLLMENT_COPY } from "../../../lib/admin/enrollment-copy.ts";
import {
  isCompleteAuthenticatorCode,
  normalizeAuthenticatorCode,
} from "../../../lib/admin/sign-in.ts";
import { useInteractive } from "../../../lib/customer/interactive.ts";
import { browserFetch } from "../../../lib/customer/sign-in.ts";
import {
  errorNote,
  fieldHint,
  fieldLabel,
  primaryButton,
  quietButton,
  statusNote,
  textField,
} from "../../_components/ui.ts";
import { QrCode } from "./qr-code.tsx";

type Step = "password" | "scan" | "backup";

const stepLabel = "text-center text-xs font-medium uppercase tracking-[0.18em] text-primary";

/**
 * The three enrollment steps (M2 T8d; S6, S21, S36, L42): confirm the password, add InvitaMe to the
 * authenticator app with the QR code or the setup key and confirm with its first code, then save the
 * backup codes, shown once, before continuing to the panel.
 *
 * The enrollment answer (TOTP URI, setup key, backup codes) lives only in this component's state:
 * it is never put in a URL, web storage, a cookie, a log, or a server action, and it is gone once the
 * page is left. The password is cleared as soon as the API has answered.
 *
 * The forms send nothing by themselves (M2 T8e; S42): they declare `post`, and their buttons stay
 * disabled until the page is interactive, so the password never reaches the URL by a native submit.
 */
export function EnrollmentFlow() {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sessionEnded, setSessionEnded] = useState(false);
  const [pending, setPending] = useState(false);
  const interactive = useInteractive();
  const locked = pending || !interactive;
  const passwordField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const savedField = useRef<HTMLInputElement>(null);
  const backupHeading = useRef<HTMLHeadingElement>(null);
  const ids = useId();
  const errorId = `${ids}-error`;
  const codeHintId = `${ids}-code-hint`;
  const describedByError = error ? errorId : undefined;

  function fail(message: string, field: HTMLInputElement | null) {
    setPending(false);
    setError(message);
    field?.focus();
  }

  function goToPanel(message: string) {
    // Stay pending: a full navigation loads `/admin` with the current session cookie.
    setStatus(message);
    window.location.assign("/admin");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (password.length === 0) {
      fail(ENROLLMENT_COPY.passwordMissing, passwordField.current);
      return;
    }

    setPending(true);
    setError("");
    const outcome = await startEnrollment(browserFetch, password);
    setPassword("");

    if (!outcome.ok) {
      if (outcome.failure === "already-enrolled") {
        goToPanel(ENROLLMENT_COPY.alreadyEnrolled);
        return;
      }
      setSessionEnded(outcome.failure === "session-ended");
      fail(enableFailureMessage(outcome.failure), passwordField.current);
      return;
    }

    flushSync(() => {
      setPending(false);
      setEnrollment(outcome.enrollment);
      setStep("scan");
    });
    codeField.current?.focus();
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (!isCompleteAuthenticatorCode(code)) {
      fail(ENROLLMENT_COPY.codeIncomplete, codeField.current);
      return;
    }

    setPending(true);
    setError("");
    const outcome = await confirmEnrollment(browserFetch, code);

    if (!outcome.ok) {
      setSessionEnded(outcome.failure === "session-ended");
      fail(confirmFailureMessage(outcome.failure), codeField.current);
      codeField.current?.select();
      return;
    }

    flushSync(() => {
      setPending(false);
      setCode("");
      setStep("backup");
    });
    backupHeading.current?.focus();
  }

  function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (!saved) {
      fail(ENROLLMENT_COPY.savedMissing, savedField.current);
      return;
    }

    setPending(true);
    setError("");
    setEnrollment(null);
    goToPanel(ENROLLMENT_COPY.enrolled);
  }

  return (
    <div className="flex flex-col gap-6">
      {step === "password" ? (
        <form className="flex flex-col gap-6" method="post" noValidate onSubmit={submitPassword}>
          <p className={stepLabel}>{ENROLLMENT_COPY.passwordStep}</p>
          <p className="-mt-3 text-center text-[0.9375rem] leading-relaxed text-muted">
            {ENROLLMENT_COPY.passwordIntro}
          </p>
          <div>
            <label className={fieldLabel} htmlFor={`${ids}-password`}>
              {ENROLLMENT_COPY.passwordLabel}
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
          <button className={primaryButton} disabled={locked} type="submit">
            {pending ? ENROLLMENT_COPY.starting : ENROLLMENT_COPY.start}
          </button>
          <noscript>
            <p className={`${fieldHint} -mt-3 text-center`}>{ENROLLMENT_COPY.noScript}</p>
          </noscript>
        </form>
      ) : null}

      {step === "scan" && enrollment ? (
        <form className="flex flex-col gap-6" method="post" noValidate onSubmit={submitCode}>
          <p className={stepLabel}>{ENROLLMENT_COPY.scanStep}</p>
          <p className="-mt-3 text-center text-[0.9375rem] leading-relaxed text-pretty text-muted">
            {ENROLLMENT_COPY.scanIntro}
          </p>
          <div className="flex justify-center">
            <QrCode data={enrollment.totpURI} label={ENROLLMENT_COPY.qrLabel} />
          </div>
          <div className="rounded-field bg-rose-50 px-4 py-3 text-center">
            <p className="text-sm font-medium text-ink">{ENROLLMENT_COPY.setupKeyHeading}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{ENROLLMENT_COPY.setupKeyIntro}</p>
            {/* The hidden caption names the key for assistive technology (S41). */}
            <figure className="mt-2">
              <figcaption className="sr-only">{ENROLLMENT_COPY.setupKeyLabel}</figcaption>
              <code className="block font-mono text-[0.9375rem] font-medium leading-7 tracking-[0.08em] break-words text-ink select-all">
                {groupSetupKey(enrollment.setupKey)}
              </code>
            </figure>
          </div>
          <div>
            <label className={fieldLabel} htmlFor={`${ids}-code`}>
              {ENROLLMENT_COPY.codeLabel}
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
              {ENROLLMENT_COPY.codeHint}
            </p>
          </div>
          <button className={primaryButton} disabled={locked} type="submit">
            {pending ? ENROLLMENT_COPY.confirming : ENROLLMENT_COPY.confirm}
          </button>
        </form>
      ) : null}

      {step === "backup" ? (
        <form className="flex flex-col gap-6" method="post" noValidate onSubmit={finish}>
          <div className="text-center">
            <p className={stepLabel}>{ENROLLMENT_COPY.backupStep}</p>
            <h2
              className="mt-2 font-display text-[1.75rem] font-semibold leading-tight text-ink focus:outline-none"
              ref={backupHeading}
              tabIndex={-1}
            >
              {ENROLLMENT_COPY.backupHeading}
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-pretty text-muted">
              {ENROLLMENT_COPY.backupCodesIntro}
            </p>
          </div>
          {enrollment ? (
            <div className="rounded-field border border-rose-100 bg-rose-50 px-4 py-4">
              <p className="sr-only">{ENROLLMENT_COPY.backupCodesLabel}</p>
              <ol className="grid grid-cols-2 gap-x-4 gap-y-2 text-center font-mono text-base font-medium tracking-[0.06em] text-ink select-all">
                {enrollment.backupCodes.map((backupCode) => (
                  <li key={backupCode}>{backupCode}</li>
                ))}
              </ol>
              <p className="mt-3 text-center text-sm text-muted">
                {ENROLLMENT_COPY.backupCount(enrollment.backupCodes.length)}
              </p>
            </div>
          ) : null}
          <label
            className="flex items-start gap-3 text-sm leading-6 text-ink"
            htmlFor={`${ids}-saved`}
          >
            <input
              aria-describedby={describedByError}
              aria-invalid={error ? true : undefined}
              checked={saved}
              className="mt-1 size-5 shrink-0 accent-primary"
              id={`${ids}-saved`}
              onChange={(event) => setSaved(event.target.checked)}
              ref={savedField}
              type="checkbox"
            />
            {ENROLLMENT_COPY.savedCheck}
          </label>
          <button className={primaryButton} disabled={locked} type="submit">
            {ENROLLMENT_COPY.savedCodes}
          </button>
        </form>
      ) : null}

      <div aria-live="polite" role="status">
        {status ? <p className={statusNote}>{status}</p> : null}
      </div>

      <div aria-live="assertive" id={errorId} role="alert">
        {error ? <p className={errorNote}>{error}</p> : null}
      </div>

      {sessionEnded ? (
        <div className="flex justify-center">
          <a className={quietButton} href="/admin/ingresar">
            {ENROLLMENT_COPY.signInAgain}
          </a>
        </div>
      ) : null}
    </div>
  );
}
