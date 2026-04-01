import { Module } from "@nestjs/common";
import { AppDataController } from "./app-data.controller";
import { AppDataService } from "./app-data.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AppDataController],
  providers: [AppDataService],
  exports: [AppDataService],
})
export class AppDataModule {}
