import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { GooglePlacesClient } from "./google-places.client";
import { PlacesMaintenanceService } from "./places-maintenance.service";
import { PlacesController } from "./places.controller";

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule, AiModule],
  controllers: [PlacesController],
  providers: [GooglePlacesClient, PlacesMaintenanceService],
  exports: [GooglePlacesClient, PlacesMaintenanceService],
})
export class PlacesModule {}
