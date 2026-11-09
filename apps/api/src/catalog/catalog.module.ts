import { Module, type Provider } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import {
  PACKAGE_REPOSITORY,
  type PackageRepository,
} from "./application/packages/package.repository";
import {
  CreatePackageUseCase,
  ListPackagePricesUseCase,
  ListPackagesUseCase,
  SetPackageFeaturesUseCase,
  SetPackagePriceUseCase,
  UpdatePackageUseCase,
} from "./application/packages/package.use-cases";
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
  TEMPLATE_REPOSITORY,
  type TemplateRepository,
} from "./application/templates/template.repository";
import {
  CreateTemplateUseCase,
  CreateTemplateVersionUseCase,
  ListRenderersUseCase,
  ListTemplatesUseCase,
  ListTemplateVersionsUseCase,
  PublishTemplateVersionUseCase,
  RetireTemplateVersionUseCase,
  UpdateTemplateUseCase,
} from "./application/templates/template.use-cases";
import { PrismaPackageRepository } from "./infrastructure/prisma-package.repository";
import {
  PrismaCategoryRepository,
  PrismaFeatureRepository,
} from "./infrastructure/prisma-taxonomy.repository";
import { PrismaTemplateRepository } from "./infrastructure/prisma-template.repository";
import { PackagesController } from "./presentation/packages/packages.controller";
import { CategoriesController } from "./presentation/taxonomy/categories.controller";
import { FeaturesController } from "./presentation/taxonomy/features.controller";
import { RenderersController } from "./presentation/templates/renderers.controller";
import { TemplatesController } from "./presentation/templates/templates.controller";

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

/** The package use cases, bound to whichever repository the module provides. */
export const CATALOG_PACKAGE_USE_CASES: Provider[] = [
  ListPackagesUseCase,
  CreatePackageUseCase,
  UpdatePackageUseCase,
  SetPackageFeaturesUseCase,
  SetPackagePriceUseCase,
  ListPackagePricesUseCase,
].map((provide) => ({
  provide,
  useFactory: (packages: PackageRepository) => new provide(packages),
  inject: [PACKAGE_REPOSITORY],
}));

/** The template, version, and renderer-list use cases, bound to whichever repository the module provides. */
export const CATALOG_TEMPLATE_USE_CASES: Provider[] = [
  ...[
    ListTemplatesUseCase,
    CreateTemplateUseCase,
    UpdateTemplateUseCase,
    ListTemplateVersionsUseCase,
    CreateTemplateVersionUseCase,
    PublishTemplateVersionUseCase,
    RetireTemplateVersionUseCase,
  ].map((provide) => ({
    provide,
    useFactory: (templates: TemplateRepository) => new provide(templates),
    inject: [TEMPLATE_REPOSITORY],
  })),
  // The renderer list reads the in-code registry and needs no repository.
  { provide: ListRenderersUseCase, useFactory: () => new ListRenderersUseCase() },
];

/**
 * Catalog administration: categories, features, packages, templates with their versions, and the renderer
 * list at `/admin/catalog/*`, all `@AdminOnly()`.
 */
@Module({
  controllers: [
    CategoriesController,
    FeaturesController,
    PackagesController,
    TemplatesController,
    RenderersController,
  ],
  providers: [
    ...CATALOG_TAXONOMY_USE_CASES,
    ...CATALOG_PACKAGE_USE_CASES,
    ...CATALOG_TEMPLATE_USE_CASES,
    {
      provide: TEMPLATE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaTemplateRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: PACKAGE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaPackageRepository(prisma),
      inject: [PrismaService],
    },
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
