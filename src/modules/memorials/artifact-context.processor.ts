import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ArtifactContextStatus, ArtifactType } from "@prisma/client";
import { Job } from "bullmq";
import OpenAI from "openai";
import { z } from "zod";
import { Env } from "@/config/env";
import { PrismaService } from "@/prisma/prisma.service";
import { ContentServiceClient } from "@/common/http-client/content-service.client";
import {
  ArtifactContext,
  artifactContextSchema,
} from "@/common/types/artifact-context.types";
import { AssetVariantResponse } from "@/common/http-client/content-service.client";

export interface ArtifactContextJobData {
  artifactId: string;
}

@Injectable()
@Processor("artifact-context", { concurrency: 3 })
export class ArtifactContextProcessor extends WorkerHost {
  private readonly logger = new Logger(ArtifactContextProcessor.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: ContentServiceClient,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
    this.openai = new OpenAI({
      apiKey: this.config.get("OPENAI_API_KEY", { infer: true }),
    });
  }

  async process(job: Job<ArtifactContextJobData>): Promise<void> {
    const { artifactId } = job.data;
    this.logger.log(
      `Processing artifact context artifactId=${artifactId} attempt=${job.attemptsMade + 1}`,
    );

    if (!this.config.get("ARTIFACT_CONTEXT_ENABLED", { infer: true })) {
      this.logger.debug(
        `Artifact context processing disabled; skipping artifactId=${artifactId}`,
      );
      return;
    }

    await this.prisma.artifact.update({
      where: { id: artifactId },
      data: { contextStatus: ArtifactContextStatus.PROCESSING },
    });

    const artifact = await this.prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { memory: { select: { body: true } } },
    });

    if (!artifact) {
      this.logger.warn(`Artifact ${artifactId} not found — skipping`);
      return;
    }

    if (!artifact.assetId) {
      this.logger.warn(`Artifact ${artifactId} has no assetId — skipping`);
      return;
    }

    const submitterCaption = artifact.memory?.body ?? "";

    try {
      let context: ArtifactContext;

      if (artifact.type === ArtifactType.IMAGE) {
        context = await this.processImage(artifact.assetId, submitterCaption);
      } else if (artifact.type === ArtifactType.VIDEO) {
        context = await this.processVideo(artifact.assetId, submitterCaption);
      } else {
        this.logger.log(
          `Skipping unsupported artifact type=${artifact.type} for artifactId=${artifactId}`,
        );
        return;
      }

      await this.prisma.artifact.update({
        where: { id: artifactId },
        data: {
          context: context as object,
          contextStatus: ArtifactContextStatus.COMPLETE,
        },
      });

      this.logger.log(
        `Artifact context complete artifactId=${artifactId} confidence=${context.processingConfidence}`,
      );
    } catch (err) {
      this.logger.error(
        `Context extraction failed for artifactId=${artifactId}`,
        err,
      );
      throw err;
    }
  }

  @OnWorkerEvent("failed")
  async onFailed(
    job: Job<ArtifactContextJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 3;
    const isFinalFailure = job.attemptsMade >= maxAttempts;

    if (isFinalFailure) {
      this.logger.error(
        `Artifact context permanently failed after ${job.attemptsMade} attempts for artifactId=${job.data.artifactId}`,
        error.message,
      );
      await this.prisma.artifact
        .update({
          where: { id: job.data.artifactId },
          data: { contextStatus: ArtifactContextStatus.NEEDS_REVIEW },
        })
        .catch((dbErr) =>
          this.logger.error("Failed to set NEEDS_REVIEW status", dbErr),
        );
    }
  }

  // ─── Image processing ─────────────────────────────────────────────────────

  private async processImage(
    assetId: string,
    submitterCaption: string,
  ): Promise<ArtifactContext> {
    const variants: AssetVariantResponse[] = await this.contentService
      .getAssetVariants(assetId)
      .catch(() => []);

    const readUrl =
      variants.find((v) => v.variantType === "OPTIMIZED")?.readUrl ??
      variants.find((v) => v.variantType === "THUMBNAIL")?.readUrl;

    if (!readUrl) {
      throw new Error(`No readable URL found for image asset ${assetId}`);
    }

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: buildImageUserPrompt(submitterCaption) },
            { type: "image_url", image_url: { url: readUrl, detail: "high" } },
          ],
        },
      ],
    });

    return parseAndValidate(
      completion.choices[0]?.message?.content,
      artifactContextSchema,
    );
  }

  // ─── Video processing ─────────────────────────────────────────────────────

  private async processVideo(
    assetId: string,
    submitterCaption: string,
  ): Promise<ArtifactContext> {
    const variants: AssetVariantResponse[] = await this.contentService
      .getAssetVariants(assetId)
      .catch(() => []);

    // Keyframes sorted by timestamp (durationMs stores the source timestamp)
    const keyframeVariants = variants
      .filter((v) => v.variantType === "KEYFRAME")
      .sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0))
      .slice(0, 18);

    if (keyframeVariants.length === 0) {
      throw new Error(
        `No KEYFRAME variants found for video asset ${assetId} — Content Service may still be processing`,
      );
    }

    // Audio is optional — empty transcript is handled gracefully
    const audioVariant = variants.find((v) => v.variantType === "AUDIO_EXTRACT");
    const transcript = audioVariant?.readUrl
      ? await this.transcribeAudio(audioVariant.readUrl)
      : "";

    const imageMessages: OpenAI.Chat.ChatCompletionContentPart[] =
      keyframeVariants.map((v) => ({
        type: "image_url" as const,
        image_url: {
          url: v.readUrl,
          detail: "low" as const,
        },
      }));

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildVideoUserPrompt(submitterCaption, transcript),
            },
            ...imageMessages,
          ],
        },
      ],
    });

    return parseAndValidate(
      completion.choices[0]?.message?.content,
      artifactContextSchema,
    );
  }

  private async transcribeAudio(audioUrl: string): Promise<string> {
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        this.logger.warn(
          `Failed to download audio for Whisper: ${response.status}`,
        );
        return "";
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const file = new File([buffer], "audio.mp3", { type: "audio/mpeg" });

      const transcription = await this.openai.audio.transcriptions.create({
        model: "whisper-1",
        file,
        response_format: "text",
      });

      return typeof transcription === "string" ? transcription : "";
    } catch (err) {
      this.logger.warn("Whisper transcription failed — continuing without transcript", err);
      return "";
    }
  }
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an empathetic AI assistant helping to build living obituaries for people who have passed away. You will be shown media (photos or video keyframes) attached to a memory shared by someone who knew the deceased.

