import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatOpenAI } from "@langchain/openai";
import { Job } from "bullmq";
import {
  LiveObituaryStatus,
  MemorialRelationshipKind,
  PostStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { Env } from "@/config/env";
import { PrismaService } from "@/prisma/prisma.service";
import { ValidationService } from "@/modules/pec/validation.service";
import { ContextStoreService } from "@/modules/pec/context-store.service";
import { MemoryEntry, ValidationStatus, QUALIFIER_TO_LENS } from "@/common/types/pec.types";
import { ObituaryBlock } from "@/common/types/obituary-block.types";

export interface ObituaryGenerationJobData {
  memorialId: string;
  relationshipKind: MemorialRelationshipKind;
}

@Injectable()
@Processor("obituary-generation")
export class ObituaryGeneratorProcessor extends WorkerHost {
  private readonly logger = new Logger(ObituaryGeneratorProcessor.name);
  private readonly llm: ChatOpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: ValidationService,
    private readonly contextStore: ContextStoreService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
    this.llm = new ChatOpenAI({
      modelName: this.config.get("OPENAI_MODEL", { infer: true }),
      temperature: 0.7,
      openAIApiKey: this.config.get("OPENAI_API_KEY", { infer: true }),
    });
  }

  async process(job: Job<ObituaryGenerationJobData>): Promise<void> {
    const { memorialId, relationshipKind } = job.data;
    this.logger.log(`Generating obituary for memorial=${memorialId} kind=${relationshipKind}`);

    try {
      const [memorial, memories] = await Promise.all([
        this.prisma.memorial.findUnique({
          where: { id: memorialId },
          select: { displayName: true, yearOfBirth: true, yearOfPassing: true, salutation: true },
        }),
        this.prisma.memory.findMany({
          where: { memorialId, status: PostStatus.PUBLISHED, relationship: relationshipKind },
          select: { body: true, relationship: true },
          orderBy: { publishedAt: "desc" },
        }),
      ]);

      if (!memorial || memories.length === 0) {
        this.logger.log(`Skipping — no memories yet for memorial=${memorialId}`);
        return;
      }

      const minMemories = this.config.get("OBITUARY_MIN_MEMORIES", { infer: true }) ?? 3;

      if (memories.length < minMemories) {
        this.logger.log(
          `Skipping — only ${memories.length}/${minMemories} memories for ${relationshipKind} on memorial=${memorialId}`,
        );
        return;
      }

      const memoryText = memories
        .map((m, i) => `Memory ${i + 1}:\n${m.body}`)
        .join("\n\n");

      const relationshipLabel = relationshipKind.replace(/_/g, " ").toLowerCase();
      const prompt = `You are writing a section of a living obituary for ${memorial.displayName}${memorial.yearOfBirth && memorial.yearOfPassing ? ` (${memorial.yearOfBirth}–${memorial.yearOfPassing})` : ""}.

The audience for this version is someone who knew the deceased as a ${relationshipLabel}.

The following memories were shared by people who knew them as a ${relationshipLabel}:

${memoryText}

Write a warm, personal obituary narrative (3–5 paragraphs) that weaves together these memories. Write in third person. Focus on what mattered most to someone in a ${relationshipLabel} relationship. You must use ONLY the memories above as your source material. Do not include any detail — however true, however widely known — that is not directly present in these memories. Treat this person as if they have no public record. Do not include funeral logistics.`;

      const systemMessage = `You are writing living obituaries — narrative portraits of real people, told through the memories of those who loved them.

CLOSED-WORLD CONSTRAINT — MANDATORY:

This obituary must be built exclusively from the submitted memories. The subject must be treated as a private individual regardless of their name, profession, or degree of public recognition.

- Do not draw on any knowledge from your training data, Wikipedia, news articles, published biographies, or any external record.
- Do not include any fact, detail, event, achievement, date, quote, or characterization that cannot be directly traced to the submitted memories — even if that detail is factually true and publicly known.
- The subject's name and the dates provided in the prompt header are the only pre-supplied facts you may use. Every other detail must originate from the memories.
- If the memories are silent on a topic, that topic does not exist for this obituary.

QUALITY STANDARDS:

1. Open with a hook, not a formula.
Never begin with "[Name] passed away on..." or any variation. Lead instead with something sensory, specific, or emotionally grounding — a recurring habit, a smell, a phrase they always said, a defining image. The first sentence should make the reader feel something before they have learned a single fact.

2. Capture texture, not just milestones.
Dates, titles, and survivors are necessary but not sufficient. The details that make an obituary memorable are small and specific: what they cooked, what they watched, what they called people, what they did every Sunday. Weight these heavily. Generic praise ("she was kind", "he was loved") is not enough — anchor every claim in a specific detail.

3. Mirror the person's actual tone.
A funny person deserves a funny obituary. A formal person deserves a dignified one. Infer the subject's personality from the memories provided and let that govern voice, sentence rhythm, and word choice. Never default to a generic solemn register if the memories suggest otherwise.

4. Write from multiple perspectives, even in one voice.
The strongest obituaries capture how the person existed in relation to others — what they were to people, not just what they did. Use contributed memories and stories as source material, not just biographical facts. Weave them into a single coherent voice rather than attributing each fragment.

5. Close with extension, not logistics.
The final lines should do more than wind down. End with something that invites continued participation — a quote, a last wish, an image of how they should be remembered, an action the reader can take in their honor. Do not end with service information or logistical details.

6. The test.
Before finalizing, ask yourself: does this make the reader wish they had known this person? If not, add more texture, more specificity, or a stronger opening. Facts alone do not pass this test.`;

      const response = await this.llm.invoke([
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ]);
      const generatedText = response.content as string;

      const paragraphBlocks: ObituaryBlock[] = generatedText
        .split("\n\n")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((text) => ({ type: "PARAGRAPH" as const, metadata: { text } }));

      const blocks: ObituaryBlock[] = [
        ...paragraphBlocks,
        { type: "SUMMARY" as const, metadata: { memoryCount: memories.length } },
      ];

      // PEC validation — use lens-appropriate context so coherence checks don't
      // reject a colleague obituary for "contradicting" family-centric entries.
      const lens = QUALIFIER_TO_LENS[relationshipKind.toLowerCase()] ?? "all";
      const serialisedContext = await this.contextStore
        .serialiseValidatedContext(memorialId, "memorial", lens)
        .catch(() => "(no validated context yet)");

      const result = await this.validationService.validate({
        simulationId: randomUUID(),
        content: generatedText,
        sourceType: "submission",
        entityContext: serialisedContext,
        audienceLens: lens,
        metadata: { relationshipKind },
      });

      // Dispatch to context store — scope to generation lens so this entry only
      // informs PEC coherence checks for the same audience in the future.
      const memoryEntry: MemoryEntry = {
        id: result.simulationId,
        content: generatedText,
        sourceType: "submission",
        sourceId: memorialId,
        status: result.status,
        confidence: result.overallConfidence,
        lensRestriction: result.lensRestriction?.length ? result.lensRestriction : [lens],
        validationResult: result,
        tags: [memorialId, relationshipKind],
        ...(result.status === "consolidated" ? { consolidatedAt: new Date() } : {}),
        ...(result.status === "provisional" ? { provisionalSince: new Date() } : {}),
      };

      await this.contextStore
        .dispatch(memorialId, "memorial", memoryEntry)
        .catch((err) =>
          this.logger.error("Failed to dispatch to context store", err),
        );

      const status = this.pecStatusToObituaryStatus(result.status);

      await this.prisma.liveObituary.upsert({
        where: { memorialId_relationshipKind: { memorialId, relationshipKind } },
        create: {
          memorialId,
          relationshipKind,
          plainText: generatedText,
          blocks: blocks as any,
          memoryCount: memories.length,
          status,
          pecConfidence: result.overallConfidence,
          pecChecks: result.checks as any,
          generatedAt: new Date(),
        },
        update: {
          plainText: generatedText,
          blocks: blocks as any,
          memoryCount: memories.length,
          status,
          pecConfidence: result.overallConfidence,
          pecChecks: result.checks as any,
          generatedAt: new Date(),
        },
      });

      this.logger.log(
        `Obituary upserted for memorial=${memorialId} kind=${relationshipKind} status=${status}`,
      );
    } catch (err) {
      this.logger.error(
        `Obituary generation failed for memorial=${memorialId} kind=${relationshipKind}`,
        err,
      );
      throw err; // BullMQ will retry
    }
  }

  private pecStatusToObituaryStatus(status: ValidationStatus): LiveObituaryStatus {
    switch (status) {
      case "consolidated":
        return LiveObituaryStatus.GENERATED;
      case "provisional":
        return LiveObituaryStatus.PROVISIONAL;
      case "excluded":
        return LiveObituaryStatus.EXCLUDED;
    }
  }
}
