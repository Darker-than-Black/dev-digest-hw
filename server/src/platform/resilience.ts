/**
 * resilience primitives: timeouts on every external call + retry with
 * exponential backoff on transient failures (rate-limit / 5xx).
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return p;
  let handle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(handle!);
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide whether an error is retryable (rate-limit / 5xx by default). */
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown) => void;
}

function defaultIsRetryable(err: unknown): boolean {
  const status =
    (err as { status?: number })?.status ??
    (err as { statusCode?: number })?.statusCode ??
    (err as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  // network-ish errors
  const code = (err as { code?: string })?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 8000;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) break;
      opts.onRetry?.(attempt + 1, err);
      const delay = Math.min(max, base * 2 ** attempt) + Math.random() * base;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Thrown by CircuitBreaker.run when the circuit is open — the wrapped call is
 * short-circuited (never attempted) because the service recently kept timing
 * out / refusing connections. Fails in microseconds instead of hanging on the
 * per-call timeout, so page reads fall back to persisted data immediately.
 */
export class OfflineError extends Error {
  constructor(service = 'service') {
    super(`${service} circuit open (recent connectivity failures); call skipped`);
    this.name = 'OfflineError';
  }
}

/** A connectivity failure (timeout / network) counts toward tripping; an HTTP
 *  answer (even a 4xx/5xx) proves the service is reachable and does NOT trip. */
function defaultIsTripping(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  const code = (err as { code?: string })?.code;
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED'
  );
}

export interface CircuitBreakerOptions {
  /** consecutive tripping failures before the circuit opens (default 3). */
  threshold?: number;
  /** how long the circuit stays open before a single probe is allowed (default 20_000ms). */
  cooldownMs?: number;
  /** which errors count toward tripping — timeouts / network errors by default. */
  isTripping?: (err: unknown) => boolean;
  /** injectable clock (tests). */
  now?: () => number;
  /** label used in the OfflineError message. */
  name?: string;
  /** fired on transition to open / back to closed — for logging. */
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * Process-wide circuit breaker for a flaky external service. Closed → normal.
 * After `threshold` consecutive connectivity failures it opens: every call is
 * rejected with OfflineError for `cooldownMs`. Then one probe is allowed
 * (half-open); its success closes the circuit, its failure re-opens it. HTTP
 * answers (4xx/5xx) prove reachability and never trip it — only timeouts /
 * network errors do.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  // Half-open lets exactly ONE call through to probe the service; concurrent
  // callers short-circuit until that probe settles. Without this, every caller
  // during the probe window (which can be as long as the underlying per-call
  // timeout) is let through and hangs — defeating the breaker.
  private probing = false;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly isTripping: (err: unknown) => boolean;
  private readonly now: () => number;
  private readonly name: string;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = opts.threshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 20_000;
    this.isTripping = opts.isTripping ?? defaultIsTripping;
    this.now = opts.now ?? Date.now;
    this.name = opts.name ?? 'service';
    this.onOpen = opts.onOpen;
    this.onClose = opts.onClose;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < this.cooldownMs) throw new OfflineError(this.name);
      // Cooldown elapsed → transition to half-open and let THIS call probe.
      this.state = 'half-open';
      this.probing = false;
    }
    // Half-open with a probe already in flight → short-circuit the rest so only
    // one call pays the (slow) probe cost per cooldown cycle.
    if (this.state === 'half-open') {
      if (this.probing) throw new OfflineError(this.name);
      this.probing = true;
    }
    try {
      const res = await fn();
      this.onSuccess();
      return res;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess(): void {
    const wasOpen = this.state !== 'closed';
    this.failures = 0;
    this.probing = false;
    this.state = 'closed';
    if (wasOpen) this.onClose?.();
  }

  private onFailure(err: unknown): void {
    this.probing = false;
    if (!this.isTripping(err)) {
      // Reachable (it answered) — clear the streak; don't hold the circuit open.
      if (this.state !== 'closed') {
        this.state = 'closed';
        this.failures = 0;
        this.onClose?.();
      }
      return;
    }
    this.failures += 1;
    if (this.state !== 'open' && (this.state === 'half-open' || this.failures >= this.threshold)) {
      this.state = 'open';
      this.openedAt = this.now();
      this.onOpen?.();
    }
  }
}
