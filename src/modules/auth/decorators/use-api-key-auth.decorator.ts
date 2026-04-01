import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiHeader } from "@nestjs/swagger";
import { ApiKeyAuthGuard } from "../guards/api-key-auth.guard";

export const UseApiKeyAuth = () =>
  applyDecorators(
    UseGuards(ApiKeyAuthGuard),
    ApiHeader({ name: "x-api-key", required: true }),
  );
