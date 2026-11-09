import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";

import { AdminOnly } from "../../../auth/access-control/access-control";
import {
  CreateCategoryUseCase,
  ListCategoriesUseCase,
  UpdateCategoryUseCase,
} from "../../application/taxonomy/catalog-entry.use-cases";
import {
  type CatalogEntryResponse,
  mapCatalogError,
  orNotFound,
  toCatalogEntryResponse,
} from "./catalog-entry.response";
// biome-ignore lint/style/useImportType: the global ValidationPipe reads this class from emitted metadata.
import { CreateCategoryDto } from "./dto/create-category.dto";
// biome-ignore lint/style/useImportType: the global ValidationPipe reads this class from emitted metadata.
import { UpdateCatalogEntryDto } from "./dto/update-catalog-entry.dto";

/**
 * Category administration. `@AdminOnly()` on the class: the global guard answers 401 without an
 * active session and 403 to a user whose stored role is not ADMIN, before any input is validated.
 * There is no delete; a category is deactivated with `isActive`.
 */
@AdminOnly()
@Controller("admin/catalog/categories")
export class CategoriesController {
  constructor(
    @Inject(ListCategoriesUseCase) private readonly listCategories: ListCategoriesUseCase,
    @Inject(CreateCategoryUseCase) private readonly createCategory: CreateCategoryUseCase,
    @Inject(UpdateCategoryUseCase) private readonly updateCategory: UpdateCategoryUseCase,
  ) {}

  @Get()
  async list(): Promise<CatalogEntryResponse[]> {
    return (await this.listCategories.execute()).map(toCatalogEntryResponse);
  }

  @Post()
  async create(@Body() body: CreateCategoryDto): Promise<CatalogEntryResponse> {
    try {
      return toCatalogEntryResponse(await this.createCategory.execute(body));
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
      return orNotFound(await this.updateCategory.execute(id, body));
    } catch (error) {
      return mapCatalogError(error);
    }
  }
}
