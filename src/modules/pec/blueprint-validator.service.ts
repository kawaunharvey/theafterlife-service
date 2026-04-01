import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ValidationService } from './validation.service';
import { ContextStoreService } from './context-store.service';
import { BlueprintModule } from './types/blueprint.types';
import {
  MemoryEntry,
  ValidationInput,
  ValidationResult,
} from '@/common/types/pec.types';

// ── Output types ──────────────────────────────────────────────────────────────

export interface ExcludedModule {
  moduleId: string;
  title: string;
  reason: string;
}

export interface ValidatedBlueprintResult {
  /** Modules that passed all four checks — execute normally */
  consolidatedModules: BlueprintModule[];
  /** Modules in the provisional range — execute but mark as provisional */
  provisionalModules: BlueprintModule[];
  /** Modules that failed — surface in "couldn't confirm" section */
  excludedModules: ExcludedModule[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class BlueprintValidatorService {
  private readonly logger = new Logger(BlueprintValidatorService.name);

  constructor(
    private readonly validation: ValidationService,
    private readonly contextStore: ContextStoreService,
  ) {}

  /**
   * Validate all blueprint modules in a single batched AI call.
   *
   * Each module is validated independently against the four PEC checks.
   * Excluded modules are not dropped silently — they surface in
   * excludedModules with a plain-language reason for the family.
   *
   * Safe on failure — returns all modules as consolidated so the
   * family-facing response is never blocked.
   */
  async validateModules(
    modules: BlueprintModule[],
    context: {
      userInput: string;
      urgency: string;
      memorialId?: string;
    },
  ): Promise<ValidatedBlueprintResult> {
    if (modules.length === 0) {
      return { consolidatedModules: [], provisionalModules: [], excludedModules: [] };
    }

    // Build entity context for coherence check
    let entityContext: string | undefined;
    if (context.memorialId) {
      try {
        entityContext = await this.contextStore.serialiseValidatedContext(
          context.memorialId,
          'memorial',
        );
      } catch {
        // Non-fatal
      }
    }

    // Build one ValidationInput per module
    const inputs: ValidationInput[] = modules.map((mod) =>
      this.buildInput(mod, context.userInput, context.urgency, entityContext),
    );

    // Single batched call
    let results: ValidationResult[];
    try {
      results = await this.validation.validateBatch(inputs);
    } catch {
      this.logger.warn('Blueprint validation failed — returning all modules as consolidated');
      return {
        consolidatedModules: modules,
        provisionalModules: [],
        excludedModules: [],
      };
    }

    const consolidatedModules: BlueprintModule[] = [];
    const provisionalModules: BlueprintModule[] = [];
    const excludedModules: ExcludedModule[] = [];

    // Map results back to modules (same order as inputs)
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      const result = results.find((r) => r.simulationId === mod.moduleId) ?? results[i];

      if (!result || result.status === 'consolidated') {
        consolidatedModules.push(this.applyCorrections(mod, result));
        this.persistEntry(mod, result, context.memorialId, 'consolidated');
      } else if (result.status === 'provisional') {
        provisionalModules.push(this.applyCorrections(mod, result));
        this.persistEntry(mod, result, context.memorialId, 'provisional');
      } else {
        // excluded
        excludedModules.push({
          moduleId: mod.moduleId,
          title: mod.title,
          reason: result.reason,
        });
        this.persistEntry(mod, result, context.memorialId, 'excluded');
      }
    }

    this.logger.log(
      `Blueprint PEC: ${consolidatedModules.length} consolidated, ` +
        `${provisionalModules.length} provisional, ${excludedModules.length} excluded`,
    );

    return { consolidatedModules, provisionalModules, excludedModules };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private applyCorrections(mod: BlueprintModule, result: ValidationResult | undefined): BlueprintModule {
    if (!result?.suggestedTitle && !result?.suggestedIntent) return mod;
    return {
      ...mod,
      title: result.suggestedTitle ?? mod.title,
      suggestedTitle: result.suggestedTitle,
      suggestedIntent: result.suggestedIntent,
      explanations: {
        ...mod.explanations,
        headline: result.suggestedIntent ?? mod.explanations?.headline,
      },
    };
  }

  private buildInput(
    mod: BlueprintModule,
    userInput: string,
    urgency: string,
    entityContext?: string,
  ): ValidationInput {
    const { requirements, ranking } = mod;

    const content = [
      `Module: "${mod.title}"`,
      `Current title: "${mod.title}"`,
      `Current intent: "${mod.explanations?.headline ?? ''}"`,
      `Intent: ${mod.intentId}`,
      `Urgency: ${urgency}`,
      `Provider types: ${mod.providerTaxonomyKeys.join(', ')}`,
      `Required tags: ${(requirements.requiredTagIds ?? []).join(', ') || 'none'}`,
      `Preferred tags: ${(requirements.preferredTagIds ?? []).join(', ') || 'none'}`,
      `Max distance: ${requirements.numeric?.maxDistanceMeters ?? 'unset'}m`,
      `Min rating: ${requirements.numeric?.minRating ?? 'unset'}`,
      `Min capacity: ${requirements.numeric?.minCapacity ?? 'unset'}`,
      `Ranking strategy: ${ranking.strategy}`,
      `Family's situation: "${userInput.slice(0, 400)}"`,
    ].join('\n');

    return {
      simulationId: mod.moduleId,
      content,
      sourceType: 'blueprint_task',
      entityContext,
      audienceLens: 'family',
      metadata: { intentId: mod.intentId },
    };
  }

  private persistEntry(
    mod: BlueprintModule,
    result: ValidationResult | undefined,
    memorialId: string | undefined,
    status: 'consolidated' | 'provisional' | 'excluded',
  ): void {
    if (!memorialId || !result) return;

    const entry: MemoryEntry = {
      id: randomUUID(),
      content: mod.title,
      sourceType: 'blueprint_task',
      sourceId: mod.moduleId,
      status,
      confidence: result.overallConfidence,
      lensRestriction: result.lensRestriction ?? [],
      validationResult: result,
      consolidatedAt: status === 'consolidated' ? new Date() : undefined,
      provisionalSince: status === 'provisional' ? new Date() : undefined,
      corroboratedBy: [],
      contradictedBy: [],
      tags: [mod.intentId],
    };

    const method =
      status === 'consolidated'
        ? 'consolidate'
        : status === 'provisional'
          ? 'addProvisional'
          : 'flag';

    this.contextStore[method](memorialId, 'memorial', entry).catch((err) => {
      this.logger.warn(`Failed to persist blueprint module to ContextStore: ${err.message}`);
    });
  }
}
