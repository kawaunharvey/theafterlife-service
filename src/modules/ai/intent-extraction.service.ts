import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from "zod";
import { Env } from "../../config/env";

export interface ExtractedIntent {
  categoryHints: string[];
  urgencyHours?: number | null;
  locationHint?: { city?: string | null; state?: string | null } | null;
  mustHaveTraits: string[];
  niceToHaveTraits: string[];
  language?: string | null;
}

const intentSchema = z.object({
  categoryHints: z.array(z.string()).default([]),
  urgencyHours: z.number().nullable().optional(),
  locationHint: z
    .object({
      city: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  mustHaveTraits: z.array(z.string()).default([]),
  niceToHaveTraits: z.array(z.string()).default([]),
  language: z.string().nullable().optional(),
});

@Injectable()
export class IntentExtractionService {
  private readonly logger = new Logger(IntentExtractionService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService<Env, true>) {
    this.openai = new OpenAI({
      apiKey: this.configService.get("OPENAI_API_KEY", { infer: true }),
    });
    this.model = this.configService.get("OPENAI_MODEL", { infer: true });
  }

  async extract(prompt: string): Promise<ExtractedIntent | null> {
    if (!this.configService.get("AI_MATCHING_ENABLED", { infer: true })) {
      return null;
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extract user needs into JSON with keys: categoryHints[], urgencyHours (number or null), locationHint{city,state}, mustHaveTraits[], niceToHaveTraits[], language (BCP47). Use concise snake-case trait keys.",
          },
          { role: "user", content: prompt },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        this.logger.warn("No content in OpenAI response");
        return null;
      }

      let jsonData;
      try {
        jsonData = JSON.parse(raw);
      } catch (parseError) {
        this.logger.error("Failed to parse OpenAI JSON response", {
          raw,
          parseError,
        });
        return null;
      }

      const parsed = intentSchema.safeParse(jsonData);
      if (!parsed.success) {
        this.logger.warn(
          `Intent extraction validation failed. Issues: ${JSON.stringify(parsed.error.issues, null, 2)}`,
        );
        this.logger.warn(
          `Raw JSON from AI: ${JSON.stringify(jsonData, null, 2)}`,
        );
        return null;
      }
      return parsed.data;
    } catch (error) {
      this.logger.error("Failed to extract intent", error as Error);
      return null;
    }
  }
}
