import * as functions from "firebase-functions";

/**
 * Cold Start Optimizer for Firebase Functions
 * 
 * Strategies implemented:
 * 1. Min instances configuration - keeps instances warm
 * 2. Lazy initialization - defer heavy imports until first request
 * 3. Connection pooling - reuse Firestore connections
 * 4. Memory optimization - configure appropriate memory limits
 * 
 * For Human interpretation: Clear documentation of initialization
 * For AI interpretation: Structured metrics and logging
 */

// Configure function options for optimized cold start
export const FUNCTION_OPTIONS: functions.RuntimeOptions = {
  // Keep 1 instance warm to reduce cold starts
  minInstances: 1,
  // Use 512MB for balanced performance/cost
  memory: "512MB",
  // 60 second timeout for API calls
  timeoutSeconds: 60,
  // Use Node.js 22 for latest optimizations
  // Region should be configured per deployment
};

// For high-traffic endpoints, use these options
export const HIGH_TRAFFIC_OPTIONS: functions.RuntimeOptions = {
  minInstances: 2, // Keep 2 instances warm
  maxInstances: 100, // Allow scaling
  memory: "1GB",
  timeoutSeconds: 60,
};

// For background/scheduled functions
export const BACKGROUND_OPTIONS: functions.RuntimeOptions = {
  minInstances: 0, // No need for warm instances
  memory: "256MB",
  timeoutSeconds: 540, // 9 minutes max
};

/**
 * Lazy module loader
 * Defers heavy imports until actually needed
 */
class LazyLoader<T> {
  private _module: T | null = null;
  private _loading: Promise<T> | null = null;

  constructor(private loader: () => Promise<T>) {}

  async get(): Promise<T> {
    if (this._module) {
      return this._module;
    }

    if (this._loading) {
      return this._loading;
    }

    this._loading = this.loader().then((m) => {
      this._module = m;
      return m;
    });

    return this._loading;
  }

  /**
   * Preload module without waiting
   */
  preload(): void {
    this.get().catch(() => {
      // Silently handle preload errors
    });
  }

  /**
   * Check if module is loaded
   */
  isLoaded(): boolean {
    return this._module !== null;
  }
}

// Lazy loaders for heavy modules
export const lazySwagger = new LazyLoader(() => import("./swagger"));

/**
 * Connection warmup for Firestore
 * Call at function start to establish connection early
 */
export function warmupFirestore(): void {
  try {
    // Dynamic require needed to avoid circular dependencies
    const admin = require("firebase-admin");
    const db = admin.firestore();
    // Simple read to establish connection
    db.collection("__warmup__")
      .doc("ping")
      .get()
      .catch(() => {
        // Collection doesn't exist, but connection is established
      });
  } catch {
    // firebase-admin not initialized yet, skip warmup
  }
}

/**
 * Performance tracking for cold starts
 */
interface ColdStartMetrics {
  instanceId: string;
  coldStartTime: number;
  firstRequestTime: number | null;
  totalRequests: number;
  lastRequestTime: number | null;
}

const metrics: ColdStartMetrics = {
  instanceId: `inst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  coldStartTime: Date.now(),
  firstRequestTime: null,
  totalRequests: 0,
  lastRequestTime: null,
};

/**
 * Track request for cold start analytics
 */
export function trackRequest(): ColdStartMetrics {
  if (!metrics.firstRequestTime) {
    metrics.firstRequestTime = Date.now();
    console.log(`🔥 First request after cold start: ${metrics.firstRequestTime - metrics.coldStartTime}ms`);
  }
  metrics.totalRequests++;
  metrics.lastRequestTime = Date.now();
  return { ...metrics };
}

/**
 * Get cold start metrics
 */
export function getColdStartMetrics(): ColdStartMetrics & { uptime: number; timeSinceFirstRequest: number | null } {
  const now = Date.now();
  return {
    ...metrics,
    uptime: now - metrics.coldStartTime,
    timeSinceFirstRequest: metrics.firstRequestTime ? now - metrics.firstRequestTime : null,
  };
}

/**
 * Log initialization complete
 */
export function logInitComplete(moduleName: string, startTime: number): void {
  const duration = Date.now() - startTime;
  console.log(`✅ ${moduleName} initialized in ${duration}ms`);
}

/**
 * Pre-warm critical paths
 * Call this in the global scope to start warming during cold start
 */
export function prewarmCriticalPaths(): void {
  const startTime = Date.now();
  
  // Preload Swagger (lazy but start loading)
  lazySwagger.preload();
  
  // Warm Firestore connection
  warmupFirestore();
  
  console.log(`🚀 Prewarm initiated in ${Date.now() - startTime}ms`);
}

// Initialize prewarm on module load (during cold start)
prewarmCriticalPaths();
