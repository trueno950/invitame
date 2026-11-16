import Link from "next/link";
import type { ReactNode } from "react";

import { GUEST_COPY, RSVP_COPY } from "../../../../lib/customer/copy.ts";
import type {
  GuestFormValues,
  GuestListView,
  GuestRow,
} from "../../../../lib/customer/invitation-guests.ts";
import type { GuestLinkFlash } from "../../../../lib/server/single-use-flash.ts";
import {
  fieldHint,
  fieldLabel,
  primaryButton,
  quietButton,
  statusNote,
  textButton,
  textField,
} from "../../../_components/ui.ts";

/**
 * The creator's guest list on `/cuenta/invitaciones/[id]/asistencia` (M6 G4; S1, S4): the totals, the guests with the
 * answer each one gave and their check-in state, and the three writes that change the list. Every control is a plain
 * server-rendered form that posts to a server action, so the page needs no client script at all, and every destructive
 * or irreversible action is a two-step: «Quitar» is a link to a confirmation panel, and «Generar nuevo enlace» states
 * beside its button that the previous link stops working.
 */

/** One block of a total: its number and what it counts. */
function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

/** The six totals of one guest list, in the order the page reads them. */
export function GuestTotals({ totals }: { totals: GuestListView["totals"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {totals.map((total) => (
        <Total key={total.label} label={total.label} value={total.value} />
      ))}
    </div>
  );
}

/**
 * The one-time reveal of a personal link (S4). The token arrives from the API exactly once, the server action keeps it
 * in a one-time store, and this panel is the only place it is ever shown: the page takes it out of the store as it
 * renders, so a reload, a second tab, or a later visit shows nothing instead of the link again.
 */
export function GuestLinkReveal({ flash }: { flash: GuestLinkFlash }) {
  return (
    <section
      aria-labelledby="guest-link-heading"
      className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5"
      data-guest-link={flash.invitationId}
    >
      <h2
        className="text-xs font-medium uppercase tracking-[0.18em] text-primary"
        id="guest-link-heading"
      >
        {GUEST_COPY.linkHeading(flash.guestName)}
      </h2>
      <p className={`${statusNote} mt-3`}>{GUEST_COPY.linkHint}</p>
      <div className="mt-3 flex flex-col gap-2">
        <label className={fieldLabel} htmlFor="guest-personal-link">
          {GUEST_COPY.linkLabel}
        </label>
        {/* A read-only field is one click to select, so the link is easy to copy by hand (S4: no clipboard script). */}
        <input className={textField} id="guest-personal-link" readOnly value={flash.personalUrl} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {flash.whatsAppUrl === undefined ? null : (
          <a
            className={quietButton}
            href={flash.whatsAppUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {GUEST_COPY.whatsappShare}
          </a>
        )}
      </div>
    </section>
  );
}

/** The shell of a guest form, so the add and the edit panels read the same. */
function GuestFormShell({
  heading,
  hint,
  action,
  children,
}: {
  heading: string;
  hint: string;
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{hint}</p>
      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
        {children}
      </form>
    </section>
  );
}

/** The fields of one guest: the name, its seats, and the optional phone and note (S4). */
function GuestFields({ values, prefix }: { values: GuestFormValues | undefined; prefix: string }) {
  return (
    <>
      <div>
        <label className={fieldLabel} htmlFor={`${prefix}-name`}>
          {GUEST_COPY.nameLabel}
        </label>
        <input
          className={textField}
          defaultValue={values?.name ?? ""}
          id={`${prefix}-name`}
          maxLength={80}
          name="name"
          required
          type="text"
        />
        <p className={fieldHint}>{GUEST_COPY.nameHint}</p>
      </div>
      <div>
        <label className={fieldLabel} htmlFor={`${prefix}-seats`}>
          {GUEST_COPY.seatsLabel}
        </label>
        <input
          className={textField}
          defaultValue={values === undefined ? 1 : values.seats}
          id={`${prefix}-seats`}
          max={10}
          min={1}
          name="seats"
          required
          step={1}
          type="number"
        />
        <p className={fieldHint}>{GUEST_COPY.seatsHint}</p>
      </div>
      <div>
        <label className={fieldLabel} htmlFor={`${prefix}-phone`}>
          {GUEST_COPY.phoneLabel}
        </label>
        <input
          autoComplete="tel"
          className={textField}
          defaultValue={values?.phone ?? ""}
          id={`${prefix}-phone`}
          inputMode="tel"
          maxLength={32}
          name="phone"
          type="tel"
        />
        <p className={fieldHint}>{GUEST_COPY.phoneHint}</p>
      </div>
      <div>
        <label className={fieldLabel} htmlFor={`${prefix}-note`}>
          {GUEST_COPY.noteLabel}
        </label>
        <input
          className={textField}
          defaultValue={values?.note ?? ""}
          id={`${prefix}-note`}
          maxLength={200}
          name="note"
          type="text"
        />
        <p className={fieldHint}>{GUEST_COPY.noteHint}</p>
      </div>
    </>
  );
}

/** The form that adds one guest; saving it answers the personal link exactly once (S4). */
export function AddGuestForm({
  action,
  invitationId,
  slug,
  editable,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  slug: string;
  editable: boolean;
}) {
  if (!editable) {
    return null;
  }

  return (
    <GuestFormShell action={action} heading={GUEST_COPY.addHeading} hint={GUEST_COPY.addHint}>
      <input name="id" type="hidden" value={invitationId} />
      <input name="slug" type="hidden" value={slug} />
      <GuestFields prefix="guest-add" values={undefined} />
      <div className="sm:col-span-2 flex justify-end">
        <button className={`${primaryButton} sm:w-auto sm:px-8`} type="submit">
          {GUEST_COPY.add}
        </button>
      </div>
    </GuestFormShell>
  );
}

/** The form that replaces one guest's fields; the token and the check-in state stay (S4). */
export function EditGuestForm({
  action,
  invitationId,
  values,
  backHref,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  values: GuestFormValues;
  backHref: string;
}) {
  return (
    <GuestFormShell
      action={action}
      heading={GUEST_COPY.editHeading(values.name)}
      hint={GUEST_COPY.seatsHint}
    >
      <input name="id" type="hidden" value={invitationId} />
      <input name="guestId" type="hidden" value={values.id} />
      <GuestFields prefix={`guest-edit-${values.id}`} values={values} />
      <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-3">
        <Link className={textButton} href={backHref}>
          {GUEST_COPY.cancel}
        </Link>
        <button className={`${primaryButton} sm:w-auto sm:px-8`} type="submit">
          {GUEST_COPY.save}
        </button>
      </div>
    </GuestFormShell>
  );
}

/**
 * The confirmation of one removal (S4): removing a guest also deletes the answer they gave, so the page asks once,
 * naming the guest, instead of removing on the first click.
 */
export function RemoveGuestPanel({
  action,
  invitationId,
  guest,
  backHref,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  guest: { readonly id: string; readonly name: string };
  backHref: string;
}) {
  return (
    <section className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
        {GUEST_COPY.removeHeading}
      </h2>
      <p className={`${statusNote} mt-3`}>{GUEST_COPY.removeQuestion(guest.name)}</p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
        <input name="id" type="hidden" value={invitationId} />
        <input name="guestId" type="hidden" value={guest.id} />
        <button className={quietButton} type="submit">
          {GUEST_COPY.remove}
        </button>
        <Link className={textButton} href={backHref}>
          {GUEST_COPY.cancel}
        </Link>
      </form>
    </section>
  );
}

/** The per-row forms of one guest: edit and remove as links, and the rotation as a one-click form (S4). */
function RowActions({
  action,
  invitationId,
  slug,
  row,
  editable,
  backHref,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  slug: string;
  row: GuestRow;
  editable: boolean;
  backHref: string;
}) {
  if (!editable) {
    return null;
  }

  return (
    <td className="px-4 py-3 align-top">
      <div className="flex flex-col items-start gap-2">
        <Link className={textButton} href={`${backHref}?editar=${row.id}`}>
          {GUEST_COPY.edit}
        </Link>
        <Link className={textButton} href={`${backHref}?quitar=${row.id}`}>
          {GUEST_COPY.removeLink}
        </Link>
        <form action={action} className="flex flex-col items-start gap-1">
          <input name="id" type="hidden" value={invitationId} />
          <input name="slug" type="hidden" value={slug} />
          <input name="guestId" type="hidden" value={row.id} />
          <button className={textButton} type="submit">
            {GUEST_COPY.rotate}
          </button>
          {/* The warning sits with the button, so the consequence is read before it is clicked. */}
          <span className="text-xs leading-5 text-muted">{GUEST_COPY.rotateWarning}</span>
        </form>
      </div>
    </td>
  );
}

/** The one table of guests; a field the creator left empty shows a dash instead of a blank cell. */
export function GuestTable({
  action,
  invitationId,
  slug,
  view,
  backHref,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  slug: string;
  view: GuestListView;
  backHref: string;
}) {
  if (view.rows.length === 0) {
    return <p className="text-sm leading-6 text-muted">{GUEST_COPY.emptyNote}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-panel bg-surface/80 ring-1 ring-gold/45">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead>
          <tr className="border-b border-rose-100">
            {[
              GUEST_COPY.columnGuest,
              GUEST_COPY.columnSeats,
              GUEST_COPY.columnAnswer,
              GUEST_COPY.columnParty,
              GUEST_COPY.columnCheckIn,
              GUEST_COPY.columnActions,
            ].map((heading) => (
              <th
                className="px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] text-primary"
                key={heading}
                scope="col"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr className="border-b border-rose-100 align-top last:border-b-0" key={row.id}>
              <th className="px-4 py-3 font-medium text-ink" scope="row">
                {row.name}
                {row.updated ? (
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {GUEST_COPY.updatedNote}
                  </span>
                ) : null}
                {row.phone === "—" ? null : (
                  <span className="mt-1 block text-xs font-normal text-muted">{row.phone}</span>
                )}
                {row.note === "—" ? null : (
                  <span className="mt-1 block text-xs font-normal break-words text-muted">
                    {row.note}
                  </span>
                )}
              </th>
              <td className="px-4 py-3 text-ink">{row.seats}</td>
              <td className="px-4 py-3 text-ink">{row.answerLabel}</td>
              <td className="px-4 py-3 text-ink">{row.partySize}</td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">{row.checkIn}</td>
              <RowActions
                action={action}
                backHref={backHref}
                editable={view.editable}
                invitationId={invitationId}
                row={row}
                slug={slug}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The settings the guest list runs with, and the CSV of the same rows (S4). */
export function GuestListFooter({
  csvHref,
  deadline,
  partyLimit,
}: {
  csvHref: string;
  deadline: string;
  partyLimit: number;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className={`${statusNote} sm:flex-1`}>
        {RSVP_COPY.deadlineLabel}: {deadline} · {RSVP_COPY.partyLimitLabel}: {partyLimit}
      </p>
      <a className={quietButton} download href={csvHref}>
        {GUEST_COPY.download}
      </a>
    </div>
  );
}
