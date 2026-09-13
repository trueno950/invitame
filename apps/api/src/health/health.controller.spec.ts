import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ServiceUnavailableException } from "@nestjs/common";

import type { PrismaService } from "../database/prisma.service";
import { DATABASE_STATUS, HEALTH_STATUS } from "./health.contract";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

class PrismaServiceMock {
  calls = 0;
  failure: Error | null = null;

  async $queryRaw(_query: TemplateStringsArray): Promise<unknown> {
    this.calls += 1;

    if (this.failure) {
      throw this.failure;
    }

    return [{ ready: 1 }];
  }
}

function createController(prisma: PrismaServiceMock): HealthController {
  return new HealthController(new HealthService(prisma as unknown as PrismaService));
}

describe("HealthController", () => {
  it("returns healthy only after a database roundtrip", async () => {
    const prisma = new PrismaServiceMock();
    const controller = createController(prisma);

    const response = await controller.getHealth();

    assert.equal(prisma.calls, 1);
    assert.equal(response.status, HEALTH_STATUS.HEALTHY);
    assert.equal(response.database, DATABASE_STATUS.AVAILABLE);
    assert.equal(Number.isNaN(Date.parse(response.checkedAt)), false);
  });

  it("returns service unavailable when the database cannot be reached", async () => {
    const prisma = new PrismaServiceMock();
    prisma.failure = new Error("Database unavailable");
    const controller = createController(prisma);

    await assert.rejects(controller.getHealth(), (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.equal(error.getStatus(), 503);

      const response = error.getResponse();
      assert.equal(typeof response, "object");
      assert.notEqual(response, null);

      if (typeof response !== "object" || response === null) {
        return false;
      }

      const healthResponse = response as Record<string, unknown>;
      assert.equal(healthResponse.status, HEALTH_STATUS.UNHEALTHY);
      assert.equal(healthResponse.database, DATABASE_STATUS.UNAVAILABLE);
      assert.equal(typeof healthResponse.checkedAt, "string");
      return true;
    });

    assert.equal(prisma.calls, 1);
  });
});
