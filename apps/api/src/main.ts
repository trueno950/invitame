import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigin = configService.getOrThrow<string>("CORS_ORIGIN");
  const port = configService.getOrThrow<number>("PORT");

  configureApp(app, { corsOrigin });

  await app.listen(port);
}

void bootstrap().catch(() => {
  console.error("API bootstrap failed.");
  process.exitCode = 1;
});
