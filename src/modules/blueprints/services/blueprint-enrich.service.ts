import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Env } from "@/config/env";
import { PrismaService } from "@/prisma/prisma.service";
import {
  EnrichResult,
  ProviderCard,
  ResourceLink,
} from "../types/blueprints.types";

type ResourceTemplateRow = {
  id: string;
  intentKey: string;
  source: string;
  label: string;
  urlTemplate?: string | null;
  kind: string;
  resourceType?: "EXTERNAL_URL" | "INAPP_ACTION" | "INAPP_DEEPLINK" | null;
  actionKey?: string | null;
  actionParams?: string | null;
  deeplink?: string | null;
  deeplinkParams?: string | null;
};

// ── Haversine distance (meters) ───────────────────────────────────────────────

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToMiles(m: number): string {
  return (m / 1609.34).toFixed(1) + "mi";
}

function reputationLabel(score: number | null): string {
  if (score === null) return "Verified";
  if (score >= 90) return "Top rated";
  if (score >= 70) return "Highly rated";
  return "Verified";
}

// ── URL template substitution ─────────────────────────────────────────────────

function substituteTemplate(
  template: string,
  location: { lat: number; lng: number },
  locationLabel?: string,
): string {
  const parts = locationLabel?.split(",").map((s) => s.trim()) ?? [];
  const city = parts[0] ?? "";
  const state = parts[1] ?? "";

  return template
    .replace(/\{city\}/g, encodeURIComponent(city))
    .replace(/\{state\}/g, encodeURIComponent(state))
    .replace(/\{destination\}/g, encodeURIComponent(locationLabel ?? ""))
    .replace(/\{origin\}/g, encodeURIComponent(locationLabel ?? ""))
    .replace(/\{date\}/g, new Date().toISOString().split("T")[0]);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BlueprintEnrichService {
  private readonly logger = new Logger(BlueprintEnrichService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async enrich(params: {
    actionId: string;
    intentKey: string;
    location: { lat: number; lng: number };
    blueprintId: string;
    urgency: string;
  }): Promise<EnrichResult> {
    const { actionId, intentKey, location, blueprintId, urgency } = params;

    this.logger.log(
      `Enrich called — actionId=${actionId} intentKey=${intentKey} blueprintId=${blueprintId} urgency=${urgency}`,
    );

    const actionRow = await this.prisma.action.findFirst({
      where: { intentKey, isActive: true },
      select: { taxonomies: true },
    });
    // Use action.taxonomies if populated; fall back to [intentKey] for backward compat.
    const matchKeys = actionRow?.taxonomies?.length ? actionRow.taxonomies : [intentKey];
    const radiusMeters = urgency === "high" ? 15_000 : 40_000;

    const [providers, resources] = await Promise.all([
      this.queryProviders(matchKeys, location, radiusMeters),
      this.buildResources(intentKey, location, blueprintId),
    ]);

    this.logger.log(
      `Enrich result — actionId=${actionId} intentKey=${intentKey} ` +
      `providers=${providers.length} resources=${resources.length}`,
    );
    if (providers.length > 0) {
      for (const p of providers) {
        this.logger.log(
          `  provider: ${p.name} | dist=${p.distance} | open=${p.open} | score=${p.reputationScore ?? "n/a"} | lat=${p.lat} lng=${p.lng}`,
        );
      }
    } else {
      this.logger.warn(`  No providers found for intentKey=${intentKey} (matchKeys=${matchKeys.join(", ")})`);
    }
    if (resources.length > 0) {
      for (const r of resources) {
        this.logger.log(`  resource: [${r.kind}] ${r.label} — ${r.source}`);
      }
    }

    return {
      actionId,
      intentKey,
      enrichment: {
        providers,
        resources,
        guidance: null,
      },
    };
  }

  // ── Provider query ──────────────────────────────────────────────────────────

  private async queryProviders(
    matchKeys: string[],
    location: { lat: number; lng: number },
    radiusMeters: number,
  ): Promise<ProviderCard[]> {
    this.logger.log(`  queryProviders matchKeys=${matchKeys.join(", ")} radiusMeters=${radiusMeters}`);
    try {
      const [businesses, places] = await Promise.all([
        this.prisma.business.findMany({
          where: {
            isActive: true,
            moderationStatus: "APPROVED",
            taxonomies: { some: { key: { in: matchKeys } } },
          },
          include: { taxonomies: { select: { key: true } } },
          take: 20,
        }),
        this.prisma.place.findMany({
          where: {
            taxonomy: { key: { in: matchKeys } },
          },
          select: {
            id: true,
            latitude: true,
            longitude: true,
            googleSnapshot: true,
            taxonomy: { select: { key: true } },
          },
          take: 20,
        }),
      ]);

      const now = new Date().toISOString();

      const bizCards: Array<ProviderCard & { distanceMeters: number }> = businesses
        .filter((b) => b.latitude !== null && b.longitude !== null)
        .map((b) => ({
          providerId: `biz_${b.id}`,
          name: b.name ?? "Unknown",
          category: b.taxonomies.find((t) => matchKeys.includes(t.key))?.key ?? matchKeys[0],
          distance: "",
          open: this.isOpen(b.operatingHours),
          closingTime: this.getClosingTime(b.operatingHours),
          reputationScore: b.reputationScore,
          reputationLabel: reputationLabel(b.reputationScore),
          phone: b.phone ?? null,
          lat: b.latitude ?? null,
          lng: b.longitude ?? null,
          matchedAt: now,
          distanceMeters: haversineMeters(location.lat, location.lng, b.latitude!, b.longitude!),
        }))
        .filter((b) => b.distanceMeters <= radiusMeters);

      const placeCards: Array<ProviderCard & { distanceMeters: number }> = places
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => {
          const snap = p.googleSnapshot;
          const rawRating = snap?.rating;
          const reputationScore = rawRating != null ? (rawRating / 5) * 100 : null;
          return {
            providerId: `plc_${p.id}`,
            name: snap?.name ?? "Unknown",
            category: p.taxonomy?.key ?? matchKeys[0],
            distance: "",
            open: false,
            closingTime: null,
            reputationScore,
            reputationLabel: reputationLabel(reputationScore),
            phone: snap?.internationalPhone ?? null,
            lat: p.latitude ?? null,
            lng: p.longitude ?? null,
            matchedAt: now,
            distanceMeters: haversineMeters(location.lat, location.lng, p.latitude!, p.longitude!),
          };
        })
        .filter((p) => p.distanceMeters <= radiusMeters);

      return [...bizCards, ...placeCards]
        .sort((a, b) => {
          // Primary: reputationScore DESC, Secondary: distance ASC
          const scoreDiff = (b.reputationScore ?? 0) - (a.reputationScore ?? 0);
          if (scoreDiff !== 0) return scoreDiff;
          return a.distanceMeters - b.distanceMeters;
        })
        .slice(0, 3)
        .map(({ distanceMeters, ...card }) => ({
          ...card,
          distance: metersToMiles(distanceMeters),
        }));
    } catch (err) {
      this.logger.error(
        `Provider query failed for matchKeys=${matchKeys.join(", ")}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  // ── Resource URL construction ───────────────────────────────────────────────

  private async buildResources(
    intentKey: string,
    location: { lat: number; lng: number },
    parseId: string,
  ): Promise<ResourceLink[]> {
    try {
      const templates = (await this.prisma.resourceTemplate.findMany({
        where: { intentKey, isActive: true },
      })) as unknown as ResourceTemplateRow[];

      const serviceBaseUrl =
        this.config.get("SERVICE_PUBLIC_BASE_URL", { infer: true }) ?? "";
      const inAppEnabled = this.config.get("BLUEPRINTS_ENABLE_INAPP_RESOURCES", {
        infer: true,
      });

      const mapped = templates.map((t): ResourceLink | null => {
        const resourceType = t.resourceType ?? "EXTERNAL_URL";

        if (inAppEnabled && resourceType === "INAPP_ACTION") {
          if (!t.actionKey) {
            this.logger.warn(`In-app action template ${t.id} missing actionKey — omitting`);
            return null;
          }

          let params: Record<string, unknown> | undefined;
          if (t.actionParams) {
            try {
              params = JSON.parse(t.actionParams) as Record<string, unknown>;
            } catch {
              this.logger.warn(`In-app action template ${t.id} has invalid actionParams JSON`);
            }
          }

          return {
            label: t.label,
            source: t.source,
            kind: (t.kind as ResourceLink["kind"]) ?? "inapp",
            type: "inapp_action",
            action: {
              actionKey: t.actionKey,
              params,
            },
          };
        }

        if (inAppEnabled && resourceType === "INAPP_DEEPLINK") {
          if (!t.deeplink) {
            this.logger.warn(`In-app deeplink template ${t.id} missing deeplink route — omitting`);
            return null;
          }

          let params: Record<string, unknown> | undefined;
          if (t.deeplinkParams) {
            try {
              params = JSON.parse(t.deeplinkParams) as Record<string, unknown>;
            } catch {
              this.logger.warn(`In-app deeplink template ${t.id} has invalid deeplinkParams JSON`);
            }
          }

          return {
            label: t.label,
            source: t.source,
            kind: (t.kind as ResourceLink["kind"]) ?? "inapp",
            type: "inapp_deeplink",
            deeplink: {
              route: t.deeplink,
              params,
            },
          };
        }

        if (!t.urlTemplate) {
          this.logger.warn(`External resource template ${t.id} missing urlTemplate — omitting`);
          return null;
        }

        let resolvedUrl: string;
        try {
          resolvedUrl = substituteTemplate(t.urlTemplate, location);
        } catch {
          this.logger.warn(`URL template substitution failed for template ${t.id} — omitting`);
          return null;
        }

        const trackingUrl =
          `${serviceBaseUrl}/blueprints/resources/open` +
          `?t=${t.id}&pid=${encodeURIComponent(parseId)}&dest=${encodeURIComponent(resolvedUrl)}`;

        return {
          label: t.label,
          url: trackingUrl,
          source: t.source,
          kind: t.kind as ResourceLink["kind"],
          type: "external_url",
        };
      });

      return mapped.filter((r): r is ResourceLink => r !== null);
    } catch (err) {
      this.logger.error(
        `Resource template fetch failed for ${intentKey}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  // ── Operating hours helpers ─────────────────────────────────────────────────

  private isOpen(operatingHours: unknown): boolean {
    if (!operatingHours || typeof operatingHours !== "object") return false;
    const hours = operatingHours as Record<string, { open: string; close: string } | null>;
    const now = new Date();
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const todayHours = hours[dayName];
    if (!todayHours) return false;
    if (todayHours.open === "00:00" && todayHours.close === "00:00") return true; // 24/7
    const currentTime = now.toTimeString().slice(0, 5);
    return currentTime >= todayHours.open && currentTime <= todayHours.close;
  }

  private getClosingTime(operatingHours: unknown): string | null {
    if (!operatingHours || typeof operatingHours !== "object") return null;
    const hours = operatingHours as Record<string, { open: string; close: string } | null>;
    const now = new Date();
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const todayHours = hours[dayName];
    if (!todayHours) return null;
    if (todayHours.open === "00:00" && todayHours.close === "00:00") return "Open 24/7";
    return todayHours.close ?? null;
  }

  // ── Empty result helper ─────────────────────────────────────────────────────

  private emptyResult(actionId: string, intentKey: string): EnrichResult {
    return {
      actionId,
      intentKey,
      enrichment: { providers: [], resources: [], guidance: null },
    };
  }
}
