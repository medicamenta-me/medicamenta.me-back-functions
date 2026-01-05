/**
 * Memory Profiler Utility
 * Sprint H6.5: Memory Profiling
 *
 * Monitora e otimiza uso de memória em Cloud Functions:
 * - Tracking de alocação de memória
 * - Detecção de memory leaks
 * - Garbage collection hints
 * - Alertas de threshold
 */

import { createLogger } from "./structured-logger";

const logger = createLogger("memory-profiler");

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Snapshot de uso de memória
 */
export interface MemorySnapshot {
  /** Timestamp do snapshot */
  timestamp: number;
  /** Heap usado em bytes */
  heapUsed: number;
  /** Heap total em bytes */
  heapTotal: number;
  /** RSS (Resident Set Size) em bytes */
  rss: number;
  /** Memória externa em bytes */
  external: number;
  /** Array buffers em bytes */
  arrayBuffers: number;
  /** Percentual de heap usado */
  heapUsagePercent: number;
}

/**
 * Métricas de memória agregadas
 */
export interface MemoryMetrics {
  /** Snapshot atual */
  current: MemorySnapshot;
  /** Média de heap usado */
  avgHeapUsed: number;
  /** Pico de heap usado */
  peakHeapUsed: number;
  /** Taxa de crescimento de memória (bytes/min) */
  growthRate: number;
  /** Número de snapshots coletados */
  sampleCount: number;
  /** Se há possível memory leak */
  possibleLeak: boolean;
  /** Tempo desde início do tracking em ms */
  trackingDurationMs: number;
}

/**
 * Configuração do profiler
 */
export interface ProfilerConfig {
  /** Intervalo de coleta em ms */
  sampleIntervalMs: number;
  /** Máximo de amostras a manter */
  maxSamples: number;
  /** Threshold de warning (percentual) */
  warningThreshold: number;
  /** Threshold crítico (percentual) */
  criticalThreshold: number;
  /** Taxa de crescimento que indica leak (bytes/min) */
  leakGrowthRateThreshold: number;
  /** Se deve logar automaticamente */
  autoLog: boolean;
}

/**
 * Resultado de operação monitorada
 */
export interface OperationMemoryResult<T> {
  /** Resultado da operação */
  result: T;
  /** Memória usada pela operação */
  memoryDelta: number;
  /** Tempo de execução em ms */
  executionTimeMs: number;
  /** Se excedeu threshold */
  exceededThreshold: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Configuração padrão */
const DEFAULT_CONFIG: ProfilerConfig = {
  sampleIntervalMs: 5000, // 5 segundos
  maxSamples: 60, // 5 minutos de histórico
  warningThreshold: 70, // 70% heap
  criticalThreshold: 85, // 85% heap
  leakGrowthRateThreshold: 1024 * 1024, // 1MB/min
  autoLog: true,
};

// Cloud Functions memory limits
const MEMORY_LIMITS = {
  "128MB": 128 * 1024 * 1024,
  "256MB": 256 * 1024 * 1024,
  "512MB": 512 * 1024 * 1024,
  "1GB": 1024 * 1024 * 1024,
  "2GB": 2 * 1024 * 1024 * 1024,
  "4GB": 4 * 1024 * 1024 * 1024,
  "8GB": 8 * 1024 * 1024 * 1024,
};

// ============================================================================
// MEMORY PROFILER CLASS
// ============================================================================

export class MemoryProfiler {
  private config: ProfilerConfig;
  private snapshots: MemorySnapshot[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  private configuredMemoryLimit: number;

  constructor(
    config: Partial<ProfilerConfig> = {},
    memoryLimit: keyof typeof MEMORY_LIMITS = "256MB"
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.configuredMemoryLimit = MEMORY_LIMITS[memoryLimit];
  }

  /**
   * Coleta snapshot atual de memória
   */
  takeSnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      heapUsagePercent: (memUsage.heapUsed / this.configuredMemoryLimit) * 100,
    };

    // Check thresholds
    if (snapshot.heapUsagePercent >= this.config.criticalThreshold) {
      logger.error(
        "memory_critical",
        `Memory critical: ${snapshot.heapUsagePercent.toFixed(2)}% heap used`,
        undefined,
        {
          heapUsagePercent: snapshot.heapUsagePercent.toFixed(2),
          heapUsed: this.formatBytes(snapshot.heapUsed),
          limit: this.formatBytes(this.configuredMemoryLimit),
        }
      );
    } else if (snapshot.heapUsagePercent >= this.config.warningThreshold) {
      logger.warn(
        "memory_warning",
        `Memory warning: ${snapshot.heapUsagePercent.toFixed(2)}% heap used`,
        {
          heapUsagePercent: snapshot.heapUsagePercent.toFixed(2),
          heapUsed: this.formatBytes(snapshot.heapUsed),
          limit: this.formatBytes(this.configuredMemoryLimit),
        }
      );
    }

    return snapshot;
  }

