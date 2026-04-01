import { PrismaModule } from "@/prisma/prisma.module"
import { Module } from "@nestjs/common"
import { AnalyticsService } from "./analytics.service"

@Module({
  imports: [PrismaModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
