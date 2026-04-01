import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import { Env } from "@/config/env";
import { PrismaService } from "@/prisma/prisma.service";
import { GooglePlacesClient } from "@/modules/places/google-places.client";
import { ValidationService } from "@/modules/pec/validation.service";
import { ContextStoreService } from "@/modules/pec/context-store.service";
import {
  ParseResult,
  ParsedNode,
  NodeSuggestion,
  ParseLocation,
} from "../types/blueprints.types";

// ── AI response schema ────────────────────────────────────────────────────────

const parsedNodeSchema = z.object({
  key: z.string(),
  kind: z.enum(["DTE", "INTENT", "TAG"]),
  confidence: z.number().min(0).max(1),
});

const nodeSuggestionSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: z.enum(["DTE", "INTENT", "TAG"]),
  group: z.string().optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const locationSchema = z
  .object({
    city: z.string().optional(),
    state: z.string().optional(),
  })
  .nullable();

const aiResponseSchema = z.object({
  nodes: z.array(parsedNodeSchema),
  suggestions: z.array(nodeSuggestionSchema).default([]),
  locations: z
    .object({
      user: locationSchema,
      event: locationSchema,
    })
    .nullable()
    .transform((v) => v ?? { user: null, event: null }),
});

// ── Confidence thresholds ─────────────────────────────────────────────────────

