/**
 * PEC blueprint-related shared types.
 * These types are owned by PEC and are independent of legacy planner naming.
 */

export interface TaxonomyTargets {
  categories: string[];
  tags: string[];
  services: string[];
  intents: string[];
  matchedAliases?: Array<{
    aliasKey: string;
    taxonomyKey: string;
    confidence: number;
  }>;
}

export interface BlueprintModule {
  moduleId: string;
  title: string;
  intentId: string;
  providerTaxonomyKeys: string[];
  suggestedTitle?: string;
  suggestedIntent?: string;
  explanations?: {
    headline?: string;
    [key: string]: unknown;
  };
  requirements: {
    requiredTagIds?: string[];
    preferredTagIds?: string[];
    numeric?: {
      maxDistanceMeters?: number;
      minRating?: number;
      minCapacity?: number;
    };
  };
  ranking: {
    strategy: string;
  };
}
