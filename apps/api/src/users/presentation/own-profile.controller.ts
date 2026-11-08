import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  UnauthorizedException,
} from "@nestjs/common";

import { SessionUserId } from "../../auth/access-control/session-user-id";
import type { OwnProfile } from "../application/own-profile.repository";
import {
  GetOwnProfileUseCase,
  InvalidDisplayNameError,
  UpdateOwnProfileUseCase,
} from "../application/own-profile.use-cases";
// biome-ignore lint/style/useImportType: the global ValidationPipe reads this class from emitted metadata.
import { UpdateOwnProfileDto } from "./dto/update-own-profile.dto";

/** The stable REST shape of the own profile. */
export interface OwnProfileResponse {
  id: string;
  email: string;
  displayName: string | null;
  role: OwnProfile["role"];
}

function toResponse(profile: OwnProfile | null): OwnProfileResponse {
  // No profile: the session's user no longer exists, or a write found the account no longer ACTIVE (S53).
  // Either way the session is no longer valid.
  if (!profile) {
    throw new UnauthorizedException();
  }
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
  };
}

/**
 * The signed-in user's own profile. Not `@Public()`: the global guard requires a session whose stored
 * user is ACTIVE. The user id comes only from that session, never from the path, query, or body.
 */
@Controller("me")
export class OwnProfileController {
  constructor(
    @Inject(GetOwnProfileUseCase) private readonly getOwnProfile: GetOwnProfileUseCase,
    @Inject(UpdateOwnProfileUseCase) private readonly updateOwnProfile: UpdateOwnProfileUseCase,
  ) {}

  @Get()
  async read(@SessionUserId() userId: string): Promise<OwnProfileResponse> {
    return toResponse(await this.getOwnProfile.execute(userId));
  }

  @Patch()
  async update(
    @SessionUserId() userId: string,
    @Body() body: UpdateOwnProfileDto,
  ): Promise<OwnProfileResponse> {
    try {
      return toResponse(await this.updateOwnProfile.execute(userId, body.displayName));
    } catch (error) {
      if (error instanceof InvalidDisplayNameError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
