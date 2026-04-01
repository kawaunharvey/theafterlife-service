import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { AiController } from "./ai.controller";
import { AiScoringService } from "./ai-scoring.service";
import { IntentExtractionService } from "./intent-extraction.service";
import { MatchingService } from "./matching.service";
import { ReputationService } from "./reputation.service";

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AiController],
  providers: [
    AiScoringService,
    IntentExtractionService,
    MatchingService,
    ReputationService,
  ],
  exports: [
    AiScoringService,
    ReputationService,
    IntentExtractionService,
    MatchingService,
  ],
})
export class AiModule {}
