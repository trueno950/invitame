import { setTimeout as delay } from "node:timers/promises";

import { Logger } from "@nestjs/common";

import type {
  EmailDeliveryEvent,
  EmailDeliveryRuntime,
} from "../application/email-delivery.service";

/** Wall clock, real timers, and Nest's logger; events are passed as objects so they stay structured. */
export class SystemEmailDeliveryRuntime implements EmailDeliveryRuntime {
  private readonly logger = new Logger("EmailDelivery");

  now(): number {
    return Date.now();
  }

  async sleep(milliseconds: number): Promise<void> {
    await delay(milliseconds);
  }

  warn(event: EmailDeliveryEvent): void {
    this.logger.warn(event);
  }

  error(event: EmailDeliveryEvent): void {
    this.logger.error(event);
  }
}
