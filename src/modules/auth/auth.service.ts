import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { MailgunService } from "@/common/mailgun/mailgun.service";
import { UsersService } from "@/modules/users/users.service";
import { createHash, createHmac, randomBytes } from "crypto";
import { JwtTokenService } from "./jwt-token.service";

export type AuthRequestContext = {
  ip?: string;
  userAgent?: string;
  deviceType?: string;
  deviceName?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtTokenService,
    private config: ConfigService,
    private mailgun: MailgunService,
    private users: UsersService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async requestCode(
    email: string,
    context: AuthRequestContext,
  ): Promise<{ sent: boolean }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findOrCreateByEmail(normalizedEmail);

    const code = this.generateCode();
    const codeHash = this.hashCode(code);
    const ttlMinutes = this.getCodeTtlMinutes();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const cacheKey = this.getCodeCacheKey(normalizedEmail, codeHash);
    const ttlSeconds = Math.max(
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      1,
    );
    
    try {
      await this.cache.set(cacheKey, {
        userId: user.id,
        email: user.email,
      }, ttlSeconds * 1000); // TTL in milliseconds
      console.log("[Service] Successfully stored code in cache");
    } catch (error) {
      console.error("Cache set error:", error);
      throw new Error("Failed to store verification code. Please try again.");
    }

    await this.mailgun.sendVerificationCode(user.email, code);

    return { sent: true };
  }

  async verifyCode(
    email: string,
    code: string,
    context: AuthRequestContext,
  ): Promise<{
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: number;
    sessionId: string;
    user: { id: string; email: string; roles: string[] };
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();
    
    // Check for demo user
    const demoUserEmailRaw = this.config.get<string>("DEMO_USER_EMAIL", "");
    const demoUserCodeRaw = this.config.get<string>("DEMO_USER_CODE", "");
    const demoUserEmail = demoUserEmailRaw.trim().toLowerCase();
    const demoUserCode = demoUserCodeRaw.trim();
    
    if (demoUserEmail && normalizedEmail === demoUserEmail) {
      console.log("[Service] Demo user login attempt:", { email: normalizedEmail });
      
      if (!demoUserCode || code.trim() !== demoUserCode) {
        throw new UnauthorizedException("Verification code is invalid or expired.");
      }

      const user = await this.users.findOrCreateByEmail(normalizedEmail);
      
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: now },
      });

      const expiresInSeconds = this.getJwtExpiresInSeconds();
      const jwtId = randomBytes(16).toString("hex");
      const payload = {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        jti: jwtId,
      };

      const accessToken = await this.jwt.sign(payload, expiresInSeconds);

      const sessionId = await this.createSession(
        user.id,
        jwtId,
        expiresInSeconds,
        context,
      );

      return {
        accessToken,
        tokenType: "Bearer",
        expiresIn: expiresInSeconds,
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          roles: user.roles,
        },
      };
    }
    
    // Normal code verification via cache
    const codeHash = this.hashCode(code);
    const cacheKey = this.getCodeCacheKey(normalizedEmail, codeHash);
    
    console.log("[Service] Verifying code:", { email: normalizedEmail, code, codeHash, cacheKey });
    
    let cached: { userId: string; email: string } | undefined;
    try {
      const result = await this.cache.get<{ userId: string; email: string }>(
        cacheKey,
      );
      console.log("[Service] Cache result:", result);
      cached = result ?? undefined;
    } catch (error) {
      console.error("[Service] Cache get error:", error);
      throw new UnauthorizedException("Failed to verify code. Please try again.");
    }

    if (!cached) {
      console.error("[Service] No cached value found for key:", cacheKey);
      throw new UnauthorizedException("Verification code is invalid or expired.");
    }
    
    console.log("[Service] Cache hit, cached value:", cached);

    try {
      await this.cache.del(cacheKey);
    } catch (error) {
      // Continue even if delete fails
    }

    const user = await this.users.findById(cached.userId);
    if (!user) {
      throw new UnauthorizedException("Verification code is invalid or expired.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const expiresInSeconds = this.getJwtExpiresInSeconds();
    const jwtId = randomBytes(16).toString("hex");
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      jti: jwtId,
    };

    const accessToken = await this.jwt.sign(payload, expiresInSeconds);

    const sessionId = await this.createSession(
      user.id,
      jwtId,
      expiresInSeconds,
      context,
    );

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: expiresInSeconds,
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
      },
    };
  }

  private async createSession(
    userId: string,
    jwtId: string,
    expiresInSeconds: number,
    context: AuthRequestContext,
  ): Promise<string> {
    // If deviceType is provided, delete any existing sessions for this user with the same deviceType
    if (context.deviceType) {
      console.log("[Service] Removing previous session for device type:", {
        userId,
        deviceType: context.deviceType,
      });
      
      await this.prisma.session.deleteMany({
        where: {
          userId,
          deviceType: context.deviceType,
        },
      });
    }

    const session = await this.prisma.session.create({
      data: {
        userId,
        token: jwtId,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        ip: context.ip,
        userAgent: context.userAgent,
        deviceType: context.deviceType,
        deviceName: context.deviceName,
      },
    });

    return session.id;
  }

  private generateCode(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  private getCodeTtlMinutes(): number {
    const raw = this.config.get<string>("CODE_TTL_MINUTES", "15");
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
  }

  private getJwtExpiresInSeconds(): number {
    const raw = this.config.get<string>("JWT_EXPIRES_IN_SECONDS", "604800");
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 604800;
  }

  private hashCode(code: string): string {
    const secret = this.config.get<string>("CODE_HASH_SECRET");
    if (secret) {
      return createHmac("sha256", secret).update(code).digest("hex");
    }
    return createHash("sha256").update(code).digest("hex");
  }

  private getCodeCacheKey(email: string, codeHash: string): string {
    return `auth-code:${email}:${codeHash}`;
  }
}
