/**
 * Blueprints API — Type Definitions
 * Shared across parse, build, and enrich services.
 */

// ── Parse ─────────────────────────────────────────────────────────────────────

export interface NodeSuggestion {
  key: string;
  name: string;
  kind: "DTE" | "INTENT" | "TAG";
  group?: string;
  confidence: number;
  reason: string;
}

export type ParsedNodeStatus = "confirmed" | "provisional";

export interface ParsedNode {
  key: string;
  kind: "DTE" | "INTENT" | "TAG";
  confidence: number;
  status: ParsedNodeStatus;
}

export interface ParseLocation {
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  resolved: boolean;
}

export interface ParseLocations {
  user: ParseLocation | null;
  event: ParseLocation | null;
}

export interface ParseResult {
  parseId: string;
  nodes: ParsedNode[];
  suggestions: NodeSuggestion[];
  locations: ParseLocations;
  rawInput: string;
}

// ── Build ─────────────────────────────────────────────────────────────────────

export type TimeframeBucket = "0-24h" | "24-72h" | "1-2 weeks" | "ongoing";

export type ActionAssignee = "organizer" | "family member" | "anyone";

export interface ActionEnrichment {
  providers: null;
  resources: null;
  guidance: null;
}

export interface BuildAction {
  id: string;
  intentKey: string;
  what: string;
  why: string;
  order: number;
  assignee: ActionAssignee;
  dependsOn: string[]; // action IDs
  location: string;
  status: "pending";
  enrichment: ActionEnrichment;
}

export interface BuildPhase {
  id: string;
  bucket: TimeframeBucket;
  label: string;
  subtitle: string;
  urgency: string;
  tracks: string[][]; // parallel track groupings of action IDs
  actions: BuildAction[];
}

export interface BuildResult {
  buildId: string;
  blueprintId: string;
  phases: BuildPhase[];
}

// ── Enrich ────────────────────────────────────────────────────────────────────

export type ResourceKind =
  | "travel"
  | "moving"
  | "legal"
  | "financial"
  | "inapp";

export type ResourceType = "external_url" | "inapp_action" | "inapp_deeplink";

export interface InAppAction {
  actionKey: string;
  params?: Record<string, unknown>;
}

export interface InAppDeeplink {
  route: string;
  params?: Record<string, unknown>;
}

export interface ProviderCard {
  providerId: string;
  name: string;
  category: string;
  distance: string;
  open: boolean;
  closingTime: string | null;
  reputationScore: number | null;
  reputationLabel: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  matchedAt: string;
}

export interface ResourceLink {
  label: string;
  source: string;
  kind: ResourceKind;
  type: ResourceType;
  url?: string; // tracking redirect URL for external resources
  action?: InAppAction;
  deeplink?: InAppDeeplink;
}

export interface EnrichedActionSlots {
  providers: ProviderCard[];
  resources: ResourceLink[];
  guidance: null; // not yet implemented
}

export interface EnrichResult {
  actionId: string;
  intentKey: string;
  enrichment: EnrichedActionSlots;
}

// ── Taxonomy metadata shapes ──────────────────────────────────────────────────
// Cast from the Json? field on TaxonomyNode

export interface DteNodeMetadata {
  urgencyLevel: "immediate" | "urgent" | "soon" | "short_term" | "ongoing";
  intentKeys: string[];
  typicalDuration?: string;
  externalPlaceTypes?: string[];
}

export interface IntentNodeMetadata {
  defaultAssignee: ActionAssignee;
  categoryKeys: string[];
  urgencyLevel?: string;
  guidance?: string; // reserved for future partner content
}
