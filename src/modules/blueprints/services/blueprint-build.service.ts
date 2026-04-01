import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import { Env } from "@/config/env";
import { PrismaService } from "@/prisma/prisma.service";
import {
  ParsedNode,
  ParseLocations,
  BuildAction,
  BuildPhase,
  BuildResult,
  TimeframeBucket,
  ActionAssignee,
  DteNodeMetadata,
  IntentNodeMetadata,
} from "../types/blueprints.types";

// ── AI response schema ────────────────────────────────────────────────────────

const copyResponseSchema = z.object({
  subtitle: z.string(),
  actionWhy: z.record(z.string(), z.string()),
});

// ── Urgency → timeframe bucket ────────────────────────────────────────────────

function urgencyToBucket(urgencyLevel: string | undefined): TimeframeBucket {
  switch (urgencyLevel) {
    case "immediate":
    case "urgent":
      return "0-24h";
    case "soon":
      return "24-72h";
    case "short_term":
      return "1-2 weeks";
    default:
      return "ongoing";
  }
}

const BUCKET_ORDER: TimeframeBucket[] = ["0-24h", "24-72h", "1-2 weeks", "ongoing"];
const MAX_BLUEPRINT_ACTIONS = 4;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BlueprintBuildService {
  private readonly logger = new Logger(BlueprintBuildService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get("OPENAI_API_KEY", { infer: true }),
    });
    this.model = this.config.get("OPENAI_MODEL", { infer: true });
  }

  async build(params: {
    parseId: string;
    nodes: ParsedNode[];
    locations: ParseLocations;
    rawInput: string;
    memorialId?: string;
    locale?: string;
  }): Promise<BuildResult> {
    const { parseId, nodes, locations, rawInput, memorialId } = params;
    const localeCountry = params.locale?.split("-")[1]?.toUpperCase() ?? "US";

    const dteNodes = nodes.filter((n) => n.kind === "DTE" && n.status === "confirmed");
    const locationLabel = this.formatLocationLabel(locations.user);

    this.logger.log(
      `Build started — parseId=${parseId} nodes=${nodes.length} (DTE confirmed: ${dteNodes.map((n) => n.key).join(", ") || "none"})`,
    );

    // Step 1: Collect intent keys from DTE metadata (when DTE nodes are present)
    const phaseMap = new Map<TimeframeBucket, { dteKeys: string[]; urgencyLevel: string; metadata: DteNodeMetadata[] }>();
    const allIntentKeys = new Set<string>();
    const intentKeyToPhase = new Map<string, TimeframeBucket>();
    const dteUrgencyBuckets = new Map<string, TimeframeBucket>(); // intentKey → DTE-derived fallback bucket
    const dteFallbackKeys = new Set<string>();

    if (dteNodes.length > 0) {
      const foundKeys = await this.prisma.taxonomyNode
        .findMany({
          where: { key: { in: dteNodes.map((n) => n.key) }, kind: "DTE" },
          select: { key: true, metadata: true },
        })
        .then((rows) =>
          Object.fromEntries(rows.map((r) => [r.key, r.metadata as unknown as DteNodeMetadata])),
        );

      this.logger.log(
        `DTE metadata resolved: ${Object.keys(foundKeys).join(", ") || "none"} (requested: ${dteNodes.map((n) => n.key).join(", ")})`,
      );

      for (const dte of dteNodes) {
        const meta = foundKeys[dte.key];
        if (!meta) {
          this.logger.warn(`DTE node ${dte.key} not found in taxonomy — skipping`);
          continue;
        }

        this.logger.log(`  DTE ${dte.key} → urgency=${meta.urgencyLevel} intentKeys=${(meta.intentKeys ?? []).join(", ") || "none"}`);

        const bucket = urgencyToBucket(meta.urgencyLevel);

        if (bucket === "ongoing") {
          const existing = phaseMap.get("ongoing");
          phaseMap.set("ongoing", {
            dteKeys: [...(existing?.dteKeys ?? []), dte.key],
            urgencyLevel: meta.urgencyLevel ?? "ongoing",
            metadata: [...(existing?.metadata ?? []), meta],
          });
        } else {
          const existing = phaseMap.get(bucket);
          phaseMap.set(bucket, {
            dteKeys: [...(existing?.dteKeys ?? []), dte.key],
            urgencyLevel: meta.urgencyLevel ?? bucket,
            metadata: [...(existing?.metadata ?? []), meta],
          });
        }
      }

      for (const [bucket, phase] of phaseMap.entries()) {
        for (const meta of phase.metadata) {
          for (const intentKey of meta.intentKeys ?? []) {
            if (!allIntentKeys.has(intentKey)) {
              allIntentKeys.add(intentKey);
              dteUrgencyBuckets.set(intentKey, bucket); // store as fallback; phaseHint takes precedence
            }
          }
        }
      }
    }

    // Step 2: Layer in INTENT nodes passed directly from parse (always, not gated on DTE)
    for (const n of nodes.filter((n) => n.kind === "INTENT" && n.status === "confirmed")) {
      if (!allIntentKeys.has(n.key)) {
        allIntentKeys.add(n.key);
      }
    }

    // Step 2b: If nothing was confirmed, promote provisional INTENT nodes as fallback
    if (allIntentKeys.size === 0) {
      for (const n of nodes.filter((n) => n.kind === "INTENT" && n.status === "provisional")) {
        if (!allIntentKeys.has(n.key)) {
          allIntentKeys.add(n.key);
        }
      }
      if (allIntentKeys.size > 0) {
        this.logger.warn(
          `No confirmed intents; using provisional intents as fallback: ${[...allIntentKeys].join(", ")}`,
        );
      }
    }

    // Step 2.3: DTE inference — when no DTE was confirmed but intents exist, expand from best-matching DTE
    if (dteNodes.length === 0 && allIntentKeys.size > 0) {
      await this.inferDte(allIntentKeys, dteUrgencyBuckets);
    }

    // Step 2c: If still empty, synthesize fallback actions from DTE keys
    if (allIntentKeys.size === 0) {
      const fallbackDtes = nodes.filter(
        (n) => n.kind === "DTE" && (n.status === "confirmed" || n.status === "provisional"),
      );

      for (const dte of fallbackDtes) {
        const bucketFromPhase = [...phaseMap.entries()].find(([, phase]) =>
          phase.dteKeys.includes(dte.key),
        )?.[0];

        const bucket = bucketFromPhase ?? "24-72h";
        if (!allIntentKeys.has(dte.key)) {
          allIntentKeys.add(dte.key);
          dteUrgencyBuckets.set(dte.key, bucket);
          dteFallbackKeys.add(dte.key);
        }
      }

      if (allIntentKeys.size > 0) {
        this.logger.warn(
          `No intentKeys mapped from taxonomy metadata; synthesizing fallback actions from DTE nodes: ${[...dteFallbackKeys].join(", ")}`,
        );
      }
    }

    // Step 2.5: Expand prerequisites transitively and assign buckets from Action.phaseHint
    await this.expandPrerequisites(allIntentKeys, intentKeyToPhase, dteUrgencyBuckets, localeCountry);

    this.logger.log(
      `Intent keys after expansion: ${[...allIntentKeys].join(", ") || "none"}`,
    );

    // Step 3: Gate the rest of the pipeline on having at least one intent
    if (allIntentKeys.size > 0) {

      // Fetch all INTENT nodes in one query
      const intentNodes = await this.prisma.taxonomyNode.findMany({
        where: { key: { in: [...allIntentKeys] }, kind: "INTENT" },
        select: { key: true, name: true, metadata: true },
      });

      this.logger.log(
        `INTENT nodes found in DB: ${intentNodes.map((n) => n.key).join(", ") || "none"} (of ${allIntentKeys.size} requested)`,
      );

      const intentMap = Object.fromEntries(
        intentNodes.map((n) => [
          n.key,
          { name: n.name, meta: n.metadata as unknown as IntentNodeMetadata },
        ]),
      );

      // DTE fallback actions use DTE display names with default organizer ownership.
      if (dteFallbackKeys.size > 0) {
        const dteFallbackNodes = await this.prisma.taxonomyNode.findMany({
          where: { key: { in: [...dteFallbackKeys] }, kind: "DTE" },
          select: { key: true, name: true },
        });

        for (const dte of dteFallbackNodes) {
          intentMap[dte.key] = {
            name: dte.name,
            meta: {
              defaultAssignee: "organizer",
              categoryKeys: [],
            },
          };
        }
      }

      // Step 4+5: Build action skeletons per phase
      const phases: BuildPhase[] = [];

      for (const bucket of BUCKET_ORDER) {
        const phaseData = phaseMap.get(bucket);
        // Include any bucket that has at least one intent key assigned to it
        const hasIntents = [...intentKeyToPhase.entries()].some(([, b]) => b === bucket);
        if (!phaseData && !hasIntents) continue;

        const phaseIntentKeys = [...intentKeyToPhase.entries()]
          .filter(([, b]) => b === bucket)
          .map(([key]) => key);

        if (phaseIntentKeys.length === 0 && !phaseData) continue;

        const actions = await this.buildActions(
          phaseIntentKeys,
          intentMap,
          locationLabel,
          locations,
          bucket,
          localeCountry,
        );

        if (actions.length === 0) continue;

        // Detect parallel tracks: 2+ critical-priority actions with no dep between them
        const tracks = this.detectTracks(actions);

        phases.push({
          id: `phase_${bucket.replace(/-/g, "_").replace(/\s/g, "_")}`,
          bucket,
          label: this.bucketLabel(bucket),
          subtitle: "", // filled by AI copy step
          urgency: phaseData?.urgencyLevel ?? "medium",
          tracks,
          actions,
        });
      }

      // Step 6: Cap total actions to MAX_BLUEPRINT_ACTIONS across all phases (earliest phases first)
      let actionsRemaining = MAX_BLUEPRINT_ACTIONS;
      for (const phase of phases) {
        if (actionsRemaining <= 0) {
          phase.actions = [];
        } else {
          phase.actions = phase.actions.slice(0, actionsRemaining);
          actionsRemaining -= phase.actions.length;
        }
      }
      // Remove phases emptied by the cap; clean up orphaned track references
      const cappedPhases = phases.filter((p) => p.actions.length > 0);
      for (const phase of cappedPhases) {
        const survivingIds = new Set(phase.actions.map((a) => a.id));
        phase.tracks = phase.tracks
          .map((track) => track.filter((id) => survivingIds.has(id)))
          .filter((t) => t.length >= 2);
      }
      phases.length = 0;
      phases.push(...cappedPhases);

      // Step 7: Generate AI copy for each phase
      await this.generateCopy(phases, rawInput);
      console.log(phases)
      const pecFilteredPhases = await this.applyPecValidation(
        phases,
        rawInput,
        memorialId,
      );
      console.log("Phases after PEC filtering:", pecFilteredPhases);
      // Persist blueprint
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const blueprint = await this.prisma.blueprint.create({
        data: {
          parseId,
          rawInput,
          dteKeys: dteNodes.map((n) => n.key),
          intentKeys: [...allIntentKeys],
          userLat: locations.user?.lat ?? null,
          userLng: locations.user?.lng ?? null,
          phases: pecFilteredPhases as any[],
          expiresAt,
        },
      });

      this.logger.log(
        `Build complete — blueprintId=${blueprint.id} phases=${phases.length} totalActions=${phases.reduce((s, p) => s + p.actions.length, 0)}`,
      );

      return {
        buildId: randomUUID(),
        blueprintId: blueprint.id,
        phases: pecFilteredPhases,
      };
    }

    // No intent keys at all — return empty blueprint
    const blueprint = await this.prisma.blueprint.create({
      data: {
        parseId,
        rawInput,
        dteKeys: [],
        intentKeys: [],
        userLat: locations.user?.lat ?? null,
        userLng: locations.user?.lng ?? null,
        phases: [],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    this.logger.warn(`Build complete — no intent keys resolved, returning empty blueprint`);
    return { buildId: randomUUID(), blueprintId: blueprint.id, phases: [] };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async buildActions(
    intentKeys: string[],
    intentMap: Record<string, { name: string; meta: IntentNodeMetadata }>,
    locationLabel: string,
    locations: ParseLocations,
    bucket: TimeframeBucket,
    localeCountry: string,
  ): Promise<BuildAction[]> {
    const localeFilter = localeCountry
      ? [{ locale: "" }, { locale: localeCountry }]
      : [{ locale: "" }];

    const actionRows = await this.prisma.action.findMany({
      where: {
        intentKey: { in: intentKeys },
        isActive: true,
        OR: localeFilter,
      },
      select: {
        intentKey: true,
        title: true,
        defaultAssignee: true,
        locale: true,
        dependsOnIntentKeys: true,
        taxonomies: true,
        phaseHint: true,
      },
    });

    type ActionRow = (typeof actionRows)[number];

    // Prefer locale-specific over universal for the same intentKey.
    const actionTableMap = new Map<string, ActionRow>();
    for (const row of actionRows) {
      const existing = actionTableMap.get(row.intentKey);
      if (!existing || (row.locale !== "" && existing.locale === "")) {
        actionTableMap.set(row.intentKey, row);
      }
    }

    const actionIds = new Map<string, string>(); // intentKey → actionId
    const actions: BuildAction[] = [];

    for (let i = 0; i < intentKeys.length; i++) {
      const intentKey = intentKeys[i];
      const intent = intentMap[intentKey];
      if (!intent) {
        this.logger.warn(`INTENT node ${intentKey} not found in taxonomy — skipping`);
        continue;
      }

      const id = `act_${randomUUID()}`;
      actionIds.set(intentKey, id);

      const actionRow = actionTableMap.get(intentKey);
      let what: string;
      let assignee: ActionAssignee;

      if (actionRow) {
        what = this.injectLocation(actionRow.title, locations);
        const raw = actionRow.defaultAssignee;
        assignee = raw === "family_member" ? "organizer" : (raw as ActionAssignee);
      } else {
        this.logger.warn(`No Action row for intentKey=${intentKey} — fallback to TaxonomyNode.name`);
        what = intent.name;
        const raw: ActionAssignee = intent.meta?.defaultAssignee ?? "anyone";
        assignee = raw === "family member" ? "organizer" : raw;
      }

      actions.push({
        id,
        intentKey,
        what,
        why: "", // filled by AI copy
        order: i + 1,
        assignee,
        dependsOn: [],
        location: locationLabel,
        status: "pending",
        enrichment: { providers: null, resources: null, guidance: null },
      });
    }

    // Resolve dependencies from Action table only.
    for (const action of actions) {
      const actionRow = actionTableMap.get(action.intentKey);
      if (actionRow?.dependsOnIntentKeys?.length) {
        action.dependsOn = actionRow.dependsOnIntentKeys
          .map((depKey) => actionIds.get(depKey))
          .filter((id): id is string => id !== undefined);
      }
    }

    return actions;
  }

  private async inferDte(
    allIntentKeys: Set<string>,
    dteUrgencyBuckets: Map<string, TimeframeBucket>,
  ): Promise<void> {
    const dtes = await this.prisma.taxonomyNode.findMany({
      where: { kind: "DTE", isActive: true },
      select: { key: true, metadata: true },
    });

    let bestDte: { key: string; metadata: DteNodeMetadata } | null = null;
    let bestOverlap = 0;

    for (const dte of dtes) {
      const meta = dte.metadata as unknown as DteNodeMetadata;
      if (!meta?.intentKeys?.length) continue;
      const overlap = meta.intentKeys.filter((k) => allIntentKeys.has(k)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestDte = { key: dte.key, metadata: meta };
      }
    }

    if (!bestDte || bestOverlap === 0) return;

    const bucket = urgencyToBucket(bestDte.metadata.urgencyLevel);
    let added = 0;
    for (const intentKey of bestDte.metadata.intentKeys ?? []) {
      if (!allIntentKeys.has(intentKey)) {
        allIntentKeys.add(intentKey);
        dteUrgencyBuckets.set(intentKey, bucket);
        added++;
      }
    }

    this.logger.log(
      `DTE inference: matched ${bestDte.key} (overlap=${bestOverlap}) → added ${added} intent keys`,
    );
  }

  private async expandPrerequisites(
    allIntentKeys: Set<string>,
    intentKeyToPhase: Map<string, TimeframeBucket>,
    dteUrgencyBuckets: Map<string, TimeframeBucket>,
    localeCountry: string,
  ): Promise<void> {
    const queried = new Set<string>();
    const localeFilter = localeCountry
      ? [{ locale: "" }, { locale: localeCountry }]
      : [{ locale: "" }];

    for (let depth = 0; depth < 5; depth++) {
      const toQuery = [...allIntentKeys].filter((k) => !queried.has(k));
      if (toQuery.length === 0) break;

      for (const k of toQuery) queried.add(k);

      const rows = await this.prisma.action.findMany({
        where: { intentKey: { in: toQuery }, isActive: true, OR: localeFilter },
        select: { intentKey: true, locale: true, phaseHint: true, dependsOnIntentKeys: true },
      });

      // Prefer locale-specific phaseHint over universal
      const rowMap = new Map<string, { locale: string; phaseHint: string; dependsOnIntentKeys: string[] }>();
      for (const row of rows) {
        const existing = rowMap.get(row.intentKey);
        if (!existing || (row.locale !== "" && existing.locale === "")) {
          rowMap.set(row.intentKey, row);
        }
      }

      let newKeysAdded = false;
      for (const key of toQuery) {
        const row = rowMap.get(key);
        if (!intentKeyToPhase.has(key)) {
          intentKeyToPhase.set(
            key,
            row ? (row.phaseHint as TimeframeBucket) : (dteUrgencyBuckets.get(key) ?? "24-72h"),
          );
        }
        if (row) {
          for (const depKey of row.dependsOnIntentKeys) {
            if (!allIntentKeys.has(depKey)) {
              allIntentKeys.add(depKey);
              newKeysAdded = true;
            }
          }
        }
      }

      if (!newKeysAdded) break;
    }
  }

  private detectTracks(actions: BuildAction[]): string[][] {
    // Find critical-priority actions (order=1, no deps) — use first 3 with no deps as parallel
    const criticalNoDeps = actions
      .filter((a) => a.order <= 2 && a.dependsOn.length === 0)
      .slice(0, 3);

    if (criticalNoDeps.length >= 2) {
      return [criticalNoDeps.map((a) => a.id)];
    }
    return [];
  }

  private async generateCopy(phases: BuildPhase[], rawInput: string): Promise<void> {
    await Promise.allSettled(
      phases.map(async (phase) => {
        try {
          const actionList = phase.actions
            .map((a) => `- ${a.intentKey}: ${a.what}`)
            .join("\n");

          const prompt = `You are writing copy for a grief-support action plan.

Phase: ${phase.label} (urgency: ${phase.urgency})
Actions:
${actionList}

Return JSON only:
{
  "subtitle": "1-2 sentences acknowledging emotional reality then directing action",
  "actionWhy": {
    "<intentKey>": "<why string, max 20 words, no provider names>"
  }
}`;

          const completion = await this.openai.chat.completions.create({
            model: this.model,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
            temperature: 0.4,
          });

          const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
          const result = copyResponseSchema.parse(raw);

          phase.subtitle = result.subtitle;
          for (const action of phase.actions) {
            action.why = result.actionWhy[action.intentKey] ?? action.what;
          }
        } catch (err) {
          this.logger.warn(
            `Copy generation failed for phase ${phase.id}: ${(err as Error).message} — using fallback`,
          );
          phase.subtitle = phase.label;
          for (const action of phase.actions) {
            action.why = action.what;
          }
        }
      }),
    );
  }

  private bucketLabel(bucket: TimeframeBucket): string {
    switch (bucket) {
      case "0-24h":
        return "Right now";
      case "24-72h":
        return "In the next few days";
      case "1-2 weeks":
        return "Over the next couple of weeks";
      case "ongoing":
        return "Ongoing";
    }
  }

  private formatLocationLabel(loc: ParseLocations["user"]): string {
    if (!loc) return "";
    if (loc.city && loc.state) return `${loc.city}, ${loc.state}`;
    if (loc.city) return loc.city;
    if (loc.state) return loc.state;
    return "";
  }

  private injectLocation(title: string, locations: ParseLocations): string {
    return title
      .replace("{event.city}", locations.event?.city ?? "")
      .replace("{user.city}", locations.user?.city ?? "")
      .replace("{event.state}", locations.event?.state ?? "")
      .trim();
  }

  private async applyPecValidation(
    phases: BuildPhase[],
    _rawInput: string,
    _memorialId?: string,
  ): Promise<BuildPhase[]> {
    // Blueprint actions come from the trusted Action table, not AI-generated content.
    // PEC validation belongs at parse time (classifying user input), not here.
    return phases;
  }
}
