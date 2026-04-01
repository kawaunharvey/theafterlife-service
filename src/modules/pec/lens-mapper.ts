import { AudienceLens, QUALIFIER_TO_LENS } from '@/common/types/pec.types';

/**
 * Maps a MemorialRelationship qualifier array (or raw relationship string)
 * to the closest AudienceLens value.
 *
 * Priority order:
 * 1. qualifier strings (explicit role labels stored in DB)
 * 2. relationship string (stored in DB but not in Prisma schema)
 * 3. fallback → 'all'
 */
export function mapQualifiersToLens(
  qualifiers: string[],
  relationship?: string,
): AudienceLens {
  for (const qualifier of qualifiers) {
    const lens = QUALIFIER_TO_LENS[qualifier.toLowerCase()];
    if (lens) return lens;
  }

  if (relationship) {
    const lens = QUALIFIER_TO_LENS[relationship.toLowerCase()];
    if (lens) return lens;
  }

  return 'all';
}

/**
 * Given a set of MemorialRelationship rows, returns all unique lenses
 * represented in that audience — used to build the lensIndex.
 */
export function collectLenses(
  relationships: Array<{ qualifier: string[]; relationship?: string }>,
): AudienceLens[] {
  const lenses = new Set<AudienceLens>();
  for (const rel of relationships) {
    lenses.add(mapQualifiersToLens(rel.qualifier, rel.relationship));
  }
  return Array.from(lenses);
}
