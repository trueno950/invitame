import { Module, type Provider } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import {
  CATEGORY_REPOSITORY,
  type CatalogEntryRepository,
  FEATURE_REPOSITORY,
} from "./application/taxonomy/catalog-entry.repository";
import {
  CreateCategoryUseCase,
  CreateFeatureUseCase,
  ListCategoriesUseCase,
  ListFeaturesUseCase,
  UpdateCategoryUseCase,
  UpdateFeatureUseCase,
} from "./application/taxonomy/catalog-entry.use-cases";
import {
  PrismaCategoryRepository,
  PrismaFeatureRepository,
} from "./infrastructure/prisma-taxonomy.repository";
import { CategoriesController } from "./presentation/taxonomy/categories.controller";
import { FeaturesController } from "./presentation/taxonomy/features.controller";

function useCase<T>(
  provide: new (entries: CatalogEntryRepository) => T,
  repository: symbol,
): Provider {
  return {
    provide,
    useFactory: (entries: CatalogEntryRepository) => new provide(entries),
    inject: [repository],
  };
}

/** The category and feature use cases, bound to whichever repositories the module provides. */
export const CATALOG_TAXONOMY_USE_CASES: Provider[] = [
  useCase(ListCategoriesUseCase, CATEGORY_REPOSITORY),
  useCase(CreateCategoryUseCase, CATEGORY_REPOSITORY),
  useCase(UpdateCategoryUseCase, CATEGORY_REPOSITORY),
  useCase(ListFeaturesUseCase, FEATURE_REPOSITORY),
  useCase(CreateFeatureUseCase, FEATURE_REPOSITORY),
  useCase(UpdateFeatureUseCase, FEATURE_REPOSITORY),
];

/**
 * Catalog administration: categories and features at `/admin/catalog/*`, all `@AdminOnly()`. Packages,
 * templates, and versions join this module in later tasks.
 */
@Module({
  controllers: [CategoriesController, FeaturesController],
  providers: [
    ...CATALOG_TAXONOMY_USE_CASES,
    {
      provide: CATEGORY_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaCategoryRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: FEATURE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaFeatureRepository(prisma),
      inject: [PrismaService],
    },
  ],
})
export class CatalogModule {}