Your task is to extract structured context from the media that will enrich an AI-generated obituary. Respond ONLY with valid JSON matching the schema below. Do not include any text outside the JSON.

Schema:
{
  "description": "2-3 sentence neutral factual description of what is shown",
  "lifeStageHint": "early_life | young_adult | career | family | later_life | unknown",
  "toneHint": "celebratory | intimate | reflective | formal | everyday | unknown",
  "extractedFacts": ["array of concrete narrative facts directly observable from the media"],
  "themes": ["array of thematic labels e.g. 'milestone', 'celebration', 'togetherness', 'nature'"],
  "processingConfidence": 0.0,
  "needsHumanReview": false
}

Guidelines:
- extractedFacts must be directly observable. Do not speculate, infer, or embellish.
- Treat this person as a private individual regardless of any recognition.
- toneHint reflects the emotional register of the media itself, not the caption.
- If the media is blurry, has no identifiable subjects, or is ambiguous, set processingConfidence below 0.5 and needsHumanReview to true.
- processingConfidence is your confidence that the extracted context is accurate and useful (0.0–1.0).`;
}

function buildImageUserPrompt(submitterCaption: string): string {
  const captionLine = submitterCaption.trim()
    ? `The person who shared this photo wrote: "${submitterCaption.trim()}"\n\n`
    : "";
  return `${captionLine}Please analyze this photo and return the structured JSON context.`;
}

function buildVideoUserPrompt(
  submitterCaption: string,
  transcript: string,
): string {
  const captionLine = submitterCaption.trim()
    ? `The person who shared this video wrote: "${submitterCaption.trim()}"\n\n`
    : "";
  const transcriptLine = transcript.trim()
    ? `Audio transcript: "${transcript.trim()}"\n\n`
    : "No audio transcript was available.\n\n";
  return `${captionLine}${transcriptLine}The following images are keyframes sampled from the video (one per 10 seconds). Please analyze the visual content together with the transcript and return the structured JSON context.`;
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseAndValidate<T>(
  raw: string | null | undefined,
  schema: z.ZodSchema<T>,
): T {
  if (!raw) {
    throw new Error("Model returned no content");
  }

  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `Model response failed schema validation: ${JSON.stringify(parsed.error.issues)}`,
    );
  }

  return parsed.data;
}
