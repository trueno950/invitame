"use client";

import Link from "next/link";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { contentCards } from "../../../../../lib/customer/content-cards.ts";
import {
  EDITOR_COPY,
  FEATURE_COPY,
  INVITATION_COPY,
  PAYMENT_COPY,
  RSVP_COPY,
} from "../../../../../lib/customer/copy.ts";
import {
  editorProgress,
  type FieldFocusRequest,
  fieldFocus,
  missingFieldHref,
  nextStepLabel,
  progressMeta,
  stepStateLabel,
} from "../../../../../lib/customer/editor-progress.ts";
import {
  type AttendanceTab,
  DEFAULT_EDITOR_SECTION,
  EDITOR_SECTION_PARAM,
  EDITOR_SECTIONS,
  type EditorSection,
  editorSectionTarget,
  missingRequiredNames,
  sectionFromSearch,
  sectionTabLabel,
} from "../../../../../lib/customer/editor-sections.ts";
import type { FeatureSettingsView } from "../../../../../lib/customer/invitation-features.ts";
import type { RsvpSettingsView } from "../../../../../lib/customer/invitation-rsvp.ts";
import type { ContentField, ContentSection } from "../../../../../lib/customer/invitations.ts";
import {
  OMITTED_SECTIONS_PROPERTY,
  type OmittableSections,
  omittedSectionKeys,
  shownFieldsOf,
  withSectionShown,
} from "../../../../../lib/customer/omittable-sections.ts";
import type {
  PlaceSearchResult,
  PlaceWriteResult,
} from "../../../../../lib/customer/place-search.ts";
import type {
  PlacePoint,
  StoredPlaces,
} from "../../../../../lib/invitation-features/place-point.ts";
import type { InvitationStatus } from "../../../../../lib/server/invitations-api.ts";
import {
  fieldHint,
  focusRing,
  primaryButton,
  quietButton,
  statusNote,
  textButton,
} from "../../../../_components/ui.ts";
import {
  type AutosaveBridge,
  AutosaveBridgeProvider,
  GuardedForm,
  GuardedLink,
} from "../../_components/autosave/navigation-guard.tsx";
import { SaveStatus } from "../../_components/autosave/save-status.tsx";
import { useAutosave } from "../../_components/autosave/use-autosave.ts";
import { StatusBadge } from "../../_components/status-badge.tsx";
import { savePlaceAction, searchPlacesAction } from "../../place-actions.ts";
import { ContentCards } from "./content-cards.tsx";
import {
  FeatureFields,
  type FeatureValues,
  type FieldIssues,
  RsvpFields,
  type RsvpValues,
} from "./editor-fields.tsx";
import { EditorTabList, type EditorTabView } from "./editor-tabs.tsx";
import { PreviewDialog, PreviewFrame } from "./preview-pane.tsx";
import { SharePanel } from "./share-panel.tsx";

/**
 * The invitation editor (T2c; S1-S4), following `design/editor-redesign/03-pestanas-y-vista-previa.html`: five tabs, the
 * fields in the middle, and the invitation rendered live at phone width beside them.
 *
 * What the artboard asks for and this island answers:
 *
 * - the tabs are client state and never a navigation (S2), mirrored into `?seccion=` with `history.replaceState` and
 *   read again from the URL on the first render and on a back navigation;
 * - every field saves on its own through the T2a queue, and one sticky status line says whether the work is on its
 *   way, stored, or failed and can be retried;
 * - each tab label says what it still owes («Contenido · 4 de 12»), computed from the values in the browser, so the
 *   count falls while the owner types, and a section the owner switched off stops owing its fields (T4; S8.3);
 * - the counters of the whole island (the tab label, «Primeros pasos», the missing-field action, and the «Faltan» list
 *   of «Publicar») read the fields the invitation still shows, from the pinned schema's own `x-omittable` groups, so
 *   one decision drives all of them;
 * - a card's switch saves through the same autosave queue as a field, so the status line, the leave guard, and the
 *   preview reload treat hiding a section exactly as they treat typing one;
 * - a compact «Primeros pasos» card above the editor names the three steps — the data, the photos, the publication —
 *   with the progress of the same count, and the required fields the draft still leaves empty are links that open the
 *   card of that field and focus it (T1; S2.1, S2.4);
 * - the preview (T2b) is a phone-width frame beside the fields on a wide screen, and a full-screen dialog behind the
 *   phone's fixed «Ver vista previa»; it is reloaded only after a save the API accepted, so it never shows data the API
 *   has not stored; the phone's bar also offers the step that comes next, so the small screen is not only a preview
 *   (T1; S2.5);
 * - every action that still navigates goes through `GuardedForm` or `GuardedLink`, which flush the queue first and stop
 *   the navigation when the save failed, so nothing typed is discarded (S2).
 *
 * The archived draft and the draft whose pinned version left the catalog never reach this island: the page renders
 * their summaries instead, exactly as before.
 */

