import { Controller, Get, Inject } from "@nestjs/common";

import { AdminOnly } from "../../../auth/access-control/access-control";
import { ListRenderersUseCase } from "../../application/templates/template.use-cases";

/**
 * The renderer allow-list (S6), read-only: the `componentKey` values a version may name. The web admin
 * reads it to offer a choice; the registry in code stays the only place that adds a key.
 */
@AdminOnly()
@Controller("admin/catalog/renderers")
export class RenderersController {
  constructor(@Inject(ListRenderersUseCase) private readonly listRenderers: ListRenderersUseCase) {}

  @Get()
  list(): Array<{ componentKey: string }> {
    return this.listRenderers.execute();
  }
}
