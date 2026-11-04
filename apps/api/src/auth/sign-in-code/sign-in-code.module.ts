import { Logger, Module, type OnModuleDestroy } from "@nestjs/common";

import { EmailModule } from "../../email/email.module";
import { MAX_PENDING_SIGN_IN_CODE_TASKS } from "../abuse-limits";
import { BACKGROUND_TASK_EVENT, BackgroundTasks } from "./background-tasks";
import { SignInCodeSender } from "./sign-in-code-sender";

/**
 * Background tasks bound to the application lifecycle. Pending deliveries drain in
 * `onModuleDestroy`: Nest runs that hook for this module before the global `PrismaModule`, whose
 * client disconnects in its own `onModuleDestroy`, and before every `beforeApplicationShutdown`.
 */
class ApplicationBackgroundTasks extends BackgroundTasks implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.drain();
  }
}

/** Wires the sign-in code sender to `EmailDeliveryService` for the Better Auth registration. */
@Module({
  imports: [EmailModule],
  providers: [
    {
      provide: BackgroundTasks,
      useFactory: () => {
        const logger = new Logger("BackgroundTasks");
        return new ApplicationBackgroundTasks(
          (event) =>
            event.event === BACKGROUND_TASK_EVENT.REJECTED
              ? logger.warn(event)
              : logger.error(event),
          MAX_PENDING_SIGN_IN_CODE_TASKS,
        );
      },
    },
    SignInCodeSender,
  ],
  exports: [SignInCodeSender],
})
export class SignInCodeModule {}
