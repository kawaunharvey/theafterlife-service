import { Body, Controller, Post } from "@nestjs/common";
import { MatchBusinessesDto } from "./dto/match-businesses.dto";
import { MatchingService } from "./matching.service";

@Controller("ai")
export class AiController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post("match-businesses")
  async matchBusinesses(@Body() dto: MatchBusinessesDto): Promise<{
    items: any[];
    count: number;
  }> {
    const results = await this.matchingService.match();
    return { items: results, count: results.length };
  }
}
