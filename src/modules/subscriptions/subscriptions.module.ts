import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "@/prisma/prisma.module";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { RevenueCatWebhookService } from "./revenuecat-webhook.service";
import { RevenueCatWebhookController } from "./revenuecat-webhook.controller";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SubscriptionsController, RevenueCatWebhookController],
  providers: [SubscriptionsService, RevenueCatWebhookService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
