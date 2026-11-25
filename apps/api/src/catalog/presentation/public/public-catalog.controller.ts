import { Controller, Get, Inject } from "@nestjs/common";

import { Public } from "../../../auth/access-control/access-control";
import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicReader,
} from "../../application/public/catalog-public-reader";
import {
  type PublicCatalogPackageResponse,
  toPublicCatalogPackageResponse,
} from "./public-catalog.response";

/**
 * The landing's price list (T4; S4): the packages an administrator may sell, with their current MXN prices. It is
 * `@Public()` on purpose: the landing is the anonymous front page, so a visitor has no session and the guard must
 * not read one. The path sits under `public/`, outside `/catalog/*` (a signed-in customer's reads) and outside
 * `/admin/catalog/*` (the administration), so it can collide with neither.
 *
 * The read goes through the catalog's own public application contract (module-template.md), which already answers
 * ACTIVE packages ordered by key, each with the feature keys it includes and its price in force. What this
 * presentation layer adds is the anonymous projection: no id, status, duration, or timestamp.
 */
@Controller("public/catalog")
@Public()
export class PublicCatalogController {
  constructor(@Inject(CATALOG_PUBLIC_READER) private readonly catalog: CatalogPublicReader) {}

  /** Only ACTIVE packages, ordered by key, each with its MXN price in force or null (S4). */
  @Get("packages")
  async listPackages(): Promise<PublicCatalogPackageResponse[]> {
    return (await this.catalog.listActivePackages()).map(toPublicCatalogPackageResponse);
  }
}
