import * as crypto from "crypto";
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Env } from "@/config/env";
import { RevenueCatWebhookService } from "./revenuecat-webhook.service";

function validateHmacSignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

@ApiTags("webhooks")
@Controller("webhooks")
export class RevenueCatWebhookController {
  private readonly webhookSecret: string;

  constructor(
    private readonly webhookService: RevenueCatWebhookService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.webhookSecret = config.get("REVENUECAT_WEBHOOK_SECRET", { infer: true });
  }

  @Post("revenuecat")
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-revenuecat-signature") signature: string,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !signature || !validateHmacSignature(rawBody, signature, this.webhookSecret)) {
      throw new UnauthorizedException();
    }
    await this.webhookService.handle(body);
    return { received: true };
  }
}