const CONFIDENCE_CONFIRMED = 0.72;
const CONFIDENCE_PROVISIONAL = 0.45;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BlueprintParseService {
  private readonly logger = new Logger(BlueprintParseService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly googlePlacesClient: GooglePlacesClient,
    private readonly validationService: ValidationService,
    private readonly contextStore: ContextStoreService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get("OPENAI_API_KEY", { infer: true }),
    });
    this.model = this.config.get("OPENAI_MODEL", { infer: true });
  }

  async parse(params: {
    input: string;
    locale: string;
    location?: { lat: number; lng: number };
    memorialId?: string;
  }): Promise<ParseResult> {
    const { input, locale, location, memorialId } = params;
    const parseId = randomUUID();

    // 1. Load active taxonomy nodes (DTE, INTENT, TAG only)
    const taxonomyNodes = await this.prisma.taxonomyNode.findMany({
      where: { isActive: true, kind: { in: ["DTE", "INTENT", "TAG"] } },
      select: { key: true, name: true, kind: true },
    });

    const taxonomyMap = Object.fromEntries(
      taxonomyNodes.map((n) => [n.key, { name: n.name, kind: n.kind }]),
    );

    // 2. AI classification call
    const systemPrompt = this.buildSystemPrompt(taxonomyNodes);
    let aiResult: z.infer<typeof aiResponseSchema>;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Locale: ${locale}\n\nInput: ${input}`,
          },
        ],
        temperature: 0,
      });

      const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      aiResult = aiResponseSchema.parse(raw);
    } catch (err) {
      this.logger.error(`Parse AI call failed: ${(err as Error).message}`);
      // Return empty parse result on AI failure — never throw to client
      return {
        parseId,
        nodes: [],
        suggestions: [],
        locations: { user: null, event: null },
        rawInput: input,
      };
    }

    // 3. Apply confidence thresholds
    const candidateNodes = this.pickCandidateNodes(aiResult.nodes, taxonomyMap);
    const nodes = await this.applyPecValidation(
      candidateNodes,
      input,
      taxonomyMap,
      memorialId,
    );

    // 4. Log node suggestions to AuditLog (fire-and-forget)
    if (aiResult.suggestions.length > 0) {
      this.logNodeSuggestions(parseId, input, aiResult.suggestions).catch((err) => {
        this.logger.warn(`Failed to log node suggestions: ${(err as Error).message}`);
      });
    }

    // 5. Build locations — client-provided lat/lng takes precedence
    const userLocation = await this.buildLocation(aiResult.locations.user, location);
    const eventLocation = await this.buildLocation(aiResult.locations.event, undefined);

    return {
      parseId,
      nodes,
      suggestions: aiResult.suggestions,
      locations: {
        user: userLocation,
        event: eventLocation,
      },
      rawInput: input,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildSystemPrompt(
    nodes: Array<{ key: string; name: string; kind: string }>,
  ): string {
    const nodeList = nodes
      .map((n) => `${n.key} (${n.kind}): ${n.name}`)
      .join("\n");

    return `You are a grief-support intake assistant helping families navigate the death of a loved one.

Analyze the situation described and return the relevant taxonomy nodes.

WHAT TO RETURN:
1. DTE (Death-Triggering Event): Identify the cause or circumstance of death if stated or clearly implied. This is the most important classification — it drives the full action plan.
2. INTENT nodes: Return intents that are directly stated by the user (e.g., "she wanted to be cremated" → INTENT_CREMATION_SERVICES). Also return strongly implied intents (confidence ≥ 0.80). Do NOT try to enumerate every workflow step — the system expands those automatically from the DTE.

CONFIDENCE GUIDE:
- 0.90–1.0: Explicitly stated in the input
- 0.80–0.89: Directly implied by what was stated (cremation mentioned → also return INTENT_CHOOSE_DISPOSITION_METHOD, INTENT_SIGN_CREMATION_AUTHORIZATION)
- 0.72–0.79: Strongly expected given the DTE type (sudden/unexpected death → INTENT_AWAIT_ME_CLEARANCE)

RULES:
- Return ONLY keys that exist in the taxonomy below. Do not invent new keys.
- Focus on identifying the DTE accurately — it drives the full workflow.
- If a DTE is unclear, return the closest match as provisional (0.45–0.71).
- If part of the input cannot be mapped, describe the gap in "suggestions".
- Extract location: "user" = where the family is, "event" = where the death occurred (may differ).
- Return JSON only — no prose.

RESPONSE FORMAT:
{
  "nodes": [{ "key": "EXISTING_KEY", "kind": "DTE|INTENT|TAG", "confidence": 0.0-1.0 }],
  "suggestions": [{ "key": "PROPOSED_KEY", "name": "Human Name", "kind": "DTE|INTENT|TAG", "group": "optional", "confidence": 0.0-1.0, "reason": "why this gap exists" }],
  "locations": {
    "user": { "city": "...", "state": "..." } or null,
    "event": { "city": "...", "state": "..." } or null
  }
}

TAXONOMY:
${nodeList}`;
  }

  private pickCandidateNodes(
    aiNodes: z.infer<typeof parsedNodeSchema>[],
    taxonomyMap: Record<string, { name: string; kind: string }>,
  ): ParsedNode[] {
    const deduped = new Map<string, z.infer<typeof parsedNodeSchema>>();

    for (const node of aiNodes) {
      // Validate key actually exists in taxonomy
      if (!taxonomyMap[node.key]) {
        this.logger.warn(`AI returned unknown taxonomy key: ${node.key} — skipping`);
        continue;
      }

      if (node.confidence < CONFIDENCE_PROVISIONAL) continue;

      const existing = deduped.get(node.key);
      if (!existing || node.confidence > existing.confidence) {
        deduped.set(node.key, node);
      }
    }

    return Array.from(deduped.values()).map((node) => ({
      key: node.key,
      kind: node.kind,
      confidence: node.confidence,
      status: node.confidence >= CONFIDENCE_CONFIRMED ? "confirmed" : "provisional",
    }));
  }

  private async applyPecValidation(
    nodes: ParsedNode[],
    input: string,
    taxonomyMap: Record<string, { name: string; kind: string }>,
    memorialId?: string,
  ): Promise<ParsedNode[]> {
    if (nodes.length === 0) return nodes;

    const pecEnabled = this.config.get("PEC_ENABLED", { infer: true });
    if (!pecEnabled) return nodes;

    try {
      let entityContext: string | undefined;
      if (memorialId) {
        entityContext = await this.contextStore.serialiseValidatedContext(
          memorialId,
          "memorial",
          "family",
        );
      }

      const results = await this.validationService.validateBatch(
        nodes.map((node) => ({
          simulationId: node.key,
          sourceType: "taxonomy_node" as const,
          audienceLens: "family" as const,
          entityContext,
          content: [
            `Taxonomy key: ${node.key}`,
            `Kind: ${node.kind}`,
            `Name: ${taxonomyMap[node.key]?.name ?? node.key}`,
            `Classifier confidence: ${node.confidence.toFixed(2)}`,
            `Family input: "${input.slice(0, 400)}"`,
          ].join("\n"),
        })),
      );

      const byId = new Map(results.map((r) => [r.simulationId, r]));
      const filtered = nodes
        .map((node) => {
          const result = byId.get(node.key);
          if (!result || result.status === "consolidated") {
            return node;
          }

          if (result.status === "excluded") {
            this.logger.log(
              `PEC excluded parsed node ${node.key}: ${result.reason}`,
            );
            return null;
          }

          // Keep original classifier status to avoid collapsing DTE/INTENT coverage
          // during early PEC rollout.
          return node;
        })
        .filter((n): n is ParsedNode => n !== null);

      this.logger.log(
        `Parse PEC filter complete — kept=${filtered.length} excluded=${nodes.length - filtered.length}`,
      );

      return filtered;
    } catch (err) {
      this.logger.warn(
        `Parse PEC validation failed: ${(err as Error).message} — keeping classifier output`,
      );
      return nodes;
    }
  }

  private async buildLocation(
    aiLocation: { city?: string; state?: string } | null | undefined,
    explicit?: { lat: number; lng: number },
  ): Promise<ParseLocation | null> {
    if (!aiLocation && !explicit) return null;

    let city = aiLocation?.city;
    let state = aiLocation?.state;

    if (explicit && (!city || !state)) {
      const reverseGeocode = await this.googlePlacesClient.reverseGeocode(
        explicit.lat,
        explicit.lng,
      );
      city = city ?? reverseGeocode.city;
      state = state ?? reverseGeocode.state;
    }

    return {
      city: city ?? undefined,
      state: state ?? undefined,
      lat: explicit?.lat,
      lng: explicit?.lng,
      resolved: !!(explicit?.lat && explicit?.lng),
    };
  }

  private async logNodeSuggestions(
    parseId: string,
    sourceInput: string,
    suggestions: NodeSuggestion[],
  ): Promise<void> {
    await Promise.all(
      suggestions.map((s) =>
        this.prisma.auditLog.create({
          data: {
            subjectType: "node_suggestion",
            subjectId: parseId,
            action: "node_suggested",
            payload: {
              key: s.key,
              name: s.name,
              kind: s.kind,
              group: s.group,
              confidence: s.confidence,
              reason: s.reason,
              parseId,
              sourceInput: sourceInput.slice(0, 500),
            },
          },
        }),
      ),
    );
    this.logger.log(`Logged ${suggestions.length} node suggestion(s) for parse ${parseId}`);
  }
}
