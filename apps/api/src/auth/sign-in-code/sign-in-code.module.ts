import { Logger, Module, type OnApplicationShutdown } from "@nestjs/common";

import { EmailModule } from "../../email/email.module";
import { BackgroundTasks } from "./background-tasks";
import { SignInCodeSender } from "./sign-in-code-sender";

/** Background tasks bound to the application lifecycle: shutdown waits for pending deliveries. */
class ApplicationBackgroundTasks extends BackgroundTasks implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
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
        return new ApplicationBackgroundTasks((event) => logger.error(event));
      },
    },
    SignInCodeSender,
  ],
  exports: [SignInCodeSender],
})
export class SignInCodeModule {}