  /**
   * Inicia coleta automática de snapshots
   */
  startTracking(): void {
    if (this.intervalId) {
      return; // Já está rodando
    }

    this.startTime = Date.now();
    this.snapshots = [];

    // Snapshot inicial
    this.snapshots.push(this.takeSnapshot());

    // Coleta periódica
    this.intervalId = setInterval(() => {
      const snapshot = this.takeSnapshot();
      this.snapshots.push(snapshot);

      // Manter apenas maxSamples
      while (this.snapshots.length > this.config.maxSamples) {
        this.snapshots.shift();
      }

      // Auto log se configurado
      if (this.config.autoLog && this.snapshots.length % 12 === 0) {
        // Log a cada minuto
        const metrics = this.getMetrics();
        logger.info(
          "memory_metrics",
          `Memory metrics: ${metrics.current.heapUsagePercent.toFixed(2)}% heap used`,
          {
            heapUsed: this.formatBytes(metrics.current.heapUsed),
            heapUsagePercent: metrics.current.heapUsagePercent.toFixed(2),
            avgHeapUsed: this.formatBytes(metrics.avgHeapUsed),
            peakHeapUsed: this.formatBytes(metrics.peakHeapUsed),
            growthRate: this.formatBytes(metrics.growthRate) + "/min",
            possibleLeak: metrics.possibleLeak,
          }
        );
      }
    }, this.config.sampleIntervalMs);

    logger.info(
      "memory_tracking_started",
      `Memory tracking started with ${this.config.sampleIntervalMs}ms interval`,
      {
        sampleIntervalMs: this.config.sampleIntervalMs,
        memoryLimit: this.formatBytes(this.configuredMemoryLimit),
      }
    );
  }

