import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { UseApiKeyAuth } from "@/modules/auth/decorators/use-api-key-auth.decorator";
import { WaitlistService } from "./waitlist.service";
import { AdminListWaitlistDto } from "./dto/admin-list-waitlist.dto";

@ApiTags("waitlist-admin")
@Controller("waitlist/admin")
@UseApiKeyAuth()
export class WaitlistAdminController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Get("list")
  async list(
    @Query() dto: AdminListWaitlistDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (dto.export === "csv") {
      const csv = await this.waitlist.adminExportCsv();
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="waitlist.csv"',
      );
      res.send(csv);
      return;
    }
    return this.waitlist.adminList(dto);
  }

  @Post("approve/:id")
  @HttpCode(200)
  approve(@Param("id") id: string) {
    return this.waitlist.adminApprove(id);
  }

  @Get("stats")
  stats() {
    return this.waitlist.adminStats();
  }
}
