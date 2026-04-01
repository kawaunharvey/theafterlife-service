import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MailgunService } from "./mailgun.service";

@Module({
  imports: [HttpModule],
  providers: [MailgunService],
  exports: [MailgunService],
})
export class MailgunModule {}
