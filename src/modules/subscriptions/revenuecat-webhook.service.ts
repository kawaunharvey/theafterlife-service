import { Injectable, Logger } from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";

const LIFETIME_PRODUCT_ID = "com.thehereafter.wtta.memorial.lifetime";

interface RevenueCatEventBody {
  event: {
    type: string;
    app_user_id: string;
    product_id: string;
    purchased_at_ms: number;
  };
}

@Injectable()
export class RevenueCatWebhookService {
  private readonly logger = new Logger(RevenueCatWebhookService.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async handle(body: RevenueCatEventBody): Promise<void> {
    const { type, app_user_id, product_id, purchased_at_ms } = body.event;

    if (product_id !== LIFETIME_PRODUCT_ID) {
      this.logger.warn(`Unhandled product_id: ${product_id}`);
      return;
    }

    switch (type) {
      case "INITIAL_PURCHASE":
        await this.handleInitialPurchase(app_user_id, purchased_at_ms);
        break;
      case "RESTORE":
      case "RENEWAL":
        await this.handleRestore(app_user_id);
        break;
      case "REFUND":
        await this.subscriptionsService.revokeEntitlement(app_user_id);
        this.logger.log(`Entitlement revoked for user ${app_user_id} due to REFUND`);
        break;
      case "CANCELLATION":
      case "EXPIRATION":
        // Lifetime doesn't expire — only revoke for non-lifetime products
        if (product_id !== LIFETIME_PRODUCT_ID) {
          await this.subscriptionsService.revokeEntitlement(app_user_id);
          this.logger.log(`Entitlement revoked for user ${app_user_id} due to ${type}`);
        }
        break;
      case "BILLING_ISSUE":
        this.logger.warn(`Billing issue on lifetime for user ${app_user_id}`);
        break;
      default:
        this.logger.log(`Unhandled RevenueCat event type: ${type}`);
    }
  }

  private async handleInitialPurchase(userId: string, purchasedAtMs: number): Promise<void> {
    const { available } = await this.subscriptionsService.getLifetimeAvailability();
    if (!available) {
      this.logger.error(
        `INITIAL_PURCHASE received for ${userId} but lifetime cap is reached — manual review required`,
      );
      return;
    }

    await this.subscriptionsService.grantLifetimeEntitlement(
      userId,
      new Date(purchasedAtMs),
    );
    this.logger.log(`Lifetime entitlement granted to user ${userId}`);
  }

  private async handleRestore(userId: string): Promise<void> {
    await this.subscriptionsService.restoreLifetimeEntitlement(userId);
    this.logger.log(`Lifetime entitlement restored for user ${userId}`);
  }
}
