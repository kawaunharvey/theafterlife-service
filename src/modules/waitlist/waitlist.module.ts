import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "@/prisma/prisma.module";
import { MailgunModule } from "@/common/mailgun/mailgun.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistAdminController } from "./waitlist-admin.controller";
import { WaitlistService } from "./waitlist.service";
import { WaitlistWebhookService } from "./waitlist-webhook.service";

@Module({
  imports: [PrismaModule, MailgunModule, HttpModule, AuthModule],
  controllers: [WaitlistController, WaitlistAdminController],
  providers: [WaitlistService, WaitlistWebhookService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
