import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "@/prisma/prisma.module";
import { BlueprintsController } from "./blueprints.controller";
import { BlueprintParseService } from "./services/blueprint-parse.service";
import { BlueprintBuildService } from "./services/blueprint-build.service";
import { BlueprintEnrichService } from "./services/blueprint-enrich.service";
import { PlacesModule } from "../places/places.module";
import { PecModule } from "../pec/pec.module";

@Module({
  imports: [PrismaModule, ConfigModule, PlacesModule, PecModule],
  controllers: [BlueprintsController],
  providers: [BlueprintParseService, BlueprintBuildService, BlueprintEnrichService],
})
export class BlueprintsModule {}
