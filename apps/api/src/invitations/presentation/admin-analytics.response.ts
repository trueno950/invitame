import { BadRequestException } from "@nestjs/common";

import type {
  AdminFunnelAnalytics,
  AdminViewsAnalytics,
} from "../application/admin-analytics.use-cases";
import { InvalidAnalyticsWindowError } from "../domain/analytics-window";

// The stable REST shapes of the administrator's analytics (M9 T11; S2, S3, S7). Both reads answer a `days` array that
// covers exactly the window the request asked for, ascending and both ends included, with zeros where nothing was
// counted, so the page can draw a table without filling gaps of its own. The views read adds the most-viewed
// invitations, at most twenty; the funnel read has the four steps of every day. Nothing personal is here: an
// invitation is named by its id and its public slug, exactly like the status view, and no view ever names a visitor.

/** One day of the views read (S7): the two links separately. */
export interface AdminViewsAnalyticsDayResponse {
  day: string;
  public: number;
  guest: number;
}

/** One row of the top-invitations list (S2). */
export interface AdminTopInvitationResponse {
  invitationId: string;
  slug: string;
  public: number;
  guest: number;
}

/** `GET /admin/analytics/views` (S2, S7). */
export interface AdminViewsAnalyticsResponse {
  days: AdminViewsAnalyticsDayResponse[];
  topInvitations: AdminTopInvitationResponse[];
}

/** One day of the funnel read (S2): the four steps, in the order the design names them. */
export interface AdminFunnelAnalyticsDayResponse {
  day: string;
  draftsCreated: number;
  checkoutsStarted: number;
  paymentsApproved: number;
  firstPublications: number;
}

/** `GET /admin/analytics/funnel` (S2). */
export interface AdminFunnelAnalyticsResponse {
  days: AdminFunnelAnalyticsDayResponse[];
}

export function toAdminViewsAnalyticsResponse(
  analytics: AdminViewsAnalytics,
): AdminViewsAnalyticsResponse {
  return {
    days: analytics.days.map((day) => ({
      day: day.day,
      public: day.public,
      guest: day.guest,
    })),
    topInvitations: analytics.topInvitations.map((invitation) => ({
      invitationId: invitation.invitationId,
      slug: invitation.slug,
      public: invitation.public,
      guest: invitation.guest,
    })),
  };
}

export function toAdminFunnelAnalyticsResponse(
  analytics: AdminFunnelAnalytics,
): AdminFunnelAnalyticsResponse {
  return {
    days: analytics.days.map((day) => ({
      day: day.day,
      draftsCreated: day.draftsCreated,
      checkoutsStarted: day.checkoutsStarted,
      paymentsApproved: day.paymentsApproved,
      firstPublications: day.firstPublications,
    })),
  };
}

/**
 * The one refusal of both reads (S2): a window this API cannot read — a day that is not a real calendar day, a
 * reversed window, or one wider than ninety days — is a malformed request, answered 400 `INVALID_ANALYTICS_WINDOW`
 * before any query. A day that is not even `YYYY-MM-DD` is refused earlier by the DTO with the validation body. Any
 * other error is rethrown unchanged.
 */
export function mapAdminAnalyticsError(error: unknown): never {
  if (error instanceof InvalidAnalyticsWindowError) {
    throw new BadRequestException({ code: "INVALID_ANALYTICS_WINDOW" });
  }
  throw error;
}
