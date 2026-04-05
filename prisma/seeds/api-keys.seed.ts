import { PrismaClient } from "@prisma/client";
import { createHash, createHmac, randomBytes } from "crypto";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URI } },
});

function hashKey(rawKey: string): string {
  const secret = process.env.API_KEY_HASH_SECRET;
  if (secret) {
    return createHmac("sha256", secret).update(rawKey).digest("hex");
  }
  return createHash("sha256").update(rawKey).digest("hex");
}

async function createApiKey(input: {
  name: string;
  description?: string;
  permissions: string[];
  rateLimit?: number;
}): Promise<{ apiKey: string; apiKeyId: string }> {
  const rawKey = `ak_${randomBytes(24).toString("hex")}`;
  const keyHash = hashKey(rawKey);

  const record = await prisma.apiKey.create({
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

async function main() {
  console.log("Seeding API keys for the-afterlife-service...");

  const existing = await prisma.apiKey.findFirst({
    where: { name: "Initial Admin Key" },
  });

  if (existing) {
    console.log("Admin API key already exists, skipping.");
    return;
  }

  const admin = await createApiKey({
    name: "Initial Admin Key",
    description: "Bootstrap admin key for managing API keys",
    permissions: ["admin"],
    rateLimit: 1000,
  });

  console.log("\n--- Generated API Keys (store these securely) ---");
  console.log(`API_KEY=${admin.apiKey}  (id: ${admin.apiKeyId})`);
  console.log("--------------------------------------------------\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
