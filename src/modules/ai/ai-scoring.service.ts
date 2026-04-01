import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from "zod";
import { Env } from "../../config/env";

export interface ReputationTrait {
  key: string;
  evidence?: string;
  confidence: number;
}

export interface ReputationScoreResult {
  reputationScore: number;
  sentiment: number;
  specificity: number;
  credibility: number;
  safety: number;
  relevance: number;
  urgency: number;
  anomalies: string[];
  traits: ReputationTrait[];
  model: string;
}

const traitSchema = z.object({
  key: z.string().min(1),
  evidence: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

const scoringSchema = z.object({
  reputationScore: z.number().min(0).max(100),
  sentiment: z.number().min(0).max(1),
  specificity: z.number().min(0).max(1),
  credibility: z.number().min(0).max(1),
  safety: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  anomalies: z.array(z.string()).default([]),
  traits: z.array(traitSchema).max(12).default([]),
});

@Injectable()
export class AiScoringService {
  private readonly logger = new Logger(AiScoringService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService<Env, true>) {
    this.openai = new OpenAI({
      apiKey: this.configService.get("OPENAI_API_KEY", { infer: true }),
    });
    this.model = this.configService.get("OPENAI_MODEL", { infer: true });
  }

  async scoreReview(input: {
    businessName: string;
    categories: string[];
    content: string;
  }): Promise<ReputationScoreResult | null> {
    if (!this.configService.get("AI_SCORING_ENABLED", { infer: true })) {
      this.logger.debug("AI scoring disabled; skipping");
      return null;
    }

    const prompt = this.buildPrompt(input);

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a strict JSON scorer. Output only JSON following the schema. No explanations.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        this.logger.warn("No content returned from model");
        return null;
      }

      const parsed = scoringSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.logger.warn("Model response failed validation", {
          issues: parsed.error.issues,
          raw,
        });
        return null;
      }

      const result = parsed.data;
      return {
        reputationScore: result.reputationScore,
        sentiment: result.sentiment,
        specificity: result.specificity,
        credibility: result.credibility,
        safety: result.safety,
        relevance: result.relevance,
        urgency: result.urgency,
        anomalies: result.anomalies,
        traits: result.traits,
        model: this.model,
      };
    } catch (error) {
      this.logger.error("Failed to score review", error as Error);
      return null;
    }
  }

  private buildPrompt(input: {
    businessName: string;
    categories: string[];
    content: string;
  }): string {
    return [
      "Rate this review with the following bounded scores and output JSON only:",
      "- reputationScore: 0-100 overall quality/reputation signal",
      "- sentiment: 0-1 (0 negative, 1 positive)",
      "- specificity: 0-1 (concrete details vs vague)",
      "- credibility: 0-1 (objective, non-exaggerated)",
      "- safety: 0-1 (1 safe, 0 unsafe/toxic)",
      "- relevance: 0-1 (to the business/service)",
      "- urgency: 0-1 (time pressure expressed)",
      "- anomalies: array of strings for suspicious issues (else empty)",
      "- traits: up to 12 items with {key, evidence, confidence 0-1}; keep keys concise (e.g., FAST_SERVICE, FRIENDLY_STAFF, HIGH_QUALITY, COMPASSIONATE, RELIABLE, GOOD_VALUE, GREAT_COMMUNICATION, FLEXIBLE_SCHEDULING, CLEAN, BILINGUAL, OPEN_24_7)",
      `Business name: ${input.businessName}`,
      `Categories: ${(input.categories || []).join(", ")}`,
      `Review: ${input.content}`,
      "Respond with JSON only",
    ].join("\n");
  }
}
