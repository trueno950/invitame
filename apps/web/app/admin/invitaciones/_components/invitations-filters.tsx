import Link from "next/link";

import {
  INVITATIONS_COPY,
  INVITATIONS_PATHS,
  INVITATION_STATUS_FILTER_LABELS,
} from "../../../../lib/admin/invitations/copy.ts";
import {
  hasInvitationFilters,
  type InvitationFilters,
  MAX_SLUG_FILTER_LENGTH,
} from "../../../../lib/admin/invitations/search.ts";
import { AdminSelect } from "../../_components/admin-select.tsx";
import {
  adminButton,
  adminButtonOutline,
  adminCard,
  adminHint,
  adminInput,
  adminLabel,
} from "../../_components/admin-ui.ts";

/** The `estado` options: the page's closed set, in the order the copy lists it. */
const STATUS_OPTIONS = Object.entries(INVITATION_STATUS_FILTER_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * The search of `/admin/invitaciones` (M9 T3; S1, L4): a plain GET form, so it works without JavaScript and the filters
 * live in the query, where a reload, a bookmark, and «Siguiente página» keep them. The page reads them back through its
 * own validator, so the form never sends a value it would not show.
 *
 * The cursor is deliberately not a field: a new search starts at the newest invitation, and only the next-page link
 * carries a cursor.
 */
export function InvitationFiltersForm({ filters }: { filters: InvitationFilters }) {
  return (
    <form action={INVITATIONS_PATHS.index} className={`${adminCard} px-5 py-4`} method="get">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
        <div>
          <label className={adminLabel} htmlFor="invitation-slug">
            {INVITATIONS_COPY.slugLabel}
          </label>
          <input
            autoCapitalize="off"
            autoComplete="off"
            className={adminInput}
            defaultValue={filters.slug ?? ""}
            id="invitation-slug"
            maxLength={MAX_SLUG_FILTER_LENGTH}
            name="slug"
            placeholder={INVITATIONS_COPY.slugPlaceholder}
            spellCheck={false}
            type="search"
          />
          <p className={adminHint}>{INVITATIONS_COPY.slugHint}</p>
        </div>
        <div>
          <label className={adminLabel} htmlFor="invitation-status">
            {INVITATIONS_COPY.statusLabel}
          </label>
          <AdminSelect defaultValue={filters.estado ?? ""} id="invitation-status" name="estado">
            <option value="">{INVITATIONS_COPY.allStatuses}</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </AdminSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={adminButton} type="submit">
            {INVITATIONS_COPY.search}
          </button>
          {hasInvitationFilters(filters) ? (
            <Link className={adminButtonOutline} href={INVITATIONS_PATHS.index}>
              {INVITATIONS_COPY.clearFilters}
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}
