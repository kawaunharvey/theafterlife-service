import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "@/prisma/prisma.module";
import { UsersModule } from "@/modules/users/users.module";
import { MailgunModule } from "@/common/mailgun/mailgun.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ApiKeyService } from "./api-key.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtTokenService } from "./jwt-token.service";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    MailgunModule,
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, ApiKeyService, JwtStrategy, JwtTokenService],
  exports: [AuthService, ApiKeyService, JwtTokenService],
})
export class AuthModule {}
