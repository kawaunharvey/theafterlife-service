/**
 * Resource Templates Seed
 *
 * Seeds starter ResourceTemplate records and conditionally creates the
 * referenced INTENT taxonomy nodes if they don't already exist.
 *
 * Run: npx ts-node -r tsconfig-paths/register prisma/seeds/resource-templates.seed.ts
 */

import { PrismaClient, TaxonomyKind } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URI } },
});

// ── INTENT nodes to ensure exist ────────────────────────────────────────────

const intentNodes = [
  {
    key: "INTENT_TRAVEL_BOOKING",
    name: "Travel Booking",
    kind: TaxonomyKind.INTENT,
    group: "Logistics",
    metadata: {
      defaultAssignee: "family member",
      categoryKeys: [],
    },
  },
  {
    key: "INTENT_RELOCATION_SUPPORT",
    name: "Relocation Support",
    kind: TaxonomyKind.INTENT,
    group: "Logistics",
    metadata: {
      defaultAssignee: "family member",
      categoryKeys: ["CAT_MOVING_SERVICES"],
    },
  },
  {
    key: "INTENT_LEGAL_ASSISTANCE",
    name: "Legal Assistance",
    kind: TaxonomyKind.INTENT,
    group: "Financial",
    metadata: {
      defaultAssignee: "organizer",
      categoryKeys: ["CAT_ATTORNEY"],
    },
  },
];

// ── ResourceTemplate records ─────────────────────────────────────────────────

const templates = [
  {
    intentKey: "INTENT_TRAVEL_BOOKING",
    source: "Google Flights",
    label: "Search flights",
    resourceType: "EXTERNAL_URL" as const,
    urlTemplate: "https://www.google.com/travel/flights?q=flights+to+{destination}",
    kind: "travel" as const,
  },
  {
    intentKey: "INTENT_TRAVEL_BOOKING",
    source: "Expedia",
    label: "Book hotel",
    resourceType: "EXTERNAL_URL" as const,
    urlTemplate: "https://www.expedia.com/Hotel-Search?destination={destination}",
    kind: "travel" as const,
  },
  {
    intentKey: "INTENT_RELOCATION_SUPPORT",
    source: "U-Haul",
    label: "Get moving quote",
    resourceType: "EXTERNAL_URL" as const,
    urlTemplate: "https://www.uhaul.com/Trucks/",
    kind: "moving" as const,
  },
  {
    intentKey: "INTENT_RELOCATION_SUPPORT",
    source: "PODS",
    label: "Storage & moving",
    resourceType: "EXTERNAL_URL" as const,
    urlTemplate: "https://www.pods.com/moving",
    kind: "moving" as const,
  },
  {
    intentKey: "INTENT_LEGAL_ASSISTANCE",
    source: "Avvo",
    label: "Find an attorney",
    resourceType: "EXTERNAL_URL" as const,
    urlTemplate: "https://www.avvo.com/find-a-lawyer/{state}/estate-planning.html",
    kind: "legal" as const,
  },
  {
    intentKey: "INTENT_LEGAL_ASSISTANCE",
    source: "State Bar",
    label: "State bar directory",
    resourceType: "EXTERNAL_URL" as const,
    urlTemplate: "https://www.americanbar.org/groups/legal_services/flh-home/",
    kind: "legal" as const,
  },
  {
    intentKey: "INTENT_OBITUARY_SERVICES",
    source: "The Afterlife App",
    label: "Create a memorial",
    resourceType: "INAPP_DEEPLINK" as const,
    deeplink: "/memorial/create/cover",
    deeplinkParams: JSON.stringify({ source: "blueprint" }),
    kind: "inapp" as const,
  },
  {
    intentKey: "INTENT_OBITUARY_SERVICES",
    source: "The Afterlife App",
    label: "Share a memory on this memorial",
    resourceType: "INAPP_ACTION" as const,
    actionKey: "OPEN_SHARE_MEMORY_FLOW",
    actionParams: JSON.stringify({ source: "blueprint", requiresMemorialId: true }),
    kind: "inapp" as const,
  },
];

async function main() {
  console.log("🌱 Seeding resource templates...\n");

  // 1. Ensure INTENT nodes exist
  for (const node of intentNodes) {
    const result = await prisma.taxonomyNode.upsert({
      where: { key: node.key },
      create: {
        key: node.key,
        name: node.name,
        kind: node.kind,
        group: node.group,
        metadata: node.metadata,
        isActive: true,
      },
      update: {},
    });
    console.log(`  ✓ TaxonomyNode [${result.key}] — ${result.id}`);
  }

  console.log();

  // 2. Seed resource templates
  // Using intentKey + source as a logical unique key; upsert by finding existing
  for (const template of templates) {
    const existing = await prisma.resourceTemplate.findFirst({
      where: { intentKey: template.intentKey, source: template.source },
    });

    if (existing) {
      await prisma.resourceTemplate.update({
        where: { id: existing.id },
        data: {
          label: template.label,
          resourceType: template.resourceType,
          urlTemplate: template.urlTemplate ?? null,
          actionKey: (template as any).actionKey ?? null,
          actionParams: (template as any).actionParams ?? null,
          deeplink: (template as any).deeplink ?? null,
          deeplinkParams: (template as any).deeplinkParams ?? null,
          kind: template.kind,
          isActive: true,
        } as any,
      });
      console.log(`  ↻ ResourceTemplate updated: [${template.intentKey}] ${template.source}`);
    } else {
      const created = await prisma.resourceTemplate.create({ data: template as any });
      console.log(`  + ResourceTemplate created: [${template.intentKey}] ${template.source} — ${created.id}`);
    }
  }

  console.log("\n✅ Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
