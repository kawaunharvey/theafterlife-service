import { Injectable, Logger } from "@nestjs/common";

/**
 * DEPRECATED: This service used old schema fields (primaryCategory, tags).
 * Use Blueprint v0.2.0 PlannerService instead.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  async match(): Promise<any[]> {
    this.logger.warn('MatchingService is deprecated. Use PlannerService instead.');
    return [];
  }
}
