import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ValidationService } from './validation.service';
import { ContextStoreService } from './context-store.service';
import { TaxonomyTargets } from './types/blueprint.types';
import {
  MemoryEntry,
  ValidationInput,
  ValidationResult,
  safeProvisional,
} from '@/common/types/pec.types';

// ── Output types ──────────────────────────────────────────────────────────────

export interface ProvisionalTaxonomyNode {
  // EnrichedTaxonomyNode fields (required by new-planner.types.ts)
  id: string;
  key: string;
  kind: string;
  confidence: number;
  context: string[];
  // PEC fields
  name: string;
  clarificationPrompt: string;
  validationId: string;
}

export interface ValidatedTaxonomyResult {
  /** Nodes that passed all four checks — safe to drive blueprint generation */
  targets: TaxonomyTargets;
  /** Nodes with ambiguous grounding/credibility — surface to family for confirmation */
  provisionalNodes: ProvisionalTaxonomyNode[];
  /** Node keys that failed grounding — never reach the blueprint generator */
  excludedKeys: string[];
}

// ── Raw mapper output shape (what NlTaxonomyMapperService already returns) ────

interface MatchedAlias {
  aliasKey: string;
  taxonomyKey: string;
  confidence: number;
}

interface RawTaxonomyTargets extends TaxonomyTargets {
  matchedAliases: MatchedAlias[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TaxonomyValidatorService {
  private readonly logger = new Logger(TaxonomyValidatorService.name);

  constructor(
    private readonly validation: ValidationService,
    private readonly contextStore: ContextStoreService,
  ) {}

  /**
   * Validate taxonomy mapping results from NlTaxonomyMapperService.
   *
   * Wraps (never replaces) the mapper output with PEC checks:
   * - Consolidated nodes → targets (drive blueprint generation)
   * - Provisional nodes  → provisionalNodes (surface to family)
   * - Excluded nodes     → excludedKeys (never propagate)
   *
   * Safe on failure — returns all raw targets as consolidated if validation
   * is unavailable, so the family-facing response is never blocked.
   */
  async validateAndClassify(
    rawTargets: RawTaxonomyTargets,
    userInput: string,
    options?: {
      memorialId?: string;
      nodeNameMap?: Record<string, { name: string; kind: string }>;
    },
  ): Promise<ValidatedTaxonomyResult> {
    const { matchedAliases } = rawTargets;

    if (!matchedAliases || matchedAliases.length === 0) {
      return {
        targets: rawTargets,
        provisionalNodes: [],
        excludedKeys: [],
      };
    }

    // Build entity context for coherence check
    let persistedContext: string | undefined;
    if (options?.memorialId) {
      try {
        persistedContext = await this.contextStore.serialiseValidatedContext(
          options.memorialId,
          'memorial',
        );
      } catch {
        // Non-fatal
      }
    }

    // Build a batch-level context so the AI can assess redundancy across the
    // full node set being validated in this call — enables coherence to catch
    // cases like INTENT_CREMATION_SERVICES being redundant with SVC_CREMATION.
    const batchContext = [
      'NODES BEING EVALUATED IN THIS BATCH (check for semantic redundancy):',
      ...matchedAliases.map((a) => {
        const m = options?.nodeNameMap?.[a.taxonomyKey];
        return `  - ${a.taxonomyKey} (${m?.kind ?? 'unknown'}): ${m?.name ?? a.taxonomyKey}`;
      }),
    ].join('\n');

    const entityContext = [batchContext, persistedContext]
      .filter(Boolean)
      .join('\n\n') || undefined;

    // Build one ValidationInput per matched alias
    const inputs: ValidationInput[] = matchedAliases.map((alias) => {
      const meta = options?.nodeNameMap?.[alias.taxonomyKey];
      const content = [
        `Taxonomy mapping: "${meta?.name ?? alias.taxonomyKey}" (${meta?.kind ?? 'unknown'})`,
        `Matched from user input phrase: "${alias.aliasKey.replace(/^name:/, '')}"`,
        `Match confidence: ${alias.confidence.toFixed(2)}`,
        `User's original input: "${userInput.slice(0, 400)}"`,
      ].join('\n');

      return {
        simulationId: alias.taxonomyKey,
        content,
        sourceType: 'taxonomy_node' as const,
        entityContext,
        audienceLens: 'family' as const,
        metadata: { confidence: alias.confidence, kind: meta?.kind },
      };
    });

    // Single batched validation call
    let results: ValidationResult[];
    try {
      results = await this.validation.validateBatch(inputs);
    } catch {
      this.logger.warn('Taxonomy validation failed — returning all targets as consolidated');
      return { targets: rawTargets, provisionalNodes: [], excludedKeys: [] };
    }

    // Split by status
    const consolidated = new Set<string>();
    const provisional: ProvisionalTaxonomyNode[] = [];
    const excluded = new Set<string>();

    for (const result of results) {
      const alias = matchedAliases.find((a) => a.taxonomyKey === result.simulationId);
      if (!alias) continue;

      const meta = options?.nodeNameMap?.[alias.taxonomyKey];

      if (result.status === 'consolidated') {
        consolidated.add(alias.taxonomyKey);

        // Persist to ContextStore when memorialId is available
        if (options?.memorialId) {
          const entry = this.toMemoryEntry(alias.taxonomyKey, result, meta);
          this.contextStore
            .consolidate(options.memorialId, 'memorial', entry)
            .catch((err) => this.logger.warn(`Failed to persist consolidated node: ${err.message}`));
        }
      } else if (result.status === 'provisional') {
        provisional.push({
          id: alias.taxonomyKey,
          key: alias.taxonomyKey,
          kind: meta?.kind ?? 'unknown',
          confidence: result.overallConfidence,
          context: meta?.name ? [meta.name] : [],
          name: meta?.name ?? alias.taxonomyKey,
          clarificationPrompt: this.buildClarificationPrompt(
            meta?.name ?? alias.taxonomyKey,
            alias.aliasKey.replace(/^name:/, ''),
          ),
          validationId: result.simulationId,
        });

        if (options?.memorialId) {
          const entry = this.toMemoryEntry(alias.taxonomyKey, result, meta);
          this.contextStore
            .addProvisional(options.memorialId, 'memorial', entry)
            .catch((err) => this.logger.warn(`Failed to persist provisional node: ${err.message}`));
        }
      } else {
        // excluded
        excluded.add(alias.taxonomyKey);
      }
    }

    // Any matched alias not in results → fall back to consolidated (safe)
    for (const alias of matchedAliases) {
      if (!results.find((r) => r.simulationId === alias.taxonomyKey)) {
        consolidated.add(alias.taxonomyKey);
      }
    }

    // Deterministic deduplication: when multiple consolidated nodes share the same
    // concept (e.g. SVC_CREMATION and INTENT_CREMATION_SERVICES), keep only the
    // most specific kind. Priority: CATEGORY > SERVICE > TAG > INTENT.
    // Redundant nodes are moved to excluded so they never reach blueprint generation
    // or appear in detectedNodes.
    this.deduplicateByConcept(consolidated, excluded, options?.nodeNameMap);

    // Build filtered TaxonomyTargets from consolidated set
    const targets: TaxonomyTargets = {
      categories: rawTargets.categories.filter((k) => consolidated.has(k)),
      tags: rawTargets.tags.filter((k) => consolidated.has(k)),
      services: rawTargets.services.filter((k) => consolidated.has(k)),
      intents: rawTargets.intents.filter((k) => consolidated.has(k)),
      matchedAliases: (rawTargets.matchedAliases ?? []).filter((a) =>
        consolidated.has(a.taxonomyKey),
      ),
    };

    this.logger.log(
      `Taxonomy PEC: ${consolidated.size} consolidated, ${provisional.length} provisional, ${excluded.size} excluded`,
    );

    return { targets, provisionalNodes: provisional, excludedKeys: Array.from(excluded) };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private buildClarificationPrompt(nodeName: string, matchedPhrase: string): string {
    if (matchedPhrase && matchedPhrase !== nodeName) {
      return `We interpreted "${matchedPhrase}" as ${nodeName} — is that right?`;
    }
    return `We interpreted your situation as including ${nodeName} — is that right?`;
  }

  /**
   * Kind priority — higher index = more specific = wins when concepts collide.
   * CATEGORY and TAG don't collide with SERVICE/INTENT so they're excluded from
   * the hierarchy check; this only applies to SERVICE vs INTENT pairs.
   */
  private static readonly KIND_PRIORITY: Record<string, number> = {
    INTENT: 0,
    SERVICE: 1,
    TAG: 2,
    CATEGORY: 3,
  };

  /**
   * Extract a normalised concept stem from a taxonomy key.
   * e.g. SVC_CREMATION → "cremation"
   *      INTENT_CREMATION_SERVICES → "cremation services" → strip trailing _SERVICES → "cremation"
   * Strip the kind prefix (SVC_, INTENT_, CAT_, TAG_) then normalise.
   */
  private conceptStem(key: string): string {
    return key
      .replace(/^(SVC|INTENT|CAT|TAG)_/i, '')
      .replace(/_SERVICES?$/i, '')
      .replace(/_INTENT$/i, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .trim();
  }

  /**
   * For each group of consolidated nodes that share the same concept stem,
   * keep only the highest-priority kind and move the rest to excluded.
   * Mutates both sets in place.
   */
  private deduplicateByConcept(
    consolidated: Set<string>,
    excluded: Set<string>,
    nodeNameMap?: Record<string, { name: string; kind: string }>,
  ): void {
    // Group consolidated keys by concept stem
    const groups = new Map<string, string[]>();

    for (const key of consolidated) {
      const stem = this.conceptStem(key);
      if (!groups.has(stem)) groups.set(stem, []);
      groups.get(stem)!.push(key);
    }

    for (const [, keys] of groups) {
      if (keys.length <= 1) continue;

      // Sort by priority descending — highest priority (most specific) first
      keys.sort((a, b) => {
        const kindA = nodeNameMap?.[a]?.kind ?? '';
        const kindB = nodeNameMap?.[b]?.kind ?? '';
        const pa = TaxonomyValidatorService.KIND_PRIORITY[kindA] ?? -1;
        const pb = TaxonomyValidatorService.KIND_PRIORITY[kindB] ?? -1;
        return pb - pa;
      });

      // Keep the first (most specific), exclude the rest
      const [winner, ...losers] = keys;
      for (const loser of losers) {
        consolidated.delete(loser);
        excluded.add(loser);
        this.logger.debug(
          `Dedup: excluded ${loser} (redundant with ${winner})`,
        );
      }
    }
  }

  private toMemoryEntry(
    key: string,
    result: ValidationResult,
    meta?: { name: string; kind: string },
  ): MemoryEntry {
    return {
      id: randomUUID(),
      content: meta?.name ?? key,
      sourceType: 'taxonomy_node',
      sourceId: key,
      status: result.status,
      confidence: result.overallConfidence,
      lensRestriction: result.lensRestriction ?? [],
      validationResult: result,
      consolidatedAt: result.status === 'consolidated' ? new Date() : undefined,
      provisionalSince: result.status === 'provisional' ? new Date() : undefined,
      corroboratedBy: [],
      contradictedBy: [],
      tags: [meta?.kind ?? 'taxonomy_node'],
    };
  }
}
