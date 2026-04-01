// ─────────────────────────────────────────────────────────────────────────────
// PEC (Prediction Error Correction) — shared types
// Used by ValidationService, ContextStoreService, TaxonomyValidatorService,
// and BlueprintValidatorService.
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationStatus = 'consolidated' | 'provisional' | 'excluded';

export type AudienceLens = 'family' | 'coworker' | 'friend' | 'admirer' | 'all';

export type CheckResult = 'pass' | 'provisional' | 'fail';

export interface ValidationCheck {
  name: 'grounding' | 'coherence' | 'credibility' | 'lens_fit';
  result: CheckResult;
  confidence: number; // 0–1
  reason: string;
}

export interface ValidationResult {
  simulationId: string;
  status: ValidationStatus;
  overallConfidence: number;
  checks: ValidationCheck[];
  lensRestriction?: AudienceLens[];
  reason: string;
  evaluatedAt: Date;
  /** PEC-corrected title for blueprint_task sources (omitted when existing title is already grounded) */
  suggestedTitle?: string;
  /** PEC-corrected intent for blueprint_task sources (omitted when existing intent is already grounded) */
  suggestedIntent?: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  sourceType: 'review' | 'taxonomy_node' | 'blueprint_task' | 'submission';
  sourceId: string;
  status: ValidationStatus;
  confidence: number;
  lensRestriction: AudienceLens[];
  validationResult: ValidationResult;
  consolidatedAt?: Date;
  provisionalSince?: Date;
  corroboratedBy?: string[];
  contradictedBy?: string[];
  tags: string[];
}

export interface ContextStore {
  entityId: string;
  entityType: 'provider' | 'memorial';
  validated: MemoryEntry[];
  provisional: MemoryEntry[];
  flagged: MemoryEntry[];
  lensIndex: Record<AudienceLens, string[]>;
  lastUpdated: Date;
  version: number;
}

// ── Validation input ──────────────────────────────────────────────────────────

export interface ValidationInput {
  simulationId: string;
  /** The AI-generated output to validate */
  content: string;
  sourceType: MemoryEntry['sourceType'];
  /** Serialised validated context for coherence check */
  entityContext?: string;
  audienceLens?: AudienceLens;
  metadata?: Record<string, unknown>;
}

// ── Safe provisional returned on validation failure ───────────────────────────

export function safeProvisional(simulationId: string, reason: string): ValidationResult {
  return {
    simulationId,
    status: 'provisional',
    overallConfidence: 0.5,
    checks: [
      { name: 'grounding', result: 'provisional', confidence: 0.5, reason: 'validation unavailable' },
      { name: 'coherence', result: 'provisional', confidence: 0.5, reason: 'validation unavailable' },
      { name: 'credibility', result: 'provisional', confidence: 0.5, reason: 'validation unavailable' },
      { name: 'lens_fit', result: 'provisional', confidence: 0.5, reason: 'validation unavailable' },
    ],
    reason,
    evaluatedAt: new Date(),
  };
}

// ── Thresholds ────────────────────────────────────────────────────────────────

export const PEC_THRESHOLDS = {
  CONSOLIDATE: 0.72,
  PROVISIONAL: 0.45,
  CORROBORATION_BOOST: 0.10,
  PROVISIONAL_EXPIRY_DAYS: 30,
} as const;

// ── Relationship → AudienceLens mapping ──────────────────────────────────────
// Covers both the `relationship` field (e.g. "IMMEDIATE_FAMILY") and
// `qualifier` values (e.g. "Mother") stored in MemorialRelationship.

export const QUALIFIER_TO_LENS: Record<string, AudienceLens> = {
  // relationship-level values (exist in DB, not yet in Prisma schema)
  immediate_family: 'family',
  family: 'family',
  extended_family: 'family',
  colleague: 'coworker',
  coworker: 'coworker',
  work_friend: 'coworker',
  friend: 'friend',
  close_friend: 'friend',
  best_friend: 'friend',
  admirer: 'admirer',
  fan: 'admirer',
  follower: 'admirer',
  community: 'admirer',
  acquaintance: 'admirer',
  // qualifier string values (lowercase match)
  mother: 'family',
  father: 'family',
  parent: 'family',
  sibling: 'family',
  sister: 'family',
  brother: 'family',
  spouse: 'family',
  partner: 'family',
  child: 'family',
  son: 'family',
  daughter: 'family',
  grandparent: 'family',
  grandchild: 'family',
  aunt: 'family',
  uncle: 'family',
  cousin: 'family',
};
