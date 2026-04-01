import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { PrismaService } from "@/prisma/prisma.service";

@ApiTags("health")
@Controller("")
export class HealthController {
  private startTime = Date.now();

  constructor(private prisma: PrismaService) {}

  /**
   * Health check endpoint.
   */
  @Get("health")
  @ApiOperation({ summary: "Health check" })
  @ApiOkResponse({
    schema: {
      properties: {
        status: { type: "string" },
        uptime: { type: "number" },
      },
    },
  })
  health() {
    const uptime = Date.now() - this.startTime;
    return {
      status: "ok",
      uptime,
    };
  }

  /**
   * Readiness check (DB connection).
   */
  @Get("ready")
  @ApiOperation({ summary: "Readiness check" })
  @ApiOkResponse({
    schema: {
      properties: {
        status: { type: "string" },
        database: { type: "string" },
      },
    },
  })
  async ready() {
    try {
      // MongoDB: Find one user to check DB connectivity
      await this.prisma.user.findFirst();
      return {
        status: "ok",
        database: "connected",
      };
    } catch {
      return {
        status: "error",
        database: "disconnected",
      };
    }
  }
}
