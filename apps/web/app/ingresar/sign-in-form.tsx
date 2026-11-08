"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { SIGN_IN_COPY } from "../../lib/customer/copy.ts";
import { useInteractive } from "../../lib/customer/interactive.ts";
import {
  browserFetch,
  isCompleteCode,
  isPlausibleEmail,
  normalizeCode,
  normalizeEmail,
  requestSignInCode,
  signInFailureMessage,
  signInWithCode,
} from "../../lib/customer/sign-in.ts";
import {
  errorNote,
  fieldHint,
  fieldLabel,
  primaryButton,
  statusNote,
  textButton,
  textField,
} from "../_components/ui.ts";

type Step = "email" | "code";
type Pending = "send" | "verify" | null;

/**
 * Two steps (M2 T8c; S6, L39): the email, then the 6-digit code. Status and errors are announced
 * through live regions that stay mounted across both steps, and focus moves to the field that
 * needs attention.
 *
 * The forms send nothing by themselves (M2 T8e; S42): they declare `post`, and their buttons stay
 * disabled until the page is interactive, so the email never reaches the URL by a native submit.
 */
export function SignInForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const interactive = useInteractive();
  const locked = pending !== null || !interactive;
  const emailField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const ids = useId();
  const emailId = `${ids}-email`;
  const codeId = `${ids}-code`;
  const codeHintId = `${ids}-code-hint`;
  const errorId = `${ids}-error`;

  function fail(message: string, field: HTMLInputElement | null) {
    setPending(null);
    setError(message);
    field?.focus();
  }

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const address = normalizeEmail(email);
    if (!isPlausibleEmail(address)) {
      fail(SIGN_IN_COPY.emailInvalid, emailField.current);
      return;
    }

    setPending("send");
    setError("");
    setStatus("");
    const outcome = await requestSignInCode(browserFetch, address);

    if (!outcome.ok) {
      fail(signInFailureMessage(outcome.failure), emailField.current);
      return;
    }

    // Render the code step before moving focus into it.
    flushSync(() => {
      setPending(null);
      setEmail(address);
      setCode("");
      setStep("code");
      setStatus(SIGN_IN_COPY.codeRequested(address));
    });
    codeField.current?.focus();
  }

  async function resendCode() {
    if (pending) {
      return;
    }

    setPending("send");
    setError("");
    setStatus("");
    const outcome = await requestSignInCode(browserFetch, email);

    if (!outcome.ok) {
      fail(signInFailureMessage(outcome.failure), codeField.current);
      return;
    }

    setPending(null);
    setCode("");
    setStatus(SIGN_IN_COPY.newCodeRequested(email));
    codeField.current?.focus();
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    if (!isCompleteCode(code)) {
      fail(SIGN_IN_COPY.codeIncomplete, codeField.current);
      return;
    }

    setPending("verify");
    setError("");
    const outcome = await signInWithCode(browserFetch, email, code);

    if (!outcome.ok) {
      fail(signInFailureMessage(outcome.failure), codeField.current);
      codeField.current?.select();
      return;
    }

    // Stay pending: a full navigation loads `/cuenta` with the new session cookie.
    setStatus(SIGN_IN_COPY.signedIn);
    window.location.assign("/cuenta");
  }

  function changeEmail() {
    flushSync(() => {
      setStep("email");
      setCode("");
      setStatus("");
      setError("");
    });
    emailField.current?.focus();
  }

  const describedByError = error ? errorId : undefined;

  return (
    <div className="flex flex-col gap-6">
      {step === "code" ? (
        <h2 className="text-center font-display text-[1.75rem] font-semibold leading-tight text-ink">
          {SIGN_IN_COPY.codeHeading}
        </h2>
      ) : null}

      <div aria-live="polite" role="status">
        {status ? <p className={statusNote}>{status}</p> : null}
      </div>

      {step === "email" ? (
        <form className="flex flex-col gap-6" method="post" noValidate onSubmit={sendCode}>
          <div>
            <label className={fieldLabel} htmlFor={emailId}>
              {SIGN_IN_COPY.emailLabel}
            </label>
            <input
              aria-describedby={describedByError}
              aria-invalid={error ? true : undefined}
              autoCapitalize="none"
              autoComplete="email"
              className={textField}
              id={emailId}
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={SIGN_IN_COPY.emailPlaceholder}
              ref={emailField}
              required
              spellCheck={false}
              type="email"
              value={email}
            />
          </div>
          <button className={primaryButton} disabled={locked} type="submit">
            {pending === "send" ? SIGN_IN_COPY.sending : SIGN_IN_COPY.sendCode}
          </button>
          <noscript>
            <p className={`${fieldHint} -mt-3 text-center`}>{SIGN_IN_COPY.noScript}</p>
          </noscript>
        </form>
      ) : (
        <form className="flex flex-col gap-6" method="post" noValidate onSubmit={verifyCode}>
          <div>
            <label className={fieldLabel} htmlFor={codeId}>
              {SIGN_IN_COPY.codeLabel}
            </label>
            <input
              aria-describedby={describedByError ? `${codeHintId} ${errorId}` : codeHintId}
              aria-invalid={error ? true : undefined}
              autoComplete="one-time-code"
              className={`${textField} text-center text-2xl font-medium tracking-[0.4em] tabular-nums`}
              id={codeId}
              inputMode="numeric"
              name="otp"
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              pattern="[0-9]*"
              ref={codeField}
              required
              type="text"
              value={code}
            />
            <p className={fieldHint} id={codeHintId}>
              {SIGN_IN_COPY.codeHint}
            </p>
          </div>
          <button className={primaryButton} disabled={locked} type="submit">
            {pending === "verify" ? SIGN_IN_COPY.verifying : SIGN_IN_COPY.signIn}
          </button>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            <button
              className={textButton}
              disabled={pending !== null}
              onClick={resendCode}
              type="button"
            >
              {pending === "send" ? SIGN_IN_COPY.sending : SIGN_IN_COPY.resendCode}
            </button>
            <button
              className={textButton}
              disabled={pending !== null}
              onClick={changeEmail}
              type="button"
            >
              {SIGN_IN_COPY.changeEmail}
            </button>
          </div>
        </form>
      )}

      <div aria-live="assertive" id={errorId} role="alert">
        {error ? <p className={errorNote}>{error}</p> : null}
      </div>
    </div>
  );
}
