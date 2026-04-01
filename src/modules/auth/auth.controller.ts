import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { ApiKeyService } from "./api-key.service";
import { RequestCodeDto } from "./dto/request-magic-link.dto";
import { VerifyCodeDto } from "./dto/verify-magic-link.dto";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";
import { UseJwtAuth } from "./decorators/use-jwt-auth.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private apiKeys: ApiKeyService,
  ) {}

  @Post("code/request")
  @HttpCode(202)
  async requestCode(@Body() dto: RequestCodeDto, @Req() req: Request) {
    return this.auth.requestCode(dto.email, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  @Post("code/verify")
  async verifyCode(@Body() dto: VerifyCodeDto, @Req() req: Request) {
    console.log("[Controller] Verify code request:", { email: dto.email, code: dto.code, deviceType: dto.deviceType, deviceName: dto.deviceName });
    try {
      const result = await this.auth.verifyCode(dto.email, dto.code, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        deviceType: dto.deviceType,
        deviceName: dto.deviceName,
      });
      return result;
    } catch (error) {
      console.error("[Controller] Verify code error:", error);
      throw error;
    }
  }

  @Post("api-keys")
  @UseJwtAuth()
  async createApiKey(@Body() dto: CreateApiKeyDto) {
    return this.apiKeys.createApiKey(dto);
  }

  @Delete("api-keys/:id")
  @UseJwtAuth()
  async revokeApiKey(@Param("id") id: string) {
    return this.apiKeys.revokeApiKey(id);
  }
}
