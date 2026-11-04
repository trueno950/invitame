import { ConfigService } from "@nestjs/config";

import { AppModule } from "./app.module";
import { createApp } from "./app.setup";
import type { RuntimeEnvironment } from "./config/environment";

async function bootstrap(): Promise<void> {
  // Reject instead of aborting, so a configuration error exits through the handler below.
  const app = await createApp(AppModule.forRoot(), { abortOnError: false });
  const port = app
    .get<ConfigService<RuntimeEnvironment, true>>(ConfigService)
    .get("PORT", { infer: true });

  await app.listen(port);
}

void bootstrap().catch(() => {
  console.error("API bootstrap failed.");
  process.exitCode = 1;
});
