import { Logger, Module, type OnModuleDestroy } from "@nestjs/common";

import { EmailModule } from "../../email/email.module";
import {
  BACKGROUND_TASK_EVENT,
  type BackgroundTaskEvent,
  BackgroundTasks,
  MAX_PENDING_BACKGROUND_TASKS,
} from "./background-tasks";
import { SignInCodeSender } from "./sign-in-code-sender";

/**
 * Background tasks bound to the application lifecycle. Pending deliveries drain in
 * `onModuleDestroy`: Nest runs that hook for this module before the global `PrismaModule`, whose
 * client disconnects in its own `onModuleDestroy`, and before every `beforeApplicationShutdown`.
 * The HTTP server closes only after those hooks, so a request can still arrive during the drain;
 * `shutdown` refuses its task, and the sender discards that code inline (L25).
 */
class ApplicationBackgroundTasks extends BackgroundTasks implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }
}

const WARNING_EVENTS: ReadonlySet<BackgroundTaskEvent["event"]> = new Set([
  BACKGROUND_TASK_EVENT.REJECTED,
  BACKGROUND_TASK_EVENT.REJECTED_SHUTTING_DOWN,
]);

/** Wires the sign-in code sender to `EmailDeliveryService` for the Better Auth registration. */
@Module({
  imports: [EmailModule],
  providers: [
    {
      provide: BackgroundTasks,
      useFactory: () => {
        const logger = new Logger("BackgroundTasks");
        return new ApplicationBackgroundTasks(
          (event) => (WARNING_EVENTS.has(event.event) ? logger.warn(event) : logger.error(event)),
          MAX_PENDING_BACKGROUND_TASKS,
        );
      },
    },
    SignInCodeSender,
  ],
  exports: [SignInCodeSender],
})
export class SignInCodeModule {}
