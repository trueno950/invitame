import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";

import { AdminOnly } from "../../../auth/access-control/access-control";
import {
  CreateFeatureUseCase,
  ListFeaturesUseCase,
  UpdateFeatureUseCase,
} from "../../application/taxonomy/catalog-entry.use-cases";
import {
  type CatalogEntryResponse,
  mapCatalogError,
  orNotFound,
  toCatalogEntryResponse,
} from "./catalog-entry.response";
// biome-ignore lint/style/useImportType: the global ValidationPipe reads this class from emitted metadata.
import { CreateFeatureDto } from "./dto/create-feature.dto";
// biome-ignore lint/style/useImportType: the global ValidationPipe reads this class from emitted metadata.
import { UpdateCatalogEntryDto } from "./dto/update-catalog-entry.dto";

/**
 * Feature administration. A feature key is data: it identifies a record and never selects a code
 * path (S2, S8). `@AdminOnly()` on the class: the global guard answers 401 without an active session
 * and 403 to a user whose stored role is not ADMIN, before any input is validated. There is no
 * delete; a feature is deactivated with `isActive`.
 */
@AdminOnly()
@Controller("admin/catalog/features")
export class FeaturesController {
  constructor(
    @Inject(ListFeaturesUseCase) private readonly listFeatures: ListFeaturesUseCase,
    @Inject(CreateFeatureUseCase) private readonly createFeature: CreateFeatureUseCase,
    @Inject(UpdateFeatureUseCase) private readonly updateFeature: UpdateFeatureUseCase,
  ) {}

  @Get()
  async list(): Promise<CatalogEntryResponse[]> {
    return (await this.listFeatures.execute()).map(toCatalogEntryResponse);
  }

  @Post()
  async create(@Body() body: CreateFeatureDto): Promise<CatalogEntryResponse> {
    try {
      return toCatalogEntryResponse(await this.createFeature.execute(body));
    } catch (error) {
      return mapCatalogError(error);
    }
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateCatalogEntryDto,
  ): Promise<CatalogEntryResponse> {
    try {
      return orNotFound(await this.updateFeature.execute(id, body));
    } catch (error) {
      return mapCatalogError(error);
    }
  }
}