  /**
   * Para coleta automática
   */
  stopTracking(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;

      logger.info(
        "memory_tracking_stopped",
        `Memory tracking stopped after ${this.snapshots.length} samples`,
        {
          sampleCount: this.snapshots.length,
          trackingDurationMs: Date.now() - this.startTime,
        }
      );
    }
  }

  /**
   * Obtém métricas agregadas
   */
  getMetrics(): MemoryMetrics {
    const current = this.takeSnapshot();

    if (this.snapshots.length === 0) {
      return {
        current,
        avgHeapUsed: current.heapUsed,
        peakHeapUsed: current.heapUsed,
        growthRate: 0,
        sampleCount: 1,
        possibleLeak: false,
        trackingDurationMs: Date.now() - this.startTime,
      };
    }

    // Calcular média
    const totalHeap = this.snapshots.reduce((sum, s) => sum + s.heapUsed, 0);
    const avgHeapUsed = totalHeap / this.snapshots.length;

    // Calcular pico
    const peakHeapUsed = Math.max(...this.snapshots.map((s) => s.heapUsed));

    // Calcular taxa de crescimento (linear regression simplificado)
    const growthRate = this.calculateGrowthRate();

    // Detectar possível leak
    const possibleLeak = growthRate > this.config.leakGrowthRateThreshold;

    if (possibleLeak) {
      logger.warn(
        "possible_memory_leak",
        `Possible memory leak detected: ${this.formatBytes(growthRate)}/min growth rate`,
        {
          growthRate: this.formatBytes(growthRate) + "/min",
          threshold: this.formatBytes(this.config.leakGrowthRateThreshold) + "/min",
          sampleCount: this.snapshots.length,
        }
      );
    }

    return {
      current,
      avgHeapUsed,
      peakHeapUsed,
      growthRate,
      sampleCount: this.snapshots.length,
      possibleLeak,
      trackingDurationMs: Date.now() - this.startTime,
    };
  }

  /**
   * Monitora execução de operação
   */
  async monitorOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    memoryThreshold?: number
  ): Promise<OperationMemoryResult<T>> {
    const threshold = memoryThreshold || 50 * 1024 * 1024; // 50MB default

    // Forçar GC se disponível
    this.suggestGC();

    const beforeSnapshot = this.takeSnapshot();
    const startTime = Date.now();

    const result = await operation();

    const executionTimeMs = Date.now() - startTime;
    const afterSnapshot = this.takeSnapshot();

    const memoryDelta = afterSnapshot.heapUsed - beforeSnapshot.heapUsed;
    const exceededThreshold = memoryDelta > threshold;

    if (exceededThreshold) {
      logger.warn(
        "operation_memory_exceeded",
        `Operation ${operationName} exceeded memory threshold`,
        {
          operation: operationName,
          memoryDelta: this.formatBytes(memoryDelta),
          threshold: this.formatBytes(threshold),
          executionTimeMs,
        }
      );
    } else {
      logger.info(
        "operation_memory",
        `Operation ${operationName} completed`,
        {
          operation: operationName,
          memoryDelta: this.formatBytes(memoryDelta),
          executionTimeMs,
        }
      );
    }

    return {
      result,
      memoryDelta,
      executionTimeMs,
      exceededThreshold,
    };
  }

  /**
   * Calcula taxa de crescimento usando regressão linear simples
   */
  private calculateGrowthRate(): number {
    if (this.snapshots.length < 2) {
      return 0;
    }

    const n = this.snapshots.length;
    const firstSnapshot = this.snapshots[0];
    const lastSnapshot = this.snapshots[n - 1];

    // Diferença de tempo em minutos
    const timeDeltaMin = (lastSnapshot.timestamp - firstSnapshot.timestamp) / 60000;

    if (timeDeltaMin === 0) {
      return 0;
    }

    // Diferença de memória em bytes
    const memoryDelta = lastSnapshot.heapUsed - firstSnapshot.heapUsed;

    // Taxa em bytes/minuto
    return memoryDelta / timeDeltaMin;
  }

  /**
   * Sugere garbage collection (se --expose-gc flag estiver habilitado)
   */
  suggestGC(): boolean {
    if (global.gc) {
      global.gc();
      logger.info("gc_triggered", "Garbage collection triggered manually");
      return true;
    }
    return false;
  }

  /**
   * Formata bytes para string legível
   */
  formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let value = Math.abs(bytes);
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    const sign = bytes < 0 ? "-" : "";
    return `${sign}${value.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Limpa histórico de snapshots
   */
  clearSnapshots(): void {
    this.snapshots = [];
    this.startTime = Date.now();
  }

  /**
   * Obtém histórico de snapshots
   */
  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Verifica se está próximo do limite de memória
   */
  isNearLimit(thresholdPercent: number = 80): boolean {
    const current = this.takeSnapshot();
    return current.heapUsagePercent >= thresholdPercent;
  }

  /**
   * Obtém recomendações de otimização
   */
  getOptimizationRecommendations(): string[] {
    const metrics = this.getMetrics();
    const recommendations: string[] = [];

    if (metrics.possibleLeak) {
      recommendations.push(
        "⚠️ Possível memory leak detectado. Revise closures e event listeners não removidos."
      );
    }

    if (metrics.current.heapUsagePercent > 70) {
      recommendations.push(
        "🔴 Heap usage alto. Considere aumentar memória da Cloud Function ou otimizar processamento."
      );
    }

    if (metrics.current.external > 50 * 1024 * 1024) {
      recommendations.push(
        "📦 Uso elevado de external memory. Verifique buffers e streams não finalizados."
      );
    }

    if (metrics.current.arrayBuffers > 30 * 1024 * 1024) {
      recommendations.push(
        "📊 ArrayBuffers elevados. Limpe arrays grandes após uso."
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("✅ Uso de memória está dentro de parâmetros normais.");
    }

    return recommendations;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let profilerInstance: MemoryProfiler | null = null;

/**
 * Obtém instância singleton do profiler
 */
export function getMemoryProfiler(
  config?: Partial<ProfilerConfig>,
  memoryLimit?: keyof typeof MEMORY_LIMITS
): MemoryProfiler {
  if (!profilerInstance) {
    profilerInstance = new MemoryProfiler(config, memoryLimit);
  }
  return profilerInstance;
}

/**
 * Cria nova instância do profiler
 */
export function createMemoryProfiler(
  config?: Partial<ProfilerConfig>,
  memoryLimit?: keyof typeof MEMORY_LIMITS
): MemoryProfiler {
  return new MemoryProfiler(config, memoryLimit);
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

import { Request, Response, NextFunction } from "express";

/**
 * Middleware Express para monitoramento de memória
 */
export function memoryMonitorMiddleware(
  config?: Partial<ProfilerConfig>
): (req: Request, res: Response, next: NextFunction) => void {
  const profiler = getMemoryProfiler(config);

  return (req: Request, res: Response, next: NextFunction) => {
    const beforeSnapshot = profiler.takeSnapshot();
    const startTime = Date.now();

    res.on("finish", () => {
      const afterSnapshot = profiler.takeSnapshot();
      const memoryDelta = afterSnapshot.heapUsed - beforeSnapshot.heapUsed;
      const executionTimeMs = Date.now() - startTime;

      // Log apenas se significativo
      if (memoryDelta > 5 * 1024 * 1024 || executionTimeMs > 1000) {
        logger.info(
          "request_memory",
          `Request ${req.method} ${req.path} memory: ${profiler.formatBytes(memoryDelta)}`,
          {
            method: req.method,
            path: req.path,
            memoryDelta: profiler.formatBytes(memoryDelta),
            executionTimeMs,
            statusCode: res.statusCode,
          }
        );
      }
    });

    next();
  };
}

// ============================================================================
// DECORATORS (para uso com classes)
// ============================================================================

/**
 * Decorator para monitorar memória de método
 */
export function MonitorMemory(threshold?: number): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const profiler = getMemoryProfiler();

    descriptor.value = async function (...args: unknown[]) {
      return profiler.monitorOperation(
        () => originalMethod.apply(this, args),
        String(propertyKey),
        threshold
      );
    };

    return descriptor;
  };
}
