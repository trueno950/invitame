import { type INestApplication, ValidationPipe } from "@nestjs/common";
import helmet from "helmet";

export interface AppSetupOptions {
  corsOrigin: string;
}

/**
 * Applies the HTTP boundary shared by the runtime bootstrap and integration tests:
 * security headers, CORS, global input validation, and graceful shutdown.
 */
export function configureApp(app: INestApplication, options: AppSetupOptions): void {
  app.use(helmet());
  app.enableCors({
    origin: options.corsOrigin,
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
}
