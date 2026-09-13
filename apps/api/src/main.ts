import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigin = configService.getOrThrow<string>("CORS_ORIGIN");
  const port = configService.getOrThrow<number>("PORT");

  app.use(helmet());
  app.enableCors({
    origin: corsOrigin,
    credentials: false,
    methods: ["GET", "HEAD", "OPTIONS"],
    allowedHeaders: ["Accept", "Content-Type"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks(["SIGINT", "SIGTERM"]);

  await app.listen(port);
}

void bootstrap().catch(() => {
  console.error("API bootstrap failed.");
  process.exitCode = 1;
});
