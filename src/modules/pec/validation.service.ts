import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { Env } from '@/config/env';
import {
  ValidationInput,
  ValidationResult,
  ValidationCheck,
  ValidationStatus,
  CheckResult,
  AudienceLens,
  PEC_THRESHOLDS,
  safeProvisional,
} from '@/common/types/pec.types';

// ── Internals ─────────────────────────────────────────────────────────────────

interface RawCheckResult {
  name: string;
  result: string;
  confidence: number;
  reason: string;
}

interface RawValidationResult {
  simulationId: string;
  checks: RawCheckResult[];
  lensRestriction?: string[];
  suggestedTitle?: string;
  suggestedIntent?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The system prompt is stable — stored as a class field so it is never rebuilt
// per-request. OpenAI prompt caching kicks in automatically for prompts that
// exceed 1 024 tokens and remain identical across calls.
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a validation system for an afterlife coordination platform.

Your role: evaluate AI-generated outputs ("simulations") against four checks and return a structured JSON verdict.

CHECKS:

1. grounding
   Does the output contain specific evidence traceable to the source input?
   pass (0.8–1.0): Specific behaviors, named details, or direct observations present; all content is traceable to the source input.
   provisional (0.5–0.79): Some grounding but with notable inferences.
   fail (0.0–0.49): Generic assertions, template language, or no traceable basis in the input. For submission sources, also fail grounding if the output contains any detail that appears to originate from external training data or the subject's public record — even if factually accurate — rather than from the submitted source material.

2. coherence
   Does the output fit the existing validated context for this entity, and is it non-redundant within the current batch?
   pass (0.8–1.0): Additive, non-redundant, and fully consistent with confirmed facts.
   provisional (0.5–0.79): Partially consistent or marginally overlapping with another node in the batch.
   fail (0.0–0.49): Contradicts confirmed facts, OR is semantically redundant with another node already in the batch (e.g. INTENT_CREMATION_SERVICES and SVC_CREMATION cover the same concept — the lower-specificity node fails coherence).
   Note: when two nodes cover the same concept, prefer the more specific one (SERVICE > INTENT for concrete offerings; INTENT > SERVICE for abstract needs). Mark the redundant one as fail.

3. credibility
   Is the output structurally trustworthy given its source and construction?
   pass (0.8–1.0): Confidence matches evidence quality; structure is sound.
   provisional (0.5–0.79): Minor credibility concerns; mapping plausible but uncertain.
   fail (0.0–0.49): High confidence from ambiguous input; structural flaws; generic jurisdictional assumptions in legal tasks.

4. lens_fit
   Is the output appropriate for the active audience context?
   pass (0.8–1.0): Content appropriate for stated audience; roles correctly assigned.
   provisional (0.5–0.79): Uncertain audience appropriateness.
   fail (0.0–0.49): Sensitive details surfaced to wrong audience; tasks assigned to roles that cannot execute them.

OPTIONAL CORRECTIONS (blueprint_task sources only):
When sourceType is "blueprint_task", also evaluate the module's current title and intent against the family's specific situation and provide improved versions when they are generic or not grounded:
  "suggestedTitle": A short (3-7 word), empathetic, family-facing title grounded in the user's specific situation. Omit this field entirely if the existing title is already specific and grounded.
  "suggestedIntent": A 1-2 sentence description of why this category of provider helps the family right now, written with empathy. Omit this field entirely if the existing intent is already well-grounded.

RESPONSE FORMAT — return a JSON array, one object per simulation, no markdown:
[
  {
    "simulationId": "<id from input>",
    "lensRestriction": ["family"] or [],
    "suggestedTitle": "...",
    "suggestedIntent": "...",
    "checks": [
      { "name": "grounding",    "result": "pass|provisional|fail", "confidence": 0.0, "reason": "..." },
      { "name": "coherence",    "result": "pass|provisional|fail", "confidence": 0.0, "reason": "..." },
      { "name": "credibility",  "result": "pass|provisional|fail", "confidence": 0.0, "reason": "..." },
      { "name": "lens_fit",     "result": "pass|provisional|fail", "confidence": 0.0, "reason": "..." }
    ]
  }
]

Rules:
- Return exactly one object per simulation in the same order as the input.
- confidence is a float 0.0–1.0.
- lensRestriction lists any audience lens values that should NOT see this output. Use [] when unrestricted.
- suggestedTitle and suggestedIntent are optional — only include them for blueprint_task sources when the existing values are generic or not grounded in the family's situation.
- Do not add markdown fences, explanations, or any text outside the JSON array.`;

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);
  private readonly llm: ChatOpenAI;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.llm = new ChatOpenAI({
      modelName: this.config.get('OPENAI_MODEL', { infer: true }),
      temperature: 0,
      openAIApiKey: this.config.get('OPENAI_API_KEY', { infer: true }),
    });
  }

  /**
   * Validate a single simulation output.
   * Never throws — returns safe provisional on any failure.
   */
  async validate(input: ValidationInput): Promise<ValidationResult> {
    const results = await this.validateBatch([input]);
    return results[0];
  }

  /**
   * Validate multiple simulation outputs in a single AI call.
   * Splits into chunks of `concurrency` to avoid rate limits.
   * Never throws — returns safe provisional per item on failure.
   */
  async validateBatch(
    inputs: ValidationInput[],
    concurrency = this.config.get('PEC_VALIDATION_CONCURRENCY', { infer: true }),
  ): Promise<ValidationResult[]> {
    if (inputs.length === 0) return [];

    const chunks = this.chunk(inputs, concurrency);
    const allResults: ValidationResult[] = [];

    for (const chunk of chunks) {
      const chunkResults = await this.runChunk(chunk);
      allResults.push(...chunkResults);
    }

    return allResults;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async runChunk(inputs: ValidationInput[]): Promise<ValidationResult[]> {
    try {
      const userMessage = this.buildUserMessage(inputs);

      const response = await this.llm.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ]);

      const raw = this.parseResponse(response.content as string, inputs);
      return raw.map((r) => this.toValidationResult(r));
    } catch (err) {
      this.logger.error('Validation batch failed — returning safe provisional for all', err);
      return inputs.map((i) =>
        safeProvisional(i.simulationId, `validation error: ${(err as Error).message}`),
      );
    }
  }

  private buildUserMessage(inputs: ValidationInput[]): string {
    const parts: string[] = [];

    // Shared entity context (same for all items in a chunk if provided)
    const sharedContext = inputs.find((i) => i.entityContext)?.entityContext;
    if (sharedContext) {
      parts.push(`VALIDATED CONTEXT:\n${sharedContext}\n`);
    } else {
      parts.push(`VALIDATED CONTEXT:\n(none — first interaction with this entity)\n`);
    }

    parts.push(`SIMULATIONS (${inputs.length} total):\n`);

    for (const input of inputs) {
      parts.push(
        `---\nsimulationId: ${input.simulationId}\nsourceType: ${input.sourceType}\naudienceLens: ${input.audienceLens ?? 'all'}\ncontent: ${input.content}\n`,
      );
    }

    return parts.join('\n');
  }

  private parseResponse(
    content: string,
    inputs: ValidationInput[],
  ): RawValidationResult[] {
    try {
      let jsonStr = content.trim();
      // Strip markdown fences if the model adds them despite instructions
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '');
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) throw new Error('Response is not an array');

      return parsed as RawValidationResult[];
    } catch (err) {
      this.logger.warn('Failed to parse validation response, using safe provisional');
      // Return safe provisional for every input in this chunk
      return inputs.map((i) => ({
        simulationId: i.simulationId,
        checks: [],
        lensRestriction: [],
      }));
    }
  }

  private toValidationResult(raw: RawValidationResult): ValidationResult {
    const checks: ValidationCheck[] = this.normaliseChecks(raw.checks ?? []);

    const overallConfidence = checks.length > 0
      ? checks.reduce((sum, c) => sum + c.confidence, 0) / checks.length
      : 0.5;

    const groundingCheck = checks.find((c) => c.name === 'grounding');
    const credibilityCheck = checks.find((c) => c.name === 'credibility');

    const status = this.determineStatus(
      overallConfidence,
      groundingCheck?.result,
      credibilityCheck?.result,
    );

    const failedChecks = checks.filter((c) => c.result === 'fail');
    const reason = failedChecks.length > 0
      ? failedChecks.map((c) => `${c.name}: ${c.reason}`).join('; ')
      : status === 'consolidated'
        ? 'all checks passed'
        : 'provisional pending corroboration';

    const lensRestriction = (raw.lensRestriction ?? []).filter(
      (l): l is AudienceLens =>
        ['family', 'coworker', 'friend', 'admirer', 'all'].includes(l),
    );

    return {
      simulationId: raw.simulationId,
      status,
      overallConfidence: Number(overallConfidence.toFixed(3)),
      checks,
      lensRestriction: lensRestriction.length > 0 ? lensRestriction : undefined,
      reason,
      evaluatedAt: new Date(),
      suggestedTitle: raw.suggestedTitle || undefined,
      suggestedIntent: raw.suggestedIntent || undefined,
    };
  }

  private normaliseChecks(raw: RawCheckResult[]): ValidationCheck[] {
    const EXPECTED = ['grounding', 'coherence', 'credibility', 'lens_fit'] as const;

    return EXPECTED.map((name) => {
      const found = raw.find((c) => c.name === name);
      if (!found) {
        return {
          name,
          result: 'provisional' as CheckResult,
          confidence: 0.5,
          reason: 'check not returned by validator',
        };
      }
      return {
        name,
        result: this.normaliseResult(found.result),
        confidence: Math.min(1, Math.max(0, Number(found.confidence) || 0.5)),
        reason: found.reason ?? '',
      };
    });
  }

  private normaliseResult(raw: string): CheckResult {
    if (raw === 'pass' || raw === 'provisional' || raw === 'fail') return raw;
    return 'provisional';
  }

  private determineStatus(
    overallConfidence: number,
    groundingResult?: CheckResult,
    credibilityResult?: CheckResult,
  ): ValidationStatus {
    // Both grounding AND credibility fail → always excluded
    if (groundingResult === 'fail' && credibilityResult === 'fail') {
      return 'excluded';
    }

    if (overallConfidence >= PEC_THRESHOLDS.CONSOLIDATE) return 'consolidated';
    if (overallConfidence >= PEC_THRESHOLDS.PROVISIONAL) return 'provisional';
    return 'excluded';
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
