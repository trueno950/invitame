import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import { AdminOnly } from "../../../auth/access-control/access-control";
import {
  CreateTemplateUseCase,
  CreateTemplateVersionUseCase,
  ListTemplatesUseCase,
  ListTemplateVersionsUseCase,
  PublishTemplateVersionUseCase,
  RetireTemplateVersionUseCase,
  UpdateTemplateUseCase,
} from "../../application/templates/template.use-cases";
// biome-ignore lint/style/useImportType: the global ValidationPipe reads these classes from emitted metadata.
import {
  CreateTemplateDto,
  CreateTemplateVersionDto,
  UpdateTemplateDto,
} from "./dto/template.dtos";
import {
  mapTemplateError,
  orTemplateNotFound,
  orVersionNotFound,
  type TemplateResponse,
  type TemplateVersionResponse,
  toTemplateResponse,
  toTemplateVersionResponse,
} from "./template.response";

/**
 * Template administration: templates, and the immutable versions that snapshot a renderer, its schema, and
 * its configuration (S1, S5, S6, S8). `@AdminOnly()` on the class: the global guard answers 401 without
 * an active session and 403 to a user whose stored role is not ADMIN, before any input is validated.
 * There is no delete and no version update: a template is archived with `status`, a snapshot changes by
 * creating a new version, and a version only moves DRAFT to PUBLISHED to RETIRED.
 */
@AdminOnly()
@Controller("admin/catalog/templates")
export class TemplatesController {
  constructor(
    @Inject(ListTemplatesUseCase) private readonly listTemplates: ListTemplatesUseCase,
    @Inject(CreateTemplateUseCase) private readonly createTemplate: CreateTemplateUseCase,
    @Inject(UpdateTemplateUseCase) private readonly updateTemplate: UpdateTemplateUseCase,
    @Inject(ListTemplateVersionsUseCase)
    private readonly listVersions: ListTemplateVersionsUseCase,
    @Inject(CreateTemplateVersionUseCase)
    private readonly createVersion: CreateTemplateVersionUseCase,
    @Inject(PublishTemplateVersionUseCase)
    private readonly publishVersion: PublishTemplateVersionUseCase,
    @Inject(RetireTemplateVersionUseCase)
    private readonly retireVersion: RetireTemplateVersionUseCase,
  ) {}

  @Get()
  async list(): Promise<TemplateResponse[]> {
    return (await this.listTemplates.execute()).map(toTemplateResponse);
  }

  @Post()
  async create(@Body() body: CreateTemplateDto): Promise<TemplateResponse> {
    try {
      return toTemplateResponse(await this.createTemplate.execute(body));
    } catch (error) {
      return mapTemplateError(error);
    }
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateTemplateDto,
  ): Promise<TemplateResponse> {
    try {
      return orTemplateNotFound(await this.updateTemplate.execute(id, body));
    } catch (error) {
      return mapTemplateError(error);
    }
  }

  @Get(":id/versions")
  async versions(@Param("id") id: string): Promise<TemplateVersionResponse[]> {
    const versions = await this.listVersions.execute(id);
    if (!versions) {
      throw new NotFoundException();
    }
    return versions.map(toTemplateVersionResponse);
  }

  @Post(":id/versions")
  async createDraftVersion(
    @Param("id") id: string,
    @Body() body: CreateTemplateVersionDto,
  ): Promise<TemplateVersionResponse> {
    try {
      return orVersionNotFound(await this.createVersion.execute(id, body));
    } catch (error) {
      return mapTemplateError(error);
    }
  }

  @Post(":id/versions/:versionId/publish")
  @HttpCode(200)
  async publish(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<TemplateVersionResponse> {
    try {
      return orVersionNotFound(await this.publishVersion.execute(id, versionId));
    } catch (error) {
      return mapTemplateError(error, "stored-version");
    }
  }

  @Post(":id/versions/:versionId/retire")
  @HttpCode(200)
  async retire(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<TemplateVersionResponse> {
    try {
      return orVersionNotFound(await this.retireVersion.execute(id, versionId));
    } catch (error) {
      return mapTemplateError(error);
    }
  }
}
