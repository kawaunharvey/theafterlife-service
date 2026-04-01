import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Redirect,
  HttpCode,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/modules/auth/guards/jwt-auth.guard";
import { PrismaService } from "@/prisma/prisma.service";
import { BlueprintParseService } from "./services/blueprint-parse.service";
import { BlueprintBuildService } from "./services/blueprint-build.service";
import { BlueprintEnrichService } from "./services/blueprint-enrich.service";
import { ParseBlueprintDto } from "./dto/parse.dto";
import { BuildBlueprintDto } from "./dto/build.dto";
import { EnrichActionDto } from "./dto/enrich.dto";

@Controller("blueprints")
export class BlueprintsController {
  constructor(
    private readonly parseService: BlueprintParseService,
    private readonly buildService: BlueprintBuildService,
    private readonly enrichService: BlueprintEnrichService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("parse")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async parse(@Body() dto: ParseBlueprintDto) {
    return this.parseService.parse({
      input: dto.input,
      locale: dto.locale,
      location: dto.location,
      memorialId: dto.memorialId,
    });
  }

  @Post("build")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async build(@Body() dto: BuildBlueprintDto) {
    return this.buildService.build({
      parseId: dto.parseId,
      nodes: dto.nodes,
      locations: {
        user: dto.locations.user
          ? { ...dto.locations.user, resolved: dto.locations.user.resolved ?? false }
          : null,
        event: dto.locations.event
          ? { ...dto.locations.event, resolved: dto.locations.event.resolved ?? false }
          : null,
      },
      rawInput: dto.rawInput,
      memorialId: dto.memorialId,
      locale: dto.locale,
    });
  }

  @Post("enrich")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async enrich(@Body() dto: EnrichActionDto) {
    return this.enrichService.enrich({
      actionId: dto.actionId,
      intentKey: dto.intentKey,
      location: dto.location,
      blueprintId: dto.blueprintId,
      urgency: dto.urgency,
    });
  }

  /**
   * Resource link click tracking + redirect.
   * Logs click to AuditLog, then 302s to the destination URL.
   */
  @Get("resources/open")
  @Redirect()
  async openResource(
    @Query("t") templateId: string,
    @Query("pid") parseId: string,
    @Query("dest") dest: string,
  ) {
    if (!dest) return { url: "/", statusCode: 302 };

    // Fire-and-forget analytics log
    this.logResourceClick(templateId, parseId, dest).catch(() => {});

    return { url: decodeURIComponent(dest), statusCode: 302 };
  }

  private async logResourceClick(
    templateId: string,
    parseId: string,
    dest: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        subjectType: "resource_link",
        subjectId: templateId,
        action: "resource_opened",
        payload: { templateId, parseId, dest },
      },
    });
  }
}
