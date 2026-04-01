import { Injectable, Logger } from "@nestjs/common";

/**
 * DEPRECATED: This service used old schema fields (primaryCategory, reputationBreakdown).
 * Use Blueprint v0.2.0 scoring system instead.
 */
@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  async computeReputationScore(): Promise<void> {
    this.logger.warn('ReputationService is deprecated. Use Blueprint v0.2.0 scoring instead.');
  }
}
