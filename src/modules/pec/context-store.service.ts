import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '@/prisma/prisma.service';
import { Env } from '@/config/env';
import {
  ContextStore,
  MemoryEntry,
  AudienceLens,
  ValidationStatus,
  PEC_THRESHOLDS,
} from '@/common/types/pec.types';

type EntityType = 'provider' | 'memorial';

@Injectable()
export class ContextStoreService {
  private readonly logger = new Logger(ContextStoreService.name);
  private readonly redis: Redis;
  private readonly cacheTtl: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.redis = new Redis(this.config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    this.cacheTtl = this.config.get('PEC_CONTEXT_CACHE_TTL_SECONDS', { infer: true });

    this.redis.on('error', (err) => {
      this.logger.warn(`Redis connection error (PEC cache will degrade gracefully): ${err.message}`);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async getContext(entityId: string, entityType: EntityType): Promise<ContextStore | null> {
    // 1. Try Redis cache
    try {
      const cached = await this.redis.get(this.cacheKey(entityId, entityType));
      if (cached) return JSON.parse(cached) as ContextStore;
    } catch {
      // Redis unavailable — fall through to MongoDB
    }

    // 2. MongoDB
    const record = await this.prisma.contextStore.findUnique({
      where: { entityId_entityType: { entityId, entityType } },
    });

    if (!record) return null;

    const store = this.deserialise(record);
    await this.writeCache(entityId, entityType, store);
    return store;
  }

  /**
   * Returns the validated entries for an entity, optionally filtered by lens.
   * O(1) via lensIndex when lens is specified.
   */
  async getValidatedContext(
    entityId: string,
    entityType: EntityType,
    lens?: AudienceLens,
  ): Promise<MemoryEntry[]> {
    const store = await this.getContext(entityId, entityType);
    if (!store) return [];

    if (!lens || lens === 'all') return store.validated;

    const lensIds = new Set([
      ...(store.lensIndex[lens] ?? []),
      ...(store.lensIndex.all ?? []),
    ]);
    return store.validated.filter((e) => lensIds.has(e.id));
  }

  /**
   * Serialise validated entries to a plain-text summary string suitable for
   * inclusion in a validation prompt (coherence context).
   */
  async serialiseValidatedContext(
    entityId: string,
    entityType: EntityType,
    lens?: AudienceLens,
  ): Promise<string> {
    const entries = await this.getValidatedContext(entityId, entityType, lens);
    if (entries.length === 0) return '(no validated context yet)';

    return entries
      .map((e) => `[${e.sourceType}] ${e.content} (confidence: ${e.confidence.toFixed(2)})`)
      .join('\n');
  }

  /** Write a consolidated (validated) entry. */
  async consolidate(
    entityId: string,
    entityType: EntityType,
    entry: MemoryEntry,
  ): Promise<void> {
    await this.upsertEntry(entityId, entityType, 'validated', {
      ...entry,
      status: 'consolidated',
      consolidatedAt: new Date(),
      provisionalSince: undefined,
    });
  }

  /** Write a provisional entry. */
  async addProvisional(
    entityId: string,
    entityType: EntityType,
    entry: MemoryEntry,
  ): Promise<void> {
    await this.upsertEntry(entityId, entityType, 'provisional', {
      ...entry,
      status: 'provisional',
      provisionalSince: entry.provisionalSince ?? new Date(),
    });
  }

  /** Write a flagged entry. */
  async flag(
    entityId: string,
    entityType: EntityType,
    entry: MemoryEntry,
  ): Promise<void> {
    await this.upsertEntry(entityId, entityType, 'flagged', {
      ...entry,
      status: 'excluded',
    });
  }

  /**
   * Dispatch a MemoryEntry to the correct bucket based on its status.
   */
  async dispatch(
    entityId: string,
    entityType: EntityType,
    entry: MemoryEntry,
  ): Promise<void> {
    switch (entry.status) {
      case 'consolidated':
        await this.consolidate(entityId, entityType, entry);
        break;
      case 'provisional':
        await this.addProvisional(entityId, entityType, entry);
        break;
      case 'excluded':
        await this.flag(entityId, entityType, entry);
        break;
    }
  }

  // ── Provisional review helpers (called by the nightly processor) ──────────

  /**
   * Promote provisional entries that are corroborated by ≥2 validated sources.
   * Returns IDs of promoted entries.
   */
  async promoteCorroborated(
    entityId: string,
    entityType: EntityType,
  ): Promise<string[]> {
    const store = await this.getContext(entityId, entityType);
    if (!store || store.provisional.length === 0) return [];

    const promoted: string[] = [];

    for (const entry of store.provisional) {
      const corroborationCount = (entry.corroboratedBy ?? []).length;
      if (corroborationCount >= 2) {
        const boosted = Math.min(
          1,
          entry.confidence + corroborationCount * PEC_THRESHOLDS.CORROBORATION_BOOST,
        );
        if (boosted >= PEC_THRESHOLDS.CONSOLIDATE) {
          await this.consolidate(entityId, entityType, {
            ...entry,
            confidence: boosted,
            status: 'consolidated',
          });
          await this.removeFromBucket(entityId, entityType, 'provisional', entry.id);
          promoted.push(entry.id);
        }
      }
    }

    return promoted;
  }

  /**
   * Demote provisional entries contradicted by validated facts.
   * Returns IDs of demoted entries.
   */
  async demoteContradicted(
    entityId: string,
    entityType: EntityType,
  ): Promise<string[]> {
    const store = await this.getContext(entityId, entityType);
    if (!store || store.provisional.length === 0) return [];

    const demoted: string[] = [];

    for (const entry of store.provisional) {
      if ((entry.contradictedBy ?? []).length > 0) {
        await this.flag(entityId, entityType, { ...entry, status: 'excluded' });
        await this.removeFromBucket(entityId, entityType, 'provisional', entry.id);
        demoted.push(entry.id);
      }
    }

    return demoted;
  }

  /**
   * Expire provisional entries older than PROVISIONAL_EXPIRY_DAYS with no corroboration.
   * Returns IDs of expired entries.
   */
  async expireStale(
    entityId: string,
    entityType: EntityType,
  ): Promise<string[]> {
    const store = await this.getContext(entityId, entityType);
    if (!store || store.provisional.length === 0) return [];

    const expiryMs = PEC_THRESHOLDS.PROVISIONAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expired: string[] = [];

    for (const entry of store.provisional) {
      const since = entry.provisionalSince ? new Date(entry.provisionalSince).getTime() : 0;
      const hasCorroboration = (entry.corroboratedBy ?? []).length > 0;

      if (!hasCorroboration && now - since > expiryMs) {
        await this.flag(entityId, entityType, { ...entry, status: 'excluded' });
        await this.removeFromBucket(entityId, entityType, 'provisional', entry.id);
        expired.push(entry.id);
      }
    }

    return expired;
  }

  /** Returns all entityIds that have at least one provisional entry. */
  async findEntitiesWithProvisional(): Promise<Array<{ entityId: string; entityType: EntityType }>> {
    const records = await this.prisma.contextStore.findMany({
      select: { entityId: true, entityType: true, provisional: true },
    });

    return records
      .filter((r) => {
        try {
          const arr = r.provisional as unknown[];
          return Array.isArray(arr) && arr.length > 0;
        } catch {
          return false;
        }
      })
      .map((r) => ({ entityId: r.entityId, entityType: r.entityType as EntityType }));
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async upsertEntry(
    entityId: string,
    entityType: EntityType,
    bucket: 'validated' | 'provisional' | 'flagged',
    entry: MemoryEntry,
  ): Promise<void> {
    const record = await this.prisma.contextStore.findUnique({
      where: { entityId_entityType: { entityId, entityType } },
    });

    let store: ContextStore;

    if (!record) {
      store = this.emptyStore(entityId, entityType);
    } else {
      store = this.deserialise(record);
    }

    // Deduplicate by entry.id
    const existing = (store[bucket] as MemoryEntry[]).findIndex((e) => e.id === entry.id);
    if (existing >= 0) {
      (store[bucket] as MemoryEntry[])[existing] = entry;
    } else {
      (store[bucket] as MemoryEntry[]).push(entry);
    }

    // Rebuild lensIndex for validated bucket only
    if (bucket === 'validated') {
      store.lensIndex = this.buildLensIndex(store.validated);
    }

    store.version += 1;

    await this.prisma.contextStore.upsert({
      where: { entityId_entityType: { entityId, entityType } },
      create: {
        entityId,
        entityType,
        validated: store.validated as any,
        provisional: store.provisional as any,
        flagged: store.flagged as any,
        lensIndex: store.lensIndex as any,
        version: store.version,
      },
      update: {
        validated: store.validated as any,
        provisional: store.provisional as any,
        flagged: store.flagged as any,
        lensIndex: store.lensIndex as any,
        version: { increment: 1 },
      },
    });

    await this.invalidateCache(entityId, entityType);
  }

  private async removeFromBucket(
    entityId: string,
    entityType: EntityType,
    bucket: 'provisional' | 'flagged',
    entryId: string,
  ): Promise<void> {
    const record = await this.prisma.contextStore.findUnique({
      where: { entityId_entityType: { entityId, entityType } },
    });
    if (!record) return;

    const store = this.deserialise(record);
    store[bucket] = (store[bucket] as MemoryEntry[]).filter((e) => e.id !== entryId);

    await this.prisma.contextStore.update({
      where: { entityId_entityType: { entityId, entityType } },
      data: {
        [bucket]: store[bucket] as any,
        version: { increment: 1 },
      },
    });

    await this.invalidateCache(entityId, entityType);
  }

  private buildLensIndex(validated: MemoryEntry[]): Record<AudienceLens, string[]> {
    const index: Record<AudienceLens, string[]> = {
      family: [],
      coworker: [],
      friend: [],
      admirer: [],
      all: [],
    };

    for (const entry of validated) {
      if (!entry.lensRestriction || entry.lensRestriction.length === 0) {
        index.all.push(entry.id);
      } else {
        for (const lens of entry.lensRestriction) {
          if (lens in index) {
            index[lens].push(entry.id);
          }
        }
      }
    }

    return index;
  }

  private emptyStore(entityId: string, entityType: EntityType): ContextStore {
    return {
      entityId,
      entityType,
      validated: [],
      provisional: [],
      flagged: [],
      lensIndex: { family: [], coworker: [], friend: [], admirer: [], all: [] },
      lastUpdated: new Date(),
      version: 0,
    };
  }

  private deserialise(record: {
    entityId: string;
    entityType: string;
    validated: unknown;
    provisional: unknown;
    flagged: unknown;
    lensIndex: unknown;
    lastUpdated: Date;
    version: number;
  }): ContextStore {
    return {
      entityId: record.entityId,
      entityType: record.entityType as EntityType,
      validated: (record.validated as MemoryEntry[]) ?? [],
      provisional: (record.provisional as MemoryEntry[]) ?? [],
      flagged: (record.flagged as MemoryEntry[]) ?? [],
      lensIndex: (record.lensIndex as Record<AudienceLens, string[]>) ?? {
        family: [],
        coworker: [],
        friend: [],
        admirer: [],
        all: [],
      },
      lastUpdated: record.lastUpdated,
      version: record.version,
    };
  }

  private cacheKey(entityId: string, entityType: string): string {
    return `pec:${entityType}:${entityId}:context`;
  }

  private async writeCache(
    entityId: string,
    entityType: string,
    store: ContextStore,
  ): Promise<void> {
    try {
      await this.redis.set(
        this.cacheKey(entityId, entityType),
        JSON.stringify(store),
        'EX',
        this.cacheTtl,
      );
    } catch {
      // Cache write failure is non-fatal
    }
  }

  private async invalidateCache(entityId: string, entityType: string): Promise<void> {
    try {
      await this.redis.del(this.cacheKey(entityId, entityType));
    } catch {
      // Cache invalidation failure is non-fatal
    }
  }
}
