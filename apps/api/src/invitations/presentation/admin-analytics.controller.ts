import { Controller, Get, Inject, Query } from "@nestjs/common";

import { AdminOnly } from "../../auth/access-control/access-control";
import {
  GetAdminFunnelAnalyticsUseCase,
  GetAdminViewsAnalyticsUseCase,
} from "../application/admin-analytics.use-cases";
// The global ValidationPipe reads this class from emitted metadata, so it is a value import.
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { AdminAnalyticsWindowDto } from "./dto/admin-analytics.dto";
import {
  type AdminFunnelAnalyticsResponse,
  type AdminViewsAnalyticsResponse,
  mapAdminAnalyticsError,
  toAdminFunnelAnalyticsResponse,
  toAdminViewsAnalyticsResponse,
} from "./admin-analytics.response";

/**
 * The administrator's analytics (M9 T11; S2, S3, S7, L12). `@AdminOnly()` on the class: the global guard answers 401
 * without an active session and 403 to a user whose stored role is not `ADMIN`, before any input is validated. Both
 * routes are read-only, bounded, and computed on read: only views have a table, while the funnel reads the columns the
 * invitation and payment rows already carry.
 *
 * - `GET /admin/analytics/views?from&to` → 200 `{ days: [{ day, public, guest }], topInvitations: [{ invitationId,
 *   slug, public, guest }] }`, every day of the window ascending with zeros filled in, and at most twenty invitations
 *   ordered by total views descending and then by slug.
 * - `GET /admin/analytics/funnel?from&to` → 200 `{ days: [{ day, draftsCreated, checkoutsStarted, paymentsApproved,
 *   firstPublications }] }` for the same window.
 *
 * A day is the calendar day in `America/Mexico_City` and both bounds are `YYYY-MM-DD`. The window is the last thirty
 * days ending today when the request names neither bound, may not be reversed, and may hold at most ninety days; a
 * malformed day is 400 from the DTO, and a reversed or over-wide window is 400 `INVALID_ANALYTICS_WINDOW` from the use
 * case, both before any query.
 */
@AdminOnly()
@Controller("admin/analytics")
export class AdminAnalyticsController {
  constructor(
    @Inject(GetAdminViewsAnalyticsUseCase)
    private readonly getViews: GetAdminViewsAnalyticsUseCase,
    @Inject(GetAdminFunnelAnalyticsUseCase)
    private readonly getFunnel: GetAdminFunnelAnalyticsUseCase,
  ) {}

  @Get("views")
  async readViews(@Query() query: AdminAnalyticsWindowDto): Promise<AdminViewsAnalyticsResponse> {
    try {
      return toAdminViewsAnalyticsResponse(
        await this.getViews.execute({ from: query.from ?? null, to: query.to ?? null }),
      );
    } catch (error) {
      return mapAdminAnalyticsError(error);
    }
  }

  @Get("funnel")
  async readFunnel(@Query() query: AdminAnalyticsWindowDto): Promise<AdminFunnelAnalyticsResponse> {
    try {
      return toAdminFunnelAnalyticsResponse(
        await this.getFunnel.execute({ from: query.from ?? null, to: query.to ?? null }),
      );
    } catch (error) {
      return mapAdminAnalyticsError(error);
    }
  }
}
