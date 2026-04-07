import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// ArtifactContext — structured output written by the artifact-context worker
// to Artifact.context (Json) after AI vision processing of media attached to
// memory posts. Consumed by the obituary generation pipeline.
// ─────────────────────────────────────────────────────────────────────────────

export const LIFE_STAGE_HINTS = [
  "early_life",
  "young_adult",
  "career",
  "family",
  "later_life",
  "unknown",
] as const;

export const TONE_HINTS = [
  "celebratory",
  "intimate",
  "reflective",
  "formal",
  "everyday",
  "unknown",
] as const;

export type LifeStageHint = (typeof LIFE_STAGE_HINTS)[number];
export type ToneHint = (typeof TONE_HINTS)[number];

export interface ArtifactContext {
  description: string;
  lifeStageHint: LifeStageHint;
  toneHint: ToneHint;
  extractedFacts: string[];
  themes: string[];
  processingConfidence: number;
  needsHumanReview: boolean;
}

export const artifactContextSchema = z.object({
  description: z.string().min(1),
  lifeStageHint: z.enum(LIFE_STAGE_HINTS),
  toneHint: z.enum(TONE_HINTS),
  extractedFacts: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  processingConfidence: z.number().min(0).max(1),
  needsHumanReview: z.boolean(),
});
