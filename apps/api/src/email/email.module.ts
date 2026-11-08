import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { RuntimeEnvironment } from "../config/environment";
import { EMAIL_DELIVERY_RUNTIME, EmailDeliveryService } from "./application/email-delivery.service";
import { EMAIL_SENDER } from "./application/email-sender.port";
import { createEmailSender } from "./infrastructure/create-email-sender";
import { SystemEmailDeliveryRuntime } from "./infrastructure/system-email-delivery-runtime";

/**
 * Binds the `EmailSender` port to the adapter chosen by `EMAIL_TRANSPORT` and exports only
 * `EmailDeliveryService`, the single entry point for sending email.
 */
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<RuntimeEnvironment, true>) =>
        createEmailSender(config.get("EMAIL", { infer: true })),
    },
    { provide: EMAIL_DELIVERY_RUNTIME, useClass: SystemEmailDeliveryRuntime },
    EmailDeliveryService,
  ],
  exports: [EmailDeliveryService],
})
export class EmailModule {}
