import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Response } from "express";
import { WaitlistService } from "./waitlist.service";
import { JoinWaitlistDto } from "./dto/join-waitlist.dto";
import { ReferWaitlistDto } from "./dto/refer-waitlist.dto";

@ApiTags("waitlist")
@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post("join")
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  join(@Body() dto: JoinWaitlistDto) {
    return this.waitlist.join(dto);
  }

  @Get("position/:id")
  getPosition(@Param("id") id: string) {
    return this.waitlist.getPosition(id);
  }

  @Get("verify/:token")
  async verifyToken(@Param("token") token: string, @Res() res: Response) {
    try {
      await this.waitlist.verifyToken(token);
      return res.redirect(this.waitlist.getVerifySuccessRedirectUrl());
    } catch {
      return res.redirect(this.waitlist.getVerifyFailureRedirectUrl());
    }
  }

  @Post("refer")
  @HttpCode(200)
  refer(@Body() dto: ReferWaitlistDto) {
    return this.waitlist.getReferralLink(dto.id);
  }

  @Get("status")
  getStatus() {
    return this.waitlist.getStatus();
  }
}
