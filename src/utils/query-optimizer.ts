/**
 * Query Optimizer Service
 * Sprint H6.4: Database Query Optimization
 *
 * Otimiza queries Firestore para máxima performance:
 * - Batching de leituras paralelas
 * - Limit automático para prevenir full-scans
 * - Select fields (projeção) para reduzir transferência
 * - Cursor-based pagination para grandes datasets
 * - Query caching com TTL
 */

import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { createLogger } from "./structured-logger";

const logger = createLogger("query-optimizer");

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Opções para otimização de query
 */
export interface QueryOptions {
  /** Limite máximo de resultados (default: 100, max: 1000) */
  limit?: number;
  /** Campos específicos para retornar (projeção) */
  selectFields?: string[];
  /** Cursor para paginação (ID do último documento) */
  cursor?: string;
  /** Direção do cursor */
  cursorDirection?: "startAfter" | "startAt" | "endBefore" | "endAt";
  /** Tempo de cache em segundos (0 = sem cache) */
  cacheTTL?: number;
  /** Incluir metadados de performance */
  includeMetrics?: boolean;
  /** Timeout da query em ms (default: 10000) */
  timeout?: number;
}

/**
 * Resultado otimizado de query
 */
export interface OptimizedQueryResult<T> {
  /** Documentos retornados */
  data: T[];
  /** Total estimado (quando disponível) */
  totalEstimate?: number;
  /** Cursor para próxima página */
  nextCursor?: string;
  /** Se há mais resultados */
  hasMore: boolean;
  /** Métricas de performance (quando solicitado) */
  metrics?: QueryMetrics;
  /** Se veio do cache */
  fromCache: boolean;
}

/**
 * Métricas de performance da query
 */
export interface QueryMetrics {
  /** Tempo de execução em ms */
  executionTimeMs: number;
  /** Número de documentos lidos */
  documentsRead: number;
  /** Tamanho estimado da resposta em bytes */
  responseSizeBytes: number;
  /** Se usou índice composto */
  usedIndex: boolean;
  /** Quantidade de operações de leitura */
  readOperations: number;
}

/**
 * Configuração de batch read
 */
export interface BatchReadConfig {
  /** IDs dos documentos */
  ids: string[];
  /** Collection path */
  collection: string;
  /** Campos para projeção */
  selectFields?: string[];
  /** Tamanho do batch (max: 100 por operação getAll) */
  batchSize?: number;
}

/**
 * Cache entry
 */
interface CacheEntry<T> {
  data: OptimizedQueryResult<T>;
  expiresAt: number;
  queryHash: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Limite máximo absoluto para queries */
const MAX_QUERY_LIMIT = 1000;

/** Limite padrão para queries */
const DEFAULT_QUERY_LIMIT = 100;

/** Tamanho máximo de batch para getAll */
const MAX_BATCH_SIZE = 100;

/** TTL padrão do cache em segundos */
const DEFAULT_CACHE_TTL = 60;

/** Timeout padrão de query em ms */
const DEFAULT_QUERY_TIMEOUT = 10000;

/** Máximo de entries no cache (LRU) */
const MAX_CACHE_ENTRIES = 500;

// ============================================================================
// CACHE
// ============================================================================

/** In-memory query cache */
const queryCache = new Map<string, CacheEntry<unknown>>();

/** Cache access order for LRU */
const cacheAccessOrder: string[] = [];

/**
 * Gera hash para cache key
 */
function generateQueryHash(
  collection: string,
  filters: Record<string, unknown>,
  options: QueryOptions
): string {
  const payload = JSON.stringify({ collection, filters, options });
  return crypto.createHash("md5").update(payload).digest("hex");
}

/**
 * Obtém entry do cache se válido
 */
function getCacheEntry<T>(hash: string): OptimizedQueryResult<T> | null {
  const entry = queryCache.get(hash) as CacheEntry<T> | undefined;

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    queryCache.delete(hash);
    return null;
  }

  // Atualiza ordem de acesso (LRU)
  const idx = cacheAccessOrder.indexOf(hash);
  if (idx > -1) {
    cacheAccessOrder.splice(idx, 1);
  }
  cacheAccessOrder.push(hash);