const PANEL_ID = "editor-panel";
const STATUS_ID = "editor-save-status";

const miniLabel = "text-xs font-medium uppercase tracking-[0.18em] text-primary";

const saveNowButton = `inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-rose-100 disabled:opacity-70 ${focusRing}`;

/** The phone bar's next step: the same tokens as the form's main action, at half the width of a phone. */
const phoneNext = `inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary bg-linear-to-b from-primary from-55% to-primary-deep px-3 text-sm font-medium tracking-[0.02em] text-on-primary shadow-button ring-1 ring-primary-deep transition-[background-color] duration-150 ease-out-soft hover:from-primary-deep active:scale-[0.97] ${focusRing}`;

/**
 * What the draft still owes before it can be published (T1; S2.4), kept light: one count, one action that goes to the
 * next empty required field, and the full list folded away under «Ver cuáles» for whoever wants it. Every name is a real
 * link, so it also works from a copied address or with the script off; a plain click opens the field in place, because
 * the tab it opens is client state and nothing typed has to be sent for it.
 */
function MissingFieldLinks({
  detailPath,
  fields,
  names,
  onOpen,
}: {
  readonly detailPath: string;
  readonly fields: readonly ContentField[];
  readonly names: readonly string[];
  readonly onOpen: (name: string) => void;
}) {
  const [first] = names;

  if (first === undefined) {
    return null;
  }

  const openInPlace = (name: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onOpen(name);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-sm font-medium text-ink">
          {EDITOR_COPY.missingFields.heading(names.length)}
        </p>
        <Link
          className={quietButton}
          href={missingFieldHref(detailPath, first)}
          onClick={openInPlace(first)}
        >
          {EDITOR_COPY.missingFields.next}
        </Link>
      </div>
      <details className="group text-sm">
        <summary className={`w-fit cursor-pointer text-muted ${focusRing}`}>
          {EDITOR_COPY.missingFields.showAll}
        </summary>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
          {names.map((name) => (
            <li key={name}>
              <Link
                className={textButton}
                href={missingFieldHref(detailPath, name)}
                onClick={openInPlace(name)}
              >
                {fields.find((field) => field.name === name)?.label ?? name}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * The «Primeros pasos» card (T1; S2.1): the three steps of the way to a published invitation with the progress of the
 * same count the «Contenido» tab states, plus the fields that still stop the publication, each one a link to its input.
 * The bar carries the number in text and in width, and every step says whether it is done, current, or ahead in words.
 */
function FirstStepsCard({
  detailPath,
  fields,
  missing,
  onOpen,
  onSelect,
  progress,
}: {
  readonly detailPath: string;
  readonly fields: readonly ContentField[];
  readonly missing: readonly string[];
  readonly onOpen: (name: string) => void;
  readonly onSelect: (section: EditorSection) => void;
  readonly progress: ReturnType<typeof editorProgress>;
}) {
  return (
    <section
      aria-labelledby="editor-first-steps-heading"
      className="rounded-panel bg-surface/90 p-4 ring-[1.5px] ring-rose-100 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={miniLabel} id="editor-first-steps-heading">
          {EDITOR_COPY.firstSteps.heading}
        </h2>
        <p className="text-xs font-semibold text-ink">{progress.label}</p>
      </div>

      <div
        aria-valuemax={progress.total}
        aria-valuemin={0}
        aria-valuenow={progress.done}
        aria-valuetext={progress.label}
        className="mt-3 h-2 overflow-hidden rounded-full bg-rose-50 ring-1 ring-rose-100"
        role="progressbar"
      >
        <div
          aria-hidden="true"
          className="h-full rounded-full bg-primary"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-3 sm:gap-3">
        {progress.steps.map((step, index) => (
          <li key={step.key}>
            <Link
              aria-current={step.state === "current" ? "step" : undefined}
              className={`flex min-h-12 items-center gap-2.5 rounded-xl px-3 py-2 text-sm ring-1 transition-colors ${
                step.state === "current"
                  ? "bg-rose-50 font-semibold text-primary ring-primary/40"
                  : step.state === "done"
                    ? "bg-surface text-ink ring-rose-100 hover:bg-rose-50"
                    : "bg-surface text-muted ring-rose-100 hover:bg-rose-50"
              } ${focusRing}`}
              href={editorSectionTarget(detailPath, step.section)}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                onSelect(step.section);
              }}
            >
              <span
                aria-hidden="true"
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  step.state === "done"
                    ? "bg-primary text-on-primary"
                    : step.state === "current"
                      ? "bg-surface text-primary ring-2 ring-primary"
                      : "bg-rose-50 text-muted ring-[1.5px] ring-field-border"
                }`}
              >
                {step.state === "done" ? "✓" : index + 1}
              </span>
              <span className="flex flex-col leading-tight">
                {step.title}
                <span className="text-xs font-normal text-muted">{stepStateLabel(step.state)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {missing.length === 0 ? null : (
        <div className="mt-4 border-t border-rose-100 pt-4">
          <MissingFieldLinks
            detailPath={detailPath}
            fields={fields}
            names={missing}
            onOpen={onOpen}
          />
        </div>
      )}
    </section>
  );
}

/** One tab's panel: its heading, an optional hint, and the block of fields it holds. */
function Panel({
  heading,
  hint,
  children,
}: {
  heading: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">{heading}</h2>
        {hint === undefined ? null : <p className="mt-1.5 text-sm leading-6 text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** The messages of a failed save, by the field name each one named. */
function issuesOf(state: ReturnType<typeof useAutosave>["state"]): FieldIssues | undefined {
  if (state.kind !== "error") {
    return undefined;
  }

  return Object.fromEntries(
    (state.failure.fieldIssues ?? []).map((issue) => [issue.field, issue.message]),
  );
}

export interface EditorShellProps {
  readonly invitationId: string;
  /** The tab the page read from its query, which is the tab the editor opens. */
  readonly initialSection: EditorSection;
  readonly sections: readonly ContentSection[];
  /**
   * The omittable sections the pinned version declares (T4; S8.1): the switch of a card, the refusal that keeps one
   * place shown, and the fields that stop counting while their section is off. A version without the extension
   * declares none, and the tab then behaves exactly as it did.
   */
  readonly omittable: OmittableSections;
  readonly content: Record<string, unknown>;
  /** Every stored point of the invitation, which the address fields read to say whether a location is confirmed. */
  readonly places: StoredPlaces;
  readonly featureView: FeatureSettingsView;
  /** The attendance settings of a package that grants RSVP; undefined for every other package. */
  readonly rsvpView: RsvpSettingsView | undefined;
  /** What the attendance tab offers this package: its settings, the guest list, or neither. */
  readonly attendance: AttendanceTab;
  /** The guest list page of a package that grants it instead, for the note of a package with neither. */
  readonly guestListHref: string | undefined;
  /** The owner's preview route, framed at phone width (T2b). */
  readonly previewSrc: string;
  readonly status: InvitationStatus;
  readonly statusLabel: string;
  readonly publicHref: string | null;
  readonly slug: string;
  /** Whether publishing still waits for a payment, which the API's own gate decides. */
  readonly paymentPending: boolean;
  /**
   * What the publish block says about the price (T3; S3): the page keeps «Publicar no tiene costo.» for a free
   * package only, so the shell never decides the promise by itself.
   */
  readonly publishHint: string;
  /** The count of the tabs the page already knows, such as «4 de 12» or «máx. 4». */
  readonly tabMeta: Partial<Record<EditorSection, string>>;
  /** The path of this editor, which the step links and the missing-field links are built from. */
  readonly detailPath: string;
  /** The field a missing-field link named in the URL, which the «Contenido» tab opens and focuses (S2.4). */
  readonly initialField: string | undefined;
  /** The stored photos, the main photo counted with the gallery, which the photo step reads (S2.1). */
  readonly photoCount: number;
  /** The absolute address of a published invitation, built from the page's own request origin (S2.2). */
  readonly publicUrl: string;
  /** The server-rendered blocks: the photo upload, the gallery, and the payment panel. */
  readonly mainPhoto: ReactNode;
  readonly gallery: ReactNode;
  readonly payment: ReactNode;
  /** Shown in «Contenido» instead of the fields when the pinned version left the catalog (the rest stays editable). */
  readonly readOnlyContent?: ReactNode;
  readonly actions: {
    readonly publish: (formData: FormData) => Promise<void>;
    readonly unpublish: (formData: FormData) => Promise<void>;
    readonly archive: (formData: FormData) => Promise<void>;
  };
}

export function EditorShell({
  readOnlyContent,
  invitationId,
  initialSection,
  sections,
  omittable,
  content,
  places: storedPlaces,
  featureView,
  rsvpView,
  attendance,
  guestListHref,
  previewSrc,
  status,
  statusLabel,
  publicHref,
  slug,
  paymentPending,
  publishHint,
  tabMeta,
  detailPath,
  initialField,
  photoCount,
  publicUrl,
  mainPhoto,
  gallery,
  payment,
  actions,
}: EditorShellProps) {
  const [section, setSection] = useState<EditorSection>(initialSection ?? DEFAULT_EDITOR_SECTION);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...content }));
  const [places, setPlaces] = useState<StoredPlaces>(() => ({ ...storedPlaces }));
  const [features, setFeatures] = useState<FeatureValues>(() => ({
    timeZone: featureView.timeZone,
    whatsappPhone: featureView.whatsappPhone,
    playlistUrl: featureView.playlistUrl,
  }));
  const [rsvp, setRsvp] = useState<RsvpValues>(() => ({
    deadline: rsvpView?.deadlineValue ?? "",
    partyLimit: rsvpView?.partyLimit ?? 1,
  }));
  const statusLine = useRef<HTMLDivElement>(null);
  // The field a missing-field link names, with the count that makes asking for the same field twice a new request (S2.4).
  const [focus, setFocus] = useState<FieldFocusRequest | undefined>(() =>
    initialField === undefined ? undefined : fieldFocus(initialField),
  );

  // A navigation to `?campo=<field>` (a shared address, or a link opened in another tab) is a new request too.
  useEffect(() => {
    if (initialField === undefined) {
      return;
    }
    setFocus((current) =>
      current?.field === initialField ? current : fieldFocus(initialField, current),
    );
  }, [initialField]);

  const autosave = useAutosave({
    invitationId,
    // The preview is reloaded only by a save the API accepted: its frame then reads the stored draft again.
    onSaved: () => setPreviewKey((key) => key + 1),
  });

  // The tab is mirrored into the URL so a reload, a shared link, and a server action's redirect all come back to it.
  // It is never a navigation: `replaceState` leaves the history and the server render untouched (S2).
  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.get(EDITOR_SECTION_PARAM) === section) {
      return;
    }

    url.searchParams.set(EDITOR_SECTION_PARAM, section);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [section]);

  // A back navigation restores the URL the browser had; the tab follows it instead of silently disagreeing with it.
  useEffect(() => {
    const onPopState = () => setSection(sectionFromSearch(window.location.search));

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const focusStatus = useCallback(() => {
    statusLine.current?.focus();
  }, []);

  const bridge = useMemo<AutosaveBridge>(
    () => ({
      state: autosave.state,
      unsaved: autosave.unsaved,
      flush: autosave.flush,
      focusStatus,
    }),
    [autosave.state, autosave.unsaved, autosave.flush, focusStatus],
  );

  const fields = useMemo(() => sections.flatMap((group) => group.fields), [sections]);
  /**
   * The fields the invitation still shows: the required fields of an omitted section stop counting, so «N de M listos»,
   * the first-steps card, the missing-field action, and the «Faltan» list all read the same count (T4; S8.3).
   */
  const shownFields = useMemo(
    () => shownFieldsOf(fields, omittable, omittedSectionKeys(values)),
    [fields, omittable, values],
  );
  const missing = missingRequiredNames(shownFields, values);
  // The three first steps and the progress above them, counted by `missingRequiredNames` itself, so «4 de 12» and the
  // «Contenido» tab never disagree (T1; S2.1).
  const progress = editorProgress({
    required: shownFields.filter((field) => field.required).length,
    missing: missing.length,
    photoCount,
    published: status === "PUBLISHED",
  });
  const next = progress.next;
  // A missing-field link opens the «Contenido» tab with the card of that field open and the field focused (S2.4). The
  // queue is flushed first, so the card never opens on a field whose value is still on its way.
  const openField = (name: string) => {
    void autosave.flush();
    setSection("contenido");
    setFocus((current) => fieldFocus(name, current));
  };
  const issues = issuesOf(autosave.state);
  // The cards of «Contenido» are recomputed from the values the browser holds, so a closed card's summary, its state,
  // and the switch of its section follow every keystroke (T2; T4).
  const cards = useMemo(
    () => contentCards(sections, values, omittable),
    [sections, values, omittable],
  );

  const tabs: readonly EditorTabView[] = EDITOR_SECTIONS.map((candidate) => {
    const meta =
      candidate === "contenido"
        ? progressMeta(progress.done, progress.total)
        : (tabMeta[candidate] ?? "");

    return { section: candidate, label: sectionTabLabel(candidate, meta), meta };
  });

  const changeContent = (name: string, next: unknown) => {
    setValues((current) => ({ ...current, [name]: next }));
    autosave.changeContent({ [name]: next });
  };

  /**
   * The switch of a card (T4; S3, S8.2): the stored list of omitted section keys travels through the same content
   * autosave every field uses, so the status line says whether it is on its way, and the values already typed in the
   * section stay stored — a key in this list never deletes content.
   */
  const showSection = (key: string, shown: boolean) => {
    changeContent(
      OMITTED_SECTIONS_PROPERTY,
      withSectionShown(omittedSectionKeys(values), key, shown),
    );
    // A switch is one deliberate action, not a keystroke: it is sent at once instead of waiting for the debounce.
    void autosave.flush();
  };

  const changeFeatures = (next: Partial<FeatureValues>) => {
    setFeatures((current) => ({ ...current, ...next }));
    autosave.changeFeatures(next);
  };

  // The place search of the address fields (S1, S2): the browser asks a server action, never the API, and a stored
  // point answers the invitation's whole map so every address field's note is read back from one place.
  const searchPlaces = useCallback(
    (query: string): Promise<PlaceSearchResult> => searchPlacesAction(invitationId, query),
    [invitationId],
  );
  const savePlace = useCallback(
    async (field: string, point: PlacePoint): Promise<PlaceWriteResult> => {
      const written = await savePlaceAction(invitationId, field, point);

      if (written.ok) {
        setPlaces(written.places);
      }
      return written;
    },
    [invitationId],
  );
  const place = useMemo(
    () => ({ places, onSearch: searchPlaces, onSavePlace: savePlace }),
    [places, searchPlaces, savePlace],
  );

  const changeRsvp = (next: { deadline?: string | null; partyLimit?: number }) => {
    setRsvp((current) => ({
      deadline: next.deadline === undefined ? current.deadline : (next.deadline ?? ""),
      partyLimit: next.partyLimit === undefined ? current.partyLimit : next.partyLimit,
    }));
    autosave.changeRsvp(next);
  };

  const panel = (() => {
    switch (section) {
      case "fotos":
        return (
          <Panel heading={EDITOR_COPY.tabs.fotos} hint={EDITOR_COPY.photosHint}>
            {mainPhoto}
            {gallery}
          </Panel>
        );
      case "funciones":
        return (
          <Panel heading={FEATURE_COPY.sectionTitle} hint={FEATURE_COPY.sectionHint}>
            <FeatureFields
              issues={issues}
              onChange={changeFeatures}
              onFlush={() => void autosave.flush()}
              values={features}
              view={featureView}
            />
          </Panel>
        );
      case "asistencia":
        return (
          <Panel heading={RSVP_COPY.sectionTitle} hint={RSVP_COPY.sectionHint}>
            {rsvpView === undefined ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm leading-6 text-muted">
                  {attendance === "guest-list"
                    ? EDITOR_COPY.attendanceGuestListNote
                    : EDITOR_COPY.attendanceNoRsvp}
                </p>
                {attendance === "guest-list" && guestListHref !== undefined ? (
                  <p>
                    <GuardedLink className={textButton} href={guestListHref}>
                      {EDITOR_COPY.attendanceGuestListOpen}
                    </GuardedLink>
                  </p>
                ) : null}
              </div>
            ) : (
              <RsvpFields
                issues={issues}
                onChange={changeRsvp}
                onFlush={() => void autosave.flush()}
                values={rsvp}
                view={rsvpView}
              />
            )}
          </Panel>
        );
      case "publicar":
        return (
          <Panel heading={INVITATION_COPY.publishHeading}>
            <div className="rounded-field bg-rose-50/70 p-4 ring-1 ring-rose-100">
              <p className={miniLabel}>{INVITATION_COPY.statusLabel}</p>
              <p className="mt-1.5">
                <StatusBadge label={statusLabel} />
              </p>
              {publicHref === null ? (
                <>
                  <p className={`${miniLabel} mt-4`}>{INVITATION_COPY.slugLabel}</p>
                  <p className="mt-1.5 font-medium break-all text-ink">{slug}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{INVITATION_COPY.slugHint}</p>
                </>
              ) : null}
              {missing.length === 0 ? null : (
                <div className="mt-4">
                  <MissingFieldLinks
                    detailPath={detailPath}
                    fields={fields}
                    names={missing}
                    onOpen={openField}
                  />
                </div>
              )}
            </div>

            {status === "PUBLISHED" ? (
              <>
                <p className={statusNote}>{INVITATION_COPY.publishedNote}</p>
                {/* The success panel: the three large actions of a published invitation (T1; S2.2). */}
                <SharePanel publicUrl={publicUrl} />
              </>
            ) : null}

            {payment}

            {status === "DRAFT" ? (
              <GuardedForm
                action={actions.publish}
                className="flex flex-col gap-3 rounded-field bg-surface p-4 ring-1 ring-gold/45"
                section="publicar"
              >
                <input name="id" type="hidden" value={invitationId} />
                <p className={miniLabel}>{INVITATION_COPY.publishHeading}</p>
                <p className="text-sm leading-6 text-muted">{publishHint}</p>
                {paymentPending ? (
                  <p className={fieldHint}>{PAYMENT_COPY.publishBlockedHint}</p>
                ) : null}
                <button className={primaryButton} disabled={paymentPending} type="submit">
                  {INVITATION_COPY.publish}
                </button>
              </GuardedForm>
            ) : null}

            {status === "PUBLISHED" ? (
              <GuardedForm
                action={actions.unpublish}
                className="flex flex-col gap-3 rounded-field bg-surface p-4 ring-1 ring-gold/45"
                section="publicar"
              >
                <input name="id" type="hidden" value={invitationId} />
                <p className={miniLabel}>{INVITATION_COPY.unpublishHeading}</p>
                <p className="text-sm leading-6 text-muted">{INVITATION_COPY.unpublishHint}</p>
                <div>
                  <button className={quietButton} type="submit">
                    {INVITATION_COPY.unpublish}
                  </button>
                </div>
              </GuardedForm>
            ) : null}

            <GuardedForm
              action={actions.archive}
              className="flex flex-col gap-3 rounded-field bg-surface p-4 ring-1 ring-gold/45"
              section="publicar"
            >
              <input name="id" type="hidden" value={invitationId} />
              <p className={miniLabel}>{INVITATION_COPY.archiveHeading}</p>
              <p className="text-sm leading-6 text-muted">{INVITATION_COPY.archiveHint}</p>
              <div>
                <button className={quietButton} type="submit">
                  {INVITATION_COPY.archive}
                </button>
              </div>
            </GuardedForm>
          </Panel>
        );
      default:
        return (
          <Panel heading={EDITOR_COPY.tabs.contenido} hint={EDITOR_COPY.contentHint}>
            {readOnlyContent ?? (
              <ContentCards
                cards={cards}
                focus={focus}
                idPrefix="content"
                issues={issues}
                omittable={omittable}
                onChange={changeContent}
                onFlush={() => void autosave.flush()}
                onShowSection={showSection}
                place={place}
                values={values}
              />
            )}
          </Panel>
        );
    }
  })();

  return (
    <AutosaveBridgeProvider bridge={bridge}>
      {/*
        `data-editor-shell` is the hook `app/globals.css` uses to let the phone's save-status strip stick: the customer
        frame is `overflow-hidden`, which is a scroll container that never scrolls, and this page's frame is clipped
        instead (T2; S2).
      */}
      <div
        className="grid gap-4 pb-28 lg:grid-cols-[9.5rem_minmax(0,1fr)_20rem] lg:items-start lg:gap-5 lg:pb-0 xl:grid-cols-[11rem_minmax(0,1fr)_24.5rem] xl:gap-6 2xl:grid-cols-[12rem_minmax(0,1fr)_28rem] 2xl:gap-8"
        data-editor-shell=""
      >
        <div className="lg:col-span-3">
          <FirstStepsCard
            detailPath={detailPath}
            fields={fields}
            missing={missing}
            onOpen={openField}
            onSelect={setSection}
            progress={progress}
          />
        </div>

        <div className="lg:hidden">
          <EditorTabList
            active={section}
            className="-mx-1 px-1"
            idPrefix="editor-row"
            layout="row"
            onSelect={setSection}
            panelId={PANEL_ID}
            tabs={tabs}
          />
        </div>

        <div className="hidden lg:flex lg:flex-col lg:gap-3">
          <EditorTabList
            active={section}
            className="lg:sticky lg:top-4"
            idPrefix="editor-rail"
            layout="rail"
            onSelect={setSection}
            panelId={PANEL_ID}
            tabs={tabs}
          />
          <p className="rounded-[0.875rem] bg-surface/75 px-3 py-3 text-xs leading-5 text-muted ring-1 ring-rose-100">
            {EDITOR_COPY.railNote}
          </p>
        </div>

        <div className="min-w-0">
          {/*
            The form column is its own scroll area from `lg` up, so the status line below can be sticky inside it: the
            page shell that wraps every customer page is `overflow-hidden`, which would make `position: sticky` inert
            against the document. On a phone the column keeps the page's own scrolling, and the frame of this page is
            clipped instead of hidden (`app/globals.css`, keyed on `data-editor-shell`), so the same strip sticks to the
            top of the screen while the fields scroll under it (T2; S2).
          */}
          <div className="rounded-panel bg-surface/90 ring-1 ring-gold/45 lg:max-h-[calc(100dvh-19rem)] lg:overflow-y-auto lg:overscroll-contain">
            {/*
              The one status line of the editor: sticky, so it stays readable while the owner scrolls the fields, and
              focusable, so a submit that could not save can point at it.
            */}
            <div
              className="sticky top-0 z-20 rounded-t-panel bg-surface px-3 pt-3"
              id={STATUS_ID}
              ref={statusLine}
              tabIndex={-1}
            >
              <div className="flex flex-wrap items-start gap-2">
                <SaveStatus
                  className="min-w-0 flex-1"
                  onRetry={autosave.retry}
                  state={autosave.state}
                />
                {/* Only while something is still waiting to be stored, so a settled editor shows no bar at all. */}
                {!autosave.unsaved ? null : (
                  <button
                    className={saveNowButton}
                    disabled={!autosave.unsaved}
                    onClick={() => void autosave.flush()}
                    type="button"
                  >
                    {EDITOR_COPY.saveNow}
                  </button>
                )}
              </div>
            </div>

            <div
              aria-label={EDITOR_COPY.tabs[section]}
              className="px-4 pb-7 pt-4 sm:px-5"
              id={PANEL_ID}
              role="tabpanel"
            >
              {panel}
            </div>
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-4 flex flex-col gap-2">
            <p className="text-[0.65rem] font-semibold tracking-[0.12em] uppercase text-primary">
              {EDITOR_COPY.previewCaption}
            </p>
            <div className="rounded-panel bg-surface p-1.5 shadow-soft ring-1 ring-rose-100">
              <PreviewFrame
                className="mx-auto h-[min(76vh,44rem)] max-w-[390px] rounded-[1.1rem]"
                reloadKey={previewKey}
                src={previewSrc}
              />
            </div>
            <p className="text-xs leading-5 text-muted">{EDITOR_COPY.previewNote}</p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-1.5 bg-surface/95 px-4 py-3 ring-1 ring-rose-100 backdrop-blur-sm lg:hidden">
        <div className={next === undefined ? undefined : "grid grid-cols-2 gap-2"}>
          <button
            className={`${quietButton} w-full`}
            onClick={() => setPreviewOpen(true)}
            type="button"
          >
            {EDITOR_COPY.previewOpen}
          </button>
          {/* The step that comes next, so the phone is not only a preview (T1; S2.5). */}
          {next === undefined ? null : (
            <button className={phoneNext} onClick={() => setSection(next.section)} type="button">
              {nextStepLabel(next.section)}
            </button>
          )}
        </div>
        <p className="text-center text-xs leading-5 text-muted">{EDITOR_COPY.previewPhoneNote}</p>
      </div>

      <PreviewDialog
        onClose={() => setPreviewOpen(false)}
        open={previewOpen}
        reloadKey={previewKey}
        src={previewSrc}
      />
    </AutosaveBridgeProvider>
  );
}
