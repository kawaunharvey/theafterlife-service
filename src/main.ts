import { NestFactory } from "@nestjs/core";
import { ValidationPipe, HttpStatus } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { ValidationExceptionFilter } from "./common/filters/validation-exception.filter";
import 'reflect-metadata';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(PinoLogger));
  const configService = app.get(ConfigService);
  const logger = app.get(PinoLogger);
  const port = configService.get<number>("PORT", 3000);

  // Remove x-powered-by header for security
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  // CORS
  const corsOrigin = configService.get<string>(
    "CORS_ORIGIN",
    `http://localhost:${port}`,
  );

  app.enableCors({
    origin: corsOrigin.split(",").map((o) => o.trim()),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      errorHttpStatusCode: HttpStatus.BAD_REQUEST,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new ValidationExceptionFilter());

  // Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle("Afterlife Service API")
    .setDescription("Infrastructure service for the Welcome to the Afterlife platform")
    .setVersion("1.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  await app.listen(port);

  logger.log(`🏛️ Afterlife Service running on http://localhost:${port}`);
  logger.log(`📚 OpenAPI docs at http://localhost:${port}/docs`);
  logger.log(`🔗 CORS allowed origins: ${corsOrigin}`);
  logger.log(`🛠️  Environment: ${process.env.NODE_ENV || "development"}`);
}

bootstrap().catch((err: unknown) => {
  console.error("Failed to start application:", err);
  process.exit(1);
});
