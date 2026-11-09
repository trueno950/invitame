import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";

import { AdminOnly } from "../../../auth/access-control/access-control";
import {
  CreatePackageUseCase,
  ListPackagePricesUseCase,
  ListPackagesUseCase,
  SetPackageFeaturesUseCase,
  SetPackagePriceUseCase,
  UpdatePackageUseCase,
} from "../../application/packages/package.use-cases";
// biome-ignore lint/style/useImportType: the global ValidationPipe reads these classes from emitted metadata.
import {
  CreatePackageDto,
  SetPackageFeaturesDto,
  SetPackagePriceDto,
  UpdatePackageDto,
} from "./dto/package.dtos";
import {
  mapPackageError,
  orPackageNotFound,
  type PackagePriceResponse,
  type PackageResponse,
  toPackagePriceResponse,
  toPackageResponse,
} from "./package.response";

/**
 * Package administration: packages, the features they include, and their prices (S1, S4). `@AdminOnly()`
 * on the class: the global guard answers 401 without an active session and 403 to a user whose stored
 * role is not ADMIN, before any input is validated. There is no delete; a package is archived with
 * `status`, and a price is replaced, never edited, so the history stays.
 */
@AdminOnly()
@Controller("admin/catalog/packages")
export class PackagesController {
  constructor(
    @Inject(ListPackagesUseCase) private readonly listPackages: ListPackagesUseCase,
    @Inject(CreatePackageUseCase) private readonly createPackage: CreatePackageUseCase,
    @Inject(UpdatePackageUseCase) private readonly updatePackage: UpdatePackageUseCase,
    @Inject(SetPackageFeaturesUseCase) private readonly setFeatures: SetPackageFeaturesUseCase,
    @Inject(SetPackagePriceUseCase) private readonly setPrice: SetPackagePriceUseCase,
    @Inject(ListPackagePricesUseCase) private readonly listPrices: ListPackagePricesUseCase,
  ) {}

  @Get()
  async list(): Promise<PackageResponse[]> {
    return (await this.listPackages.execute()).map(toPackageResponse);
  }

  @Post()
  async create(@Body() body: CreatePackageDto): Promise<PackageResponse> {
    try {
      return toPackageResponse(await this.createPackage.execute(body));
    } catch (error) {
      return mapPackageError(error);
    }
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdatePackageDto): Promise<PackageResponse> {
    try {
      return orPackageNotFound(await this.updatePackage.execute(id, body));
    } catch (error) {
      return mapPackageError(error);
    }
  }

  @Put(":id/features")
  async replaceFeatures(
    @Param("id") id: string,
    @Body() body: SetPackageFeaturesDto,
  ): Promise<PackageResponse> {
    try {
      return orPackageNotFound(await this.setFeatures.execute(id, body.featureIds));
    } catch (error) {
      return mapPackageError(error);
    }
  }

  @Put(":id/price")
  async replacePrice(
    @Param("id") id: string,
    @Body() body: SetPackagePriceDto,
  ): Promise<PackageResponse> {
    try {
      return orPackageNotFound(await this.setPrice.execute(id, body));
    } catch (error) {
      return mapPackageError(error);
    }
  }

  @Get(":id/prices")
  async priceHistory(@Param("id") id: string): Promise<PackagePriceResponse[]> {
    const history = await this.listPrices.execute(id);
    if (!history) {
      throw new NotFoundException();
    }
    return history.map(toPackagePriceResponse);
  }
}