  return entry.data as OptimizedQueryResult<T>;
}

/**
 * Adiciona entry ao cache com LRU eviction
 */
function setCacheEntry<T>(
  hash: string,
  data: OptimizedQueryResult<T>,
  ttlSeconds: number
): void {
  // LRU eviction se necessário
  while (queryCache.size >= MAX_CACHE_ENTRIES && cacheAccessOrder.length > 0) {
    const oldest = cacheAccessOrder.shift();
    if (oldest) {
      queryCache.delete(oldest);
    }
  }

  queryCache.set(hash, {
    data: data as OptimizedQueryResult<unknown>,
    expiresAt: Date.now() + ttlSeconds * 1000,
    queryHash: hash,
  });
  cacheAccessOrder.push(hash);
}

/**
 * Limpa cache expirado
 */
export function cleanupCache(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [hash, entry] of queryCache.entries()) {
    if (now > entry.expiresAt) {
      queryCache.delete(hash);
      const idx = cacheAccessOrder.indexOf(hash);
      if (idx > -1) {
        cacheAccessOrder.splice(idx, 1);
      }
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Obtém estatísticas do cache
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  hitRate: number;
  } {
  return {
    size: queryCache.size,
    maxSize: MAX_CACHE_ENTRIES,
    hitRate: cacheHits / (cacheHits + cacheMisses) || 0,
  };
}

// Cache hit/miss counters
let cacheHits = 0;
let cacheMisses = 0;

// ============================================================================
// QUERY OPTIMIZER CLASS
// ============================================================================

export class QueryOptimizer {
  private readonly db: admin.firestore.Firestore;

  constructor(firestore?: admin.firestore.Firestore) {
    this.db = firestore || admin.firestore();
  }

  /**
   * Executa query otimizada com paginação e cache
   */
  async executeQuery<T extends admin.firestore.DocumentData>(
    collection: string,
    filters: Record<string, unknown> = {},
    options: QueryOptions = {}
  ): Promise<OptimizedQueryResult<T>> {
    const startTime = Date.now();
    const {
      limit = DEFAULT_QUERY_LIMIT,
      selectFields,
      cursor,
      cursorDirection = "startAfter",
      cacheTTL = DEFAULT_CACHE_TTL,
      includeMetrics = false,
      timeout = DEFAULT_QUERY_TIMEOUT,
    } = options;

    // Enforce limits
    const safeLimit = Math.min(limit, MAX_QUERY_LIMIT);

    // Check cache
    const queryHash = generateQueryHash(collection, filters, options);
    if (cacheTTL > 0) {
      const cached = getCacheEntry<T>(queryHash);
      if (cached) {
        cacheHits++;
        logger.info(
          "query_cache_hit",
          `Cache hit for ${collection} query`,
          {
            collection,
            hash: queryHash.substring(0, 8),
          }
        );
        return { ...cached, fromCache: true };
      }
      cacheMisses++;
    }

    // Build query
    let query: admin.firestore.Query<admin.firestore.DocumentData> =
      this.db.collection(collection);

    // Apply filters
    for (const [field, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        if (typeof value === "object" && "operator" in value) {
          const filterObj = value as { operator: string; value: unknown };
          query = query.where(
            field,
            filterObj.operator as admin.firestore.WhereFilterOp,
            filterObj.value
          );
        } else {
          query = query.where(field, "==", value);
        }
      }
    }

    // Apply cursor for pagination
    if (cursor) {
      const cursorDoc = await this.db.collection(collection).doc(cursor).get();
      if (cursorDoc.exists) {
        switch (cursorDirection) {
        case "startAfter":
          query = query.startAfter(cursorDoc);
          break;
        case "startAt":
          query = query.startAt(cursorDoc);
          break;
        case "endBefore":
          query = query.endBefore(cursorDoc);
          break;
        case "endAt":
          query = query.endAt(cursorDoc);
          break;
        }
      }
    }

    // Apply limit (+1 para verificar hasMore)
    query = query.limit(safeLimit + 1);

    // Apply select fields (projeção)
    if (selectFields && selectFields.length > 0) {
      query = query.select(...selectFields);
    }

    // Execute with timeout
    const snapshot = await Promise.race([
      query.get(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), timeout)
      ),
    ]);

    // Process results
    const docs = snapshot.docs;
    const hasMore = docs.length > safeLimit;
    const resultDocs = hasMore ? docs.slice(0, safeLimit) : docs;

    const data: T[] = resultDocs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as unknown as T[];

    const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : undefined;

    const executionTimeMs = Date.now() - startTime;

    // Build result
    const result: OptimizedQueryResult<T> = {
      data,
      hasMore,
      nextCursor,
      fromCache: false,
    };

    // Add metrics if requested
    if (includeMetrics) {
      result.metrics = {
        executionTimeMs,
        documentsRead: docs.length,
        responseSizeBytes: JSON.stringify(data).length,
        usedIndex: true, // Firestore always uses indexes
        readOperations: docs.length,
      };
    }

    // Cache result
    if (cacheTTL > 0) {
      setCacheEntry(queryHash, result, cacheTTL);
    }

    // Log query execution
    logger.info(
      "query_executed",
      `Query executed on ${collection}: ${data.length} results`,
      {
        collection,
        filters: Object.keys(filters),
        limit: safeLimit,
        resultsCount: data.length,
        hasMore,
        executionTimeMs,
        fromCache: false,
      }
    );

    return result;
  }

  /**
   * Batch read de múltiplos documentos por ID
   * Mais eficiente que múltiplas leituras individuais
   */
  async batchRead<T extends admin.firestore.DocumentData>(
    config: BatchReadConfig
  ): Promise<T[]> {
    const startTime = Date.now();
    const { ids, collection, selectFields, batchSize = MAX_BATCH_SIZE } = config;

    if (ids.length === 0) {
      return [];
    }

    // Remove duplicates
    const uniqueIds = [...new Set(ids)];

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      batches.push(uniqueIds.slice(i, i + batchSize));
    }

    // Execute batches in parallel
    const results: T[] = [];

    await Promise.all(
      batches.map(async (batchIds) => {
        const refs = batchIds.map((id) => this.db.collection(collection).doc(id));
        const snapshots = await this.db.getAll(...refs);

        for (const snap of snapshots) {
          if (snap.exists) {
            let data = { id: snap.id, ...snap.data() } as unknown as T;

            // Apply field projection manually for getAll
            if (selectFields && selectFields.length > 0) {
              const projected: Record<string, unknown> = { id: snap.id };
              for (const field of selectFields) {
                if (field in data) {
                  projected[field] = (data as Record<string, unknown>)[field];
                }
              }
              data = projected as T;
            }

            results.push(data);
          }
        }
      })
    );

    const executionTimeMs = Date.now() - startTime;

    logger.info(
      "batch_read_executed",
      `Batch read from ${collection}: ${results.length}/${ids.length} documents`,
      {
        collection,
        requestedIds: ids.length,
        uniqueIds: uniqueIds.length,
        batchCount: batches.length,
        resultsCount: results.length,
        executionTimeMs,
      }
    );

    return results;
  }

  /**
   * Agregação otimizada com cache
   */
  async aggregate(
    collection: string,
    aggregationType: "count" | "sum" | "avg",
    field?: string,
    filters: Record<string, unknown> = {},
    cacheTTL: number = 300 // 5 min default para agregações
  ): Promise<{ value: number; fromCache: boolean }> {
    const startTime = Date.now();

    // Check cache
    const queryHash = generateQueryHash(
      collection,
      { ...filters, aggregationType, field },
      { cacheTTL }
    );

    if (cacheTTL > 0) {
      const cached = getCacheEntry<{ value: number }>(queryHash);
      if (cached && cached.data.length > 0) {
        cacheHits++;
        return { value: cached.data[0].value, fromCache: true };
      }
      cacheMisses++;
    }

    // Build base query
    let query: admin.firestore.Query<admin.firestore.DocumentData> =
      this.db.collection(collection);

    for (const [filterField, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.where(filterField, "==", value);
      }
    }

    let result: number;

    switch (aggregationType) {
    case "count": {
      const countQuery = query.count();
      const countSnapshot = await countQuery.get();
      result = countSnapshot.data().count;
      break;
    }
    case "sum":
    case "avg": {
      if (!field) {
        throw new Error(`Field required for ${aggregationType} aggregation`);
      }
      // Firestore doesn't have native sum/avg, so we need to fetch all
      // For large collections, consider using a counter document pattern
      const snapshot = await query.select(field).get();
      const values = snapshot.docs
        .map((doc) => doc.data()[field] as number)
        .filter((v) => typeof v === "number");

      if (aggregationType === "sum") {
        result = values.reduce((acc, v) => acc + v, 0);
      } else {
        result = values.length > 0
          ? values.reduce((acc, v) => acc + v, 0) / values.length
          : 0;
      }
      break;
    }
    default:
      throw new Error(`Unknown aggregation type: ${aggregationType}`);
    }

    const executionTimeMs = Date.now() - startTime;

    // Cache result
    if (cacheTTL > 0) {
      setCacheEntry(
        queryHash,
        { data: [{ value: result }], hasMore: false, fromCache: false },
        cacheTTL
      );
    }

    logger.info(
      "aggregation_executed",
      `Aggregation ${aggregationType} on ${collection}: ${result}`,
      {
        collection,
        aggregationType,
        field,
        result,
        executionTimeMs,
      }
    );

    return { value: result, fromCache: false };
  }

  /**
   * Paginação eficiente com cursor
   */
  async paginate<T extends admin.firestore.DocumentData>(
    collection: string,
    orderByField: string,
    orderDirection: "asc" | "desc" = "desc",
    pageSize: number = 20,
    cursor?: string,
    filters: Record<string, unknown> = {}
  ): Promise<{
    data: T[];
    nextCursor?: string;
    prevCursor?: string;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  }> {
    const safePageSize = Math.min(pageSize, MAX_QUERY_LIMIT);

    let query: admin.firestore.Query<admin.firestore.DocumentData> =
      this.db.collection(collection);

    // Apply filters
    for (const [field, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.where(field, "==", value);
      }
    }

    // Apply ordering
    query = query.orderBy(orderByField, orderDirection);

    // Apply cursor
    if (cursor) {
      const cursorDoc = await this.db.collection(collection).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    // Fetch pageSize + 1 to check hasNextPage
    query = query.limit(safePageSize + 1);

    const snapshot = await query.get();
    const docs = snapshot.docs;
    const hasNextPage = docs.length > safePageSize;
    const resultDocs = hasNextPage ? docs.slice(0, safePageSize) : docs;

    const data: T[] = resultDocs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as unknown as T[];

    return {
      data,
      nextCursor: hasNextPage ? resultDocs[resultDocs.length - 1].id : undefined,
      prevCursor: cursor,
      hasNextPage,
      hasPrevPage: !!cursor,
    };
  }

  /**
   * Invalida cache por collection
   */
  invalidateCacheByCollection(collection: string): number {
    let invalidated = 0;

    for (const [hash, entry] of queryCache.entries()) {
      if (entry.queryHash.includes(collection)) {
        queryCache.delete(hash);
        const idx = cacheAccessOrder.indexOf(hash);
        if (idx > -1) {
          cacheAccessOrder.splice(idx, 1);
        }
        invalidated++;
      }
    }

    logger.info(
      "cache_invalidated",
      `Cache invalidated for ${collection}: ${invalidated} entries`,
      { collection, invalidatedEntries: invalidated }
    );

    return invalidated;
  }

  /**
   * Limpa todo o cache
   */
  clearCache(): void {
    queryCache.clear();
    cacheAccessOrder.length = 0;
    cacheHits = 0;
    cacheMisses = 0;
    logger.info("cache_cleared", "Query cache cleared");
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let queryOptimizerInstance: QueryOptimizer | null = null;

/**
 * Obtém instância singleton do QueryOptimizer
 */
export function getQueryOptimizer(): QueryOptimizer {
  if (!queryOptimizerInstance) {
    queryOptimizerInstance = new QueryOptimizer();
  }
  return queryOptimizerInstance;
}

/**
 * Cria nova instância do QueryOptimizer com Firestore customizado
 */
export function createQueryOptimizer(
  firestore: admin.firestore.Firestore
): QueryOptimizer {
  return new QueryOptimizer(firestore);
}
