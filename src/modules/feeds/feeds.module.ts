import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { FeedsController } from "./feeds.controller";
import { FeedsService } from "./feeds.service";

@Module({
  imports: [PrismaModule],
  controllers: [FeedsController],
  providers: [FeedsService],
})
export class FeedsModule {}
