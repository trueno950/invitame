import { Body, Controller, Get, Inject, Put } from "@nestjs/common";

import { AdminOnly } from "../../auth/access-control/access-control";
import { SessionUserId } from "../../auth/access-control/session-user-id";
import {
  GetOperationalSettingsUseCase,
  UpdateOperationalSettingsUseCase,
} from "../application/operational-settings.use-cases";
// The global ValidationPipe reads this class from emitted metadata, so it is a value import.
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { UpdateOperationalSettingsDto } from "./dto/update-operational-settings.dto";
import {
  type AdminSettingsResponse,
  mapAdminSettingsError,
  toAdminSettingsResponse,
} from "./admin-settings.response";

/**
 * The administrator's configuration panel (M9 T13; S5, S8, L15). `@AdminOnly()` on the class: the global guard answers
 * 401 without an active session and 403 to a user whose stored role is not `ADMIN`, before any input is validated.
 *
 * - `GET /admin/settings` → 200 `{ settings: { …seven fields }, bounds: { <field>: { min, max } }, updatedAt }`.
 * - `PUT /admin/settings` with all seven integer fields plus an optional `note` of at most 200 characters → 200 with the
 *   same shape. A save that changes nothing writes nothing and answers 200 with the stored row; a real save stores the
 *   new set and one `AdminAction` row (`SETTINGS_UPDATED`, reason `OTHER`, no target) in the same transaction, whose note
 *   records `<field>: <old> → <new>; …` followed by the administrator's note. A value outside its bounds or a broken
 *   cross-field rule answers 400 `INVALID_SETTINGS` with `issues: [{ field, rule }]`; a malformed body answers the
 *   pipe's own 400.
 *
 * The actor is `@SessionUserId()`, never a body field. Both routes are for administrators only, and neither exposes a
 * secret: S8 keeps payments, abuse limits, refunds, retention, and credentials deploy-only.
 */
@AdminOnly()
@Controller("admin/settings")
export class AdminSettingsController {
  constructor(
    @Inject(GetOperationalSettingsUseCase)
    private readonly getSettings: GetOperationalSettingsUseCase,
    @Inject(UpdateOperationalSettingsUseCase)
    private readonly updateSettings: UpdateOperationalSettingsUseCase,
  ) {}

  @Get()
  async read(): Promise<AdminSettingsResponse> {
    return toAdminSettingsResponse(await this.getSettings.execute());
  }

  @Put()
  async save(
    @SessionUserId() userId: string,
    @Body() body: UpdateOperationalSettingsDto,
  ): Promise<AdminSettingsResponse> {
    try {
      return toAdminSettingsResponse(
        await this.updateSettings.execute({
          adminUserId: userId,
          settings: {
            rsvpDefaultPartyLimit: body.rsvpDefaultPartyLimit,
            rsvpMaxPartyLimit: body.rsvpMaxPartyLimit,
            galleryPhotoLimit: body.galleryPhotoLimit,
            storedAssetLimit: body.storedAssetLimit,
            maxUploadMegabytes: body.maxUploadMegabytes,
            placeSearchResultLimit: body.placeSearchResultLimit,
            analyticsDefaultWindowDays: body.analyticsDefaultWindowDays,
          },
          note: body.note,
        }),
      );
    } catch (error) {
      return mapAdminSettingsError(error);
    }
  }
}
