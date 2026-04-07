import * as crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "@/prisma/prisma.service";

export type WaitlistEvent =
  | "waitlist.signup"
  | "waitlist.verified"
  | "waitlist.approved";

@Injectable()
export class WaitlistWebhookService {
  private readonly logger = new Logger(WaitlistWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
  ) {}

  async emit(event: WaitlistEvent, data: unknown): Promise<void> {
    const webhooks = await this.prisma.internalWebhook.findMany({
      where: {
        isActive: true,
        OR: [{ events: { isEmpty: true } }, { events: { has: event } }],
      },
    });

    if (webhooks.length === 0) return;

    const deliveryId = randomUUID();
    const payload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data,
    });

    await Promise.all(
      webhooks.map((wh) => this.deliver(wh, event, deliveryId, payload)),
    );
  }

  private async deliver(
    webhook: { id: string; url: string; signingSecret: string },
    event: string,
    deliveryId: string,
    payload: string,
  ): Promise<void> {
    const signature = crypto
      .createHmac("sha256", webhook.signingSecret)
      .update(payload)
      .digest("hex");

    const start = Date.now();
    let statusCode: number | undefined;
    let errorMessage: string | undefined;

    try {
      const response = await firstValueFrom(
        this.http.post(webhook.url, payload, {
          headers: {
            "Content-Type": "application/json",
            "X-Afterlife-Signature": signature,
            "X-Afterlife-Event": event,
            "X-Delivery-Id": deliveryId,
          },
          timeout: 10_000,
        }),
      );
      statusCode = response.status;
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
      const asAxios = err as { response?: { status?: number } };
      statusCode = asAxios.response?.status;
      this.logger.error(
        `Webhook delivery failed for ${webhook.id}: ${errorMessage}`,
      );
    }

    const responseTime = Date.now() - start;
    const succeeded =
      statusCode !== undefined && statusCode >= 200 && statusCode < 300;

    await this.prisma.webhookDeliveryLog.create({
      data: {
        webhookId: webhook.id,
        deliveryId,
        eventType: event,
        status: succeeded ? "delivered" : "failed",
        statusCode,
        errorMessage,
        responseTime,
        deliveredAt: succeeded ? new Date() : undefined,
      },
    });

    await this.prisma.internalWebhook.update({
      where: { id: webhook.id },
      data: succeeded
        ? { lastDeliveredAt: new Date(), successCount: { increment: 1 } }
        : { lastFailureAt: new Date(), failureCount: { increment: 1 } },
    });
  }
}
