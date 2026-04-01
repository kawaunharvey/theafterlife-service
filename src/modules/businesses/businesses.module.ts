import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PlacesModule } from "../places/places.module";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";

@Module({
  imports: [PrismaModule, PlacesModule],
  controllers: [BusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
