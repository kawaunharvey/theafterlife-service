import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { UnderworldController } from "./underworld.controller";
import { UnderworldService } from "./underworld.service";
import { ApiKeyService } from "../auth/api-key.service"

@Module({
  imports: [PrismaModule],
  controllers: [UnderworldController],
  providers: [UnderworldService, ApiKeyService],
  exports: [UnderworldService],
})
export class UnderworldModule {}
