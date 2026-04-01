import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { ApiKeyRecord } from "../api-key.service";

export const CurrentApiKey = createParamDecorator(
  (data: keyof ApiKeyRecord | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const apiKey = request.apiKey as ApiKeyRecord | undefined;

    if (!data) {
      return apiKey;
    }

    return apiKey?.[data];
  },
);
