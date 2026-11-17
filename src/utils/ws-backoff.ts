export interface ExponentialBackoffConfig {
  /** Ritardo iniziale in millisecondi per il 1° tentativo di riconnessione (default: 1000 ms) */
  initialDelayMs?: number;
  /** Fattore moltiplicativo ad ogni tentativo fallito (default: 2) */
  multiplier?: number;
  /** Ritardo massimo in millisecondi tra due tentativi consecutivi (default: 30000 ms) */
  maxDelayMs?: number;
  /** Fattore di jitter casuale relativo [0..0.5] per evitare collisioni di riconnessione (default: 0.1) */
  jitterRatio?: number;
  /** Numero massimo di tentativi automatici prima di fermarsi in stato offline (default: 10) */
  maxAttempts?: number;
}

export interface NormalizedBackoffConfig {
  initialDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
  jitterRatio: number;
  maxAttempts: number;
}

export const DEFAULT_EXPONENTIAL_BACKOFF_CONFIG: NormalizedBackoffConfig = {
  initialDelayMs: 1000,
  multiplier: 2,
  maxDelayMs: 30000,
  jitterRatio: 0.1,
  maxAttempts: 10,
};

export function normalizeExponentialBackoffConfig(
  config: ExponentialBackoffConfig = {}
): NormalizedBackoffConfig {
  const initialDelayMs = Math.max(50, Number(config.initialDelayMs ?? DEFAULT_EXPONENTIAL_BACKOFF_CONFIG.initialDelayMs) || 1000);
  const multiplier = Math.max(1.1, Number(config.multiplier ?? DEFAULT_EXPONENTIAL_BACKOFF_CONFIG.multiplier) || 2);
  const maxDelayMs = Math.max(initialDelayMs, Number(config.maxDelayMs ?? DEFAULT_EXPONENTIAL_BACKOFF_CONFIG.maxDelayMs) || 30000);
  const jitterRatio = Math.min(0.5, Math.max(0, Number(config.jitterRatio ?? DEFAULT_EXPONENTIAL_BACKOFF_CONFIG.jitterRatio) || 0));
  const maxAttempts = Math.max(1, Math.floor(Number(config.maxAttempts ?? DEFAULT_EXPONENTIAL_BACKOFF_CONFIG.maxAttempts) || 10));

  return {
    initialDelayMs,
    multiplier,
    maxDelayMs,
    jitterRatio,
    maxAttempts,
  };
}

/**
 * Calcola il ritardo di riconnessione (ms) usando exponential backoff:
 *   delay = min(maxDelayMs, initialDelayMs * multiplier^(attempt - 1)) + jitter
 */
export function computeExponentialBackoffDelay(
  attempt: number,
  config: ExponentialBackoffConfig = {},
  randomFn: () => number = Math.random
): number {
  const normalized = normalizeExponentialBackoffConfig(config);
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const rawDelay = normalized.initialDelayMs * Math.pow(normalized.multiplier, safeAttempt - 1);
  const cappedDelay = Math.min(normalized.maxDelayMs, Math.round(rawDelay));
  const jitterOffset =
    normalized.jitterRatio > 0
      ? Math.round(cappedDelay * normalized.jitterRatio * Math.max(0, Math.min(1, randomFn())))
      : 0;
  return Math.min(normalized.maxDelayMs, cappedDelay + jitterOffset);
}
