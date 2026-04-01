import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { createHash, createHmac, randomBytes } from "crypto";

export type ApiKeyRecord = {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
  rateLimit: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ApiKeyService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async createApiKey(input: {
    name: string;
    description?: string;
    permissions: string[];
    rateLimit?: number;
  }): Promise<{ apiKey: string; apiKeyId: string }> {
    const rawKey = `ak_${randomBytes(24).toString("hex")}`;
    const keyHash = this.hashKey(rawKey);

    const record = await this.prisma.apiKey.create({
      data: {
        key: keyHash,
        name: input.name,
        description: input.description,
        permissions: input.permissions,
        rateLimit: input.rateLimit ?? 1000,
      },
    });

    return { apiKey: rawKey, apiKeyId: record.id };
  }

  async revokeApiKey(id: string): Promise<ApiKeyRecord | null> {
    return this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async validateApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
    const keyHash = this.hashKey(rawKey);
    return this.prisma.apiKey.findFirst({
      where: { key: keyHash, isActive: true },
    });
  }

  private hashKey(rawKey: string): string {
    const secret = this.config.get<string>("API_KEY_HASH_SECRET");
    if (secret) {
      return createHmac("sha256", secret).update(rawKey).digest("hex");
    }
    return createHash("sha256").update(rawKey).digest("hex");
  }
}
