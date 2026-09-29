/**
 * Abstraksi rate limit login.
 * Implementasi default: in-memory (tepat untuk deployment single-instance).
 * Untuk multi-instance, ganti singleton `loginLimiter` dengan implementasi
 * berbasis store terpusat (mis. Redis/Upstash) yang memenuhi interface ini —
 * signature pemanggil tidak perlu berubah.
 */
export interface LoginRateLimiter {
  /** true bila percobaan diizinkan. */
  allowed(key: string): boolean;
  /** Catat kegagalan. */
  fail(key: string): void;
  /** Reset setelah sukses. */
  reset(key: string): void;
}

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

class InMemoryLoginRateLimiter implements LoginRateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  private sweep(): void {
    const now = Date.now();
    for (const [k, b] of this.buckets) {
      if (now > b.resetAt) this.buckets.delete(k);
    }
  }

  allowed(key: string): boolean {
    this.sweep();
    const b = this.buckets.get(key);
    if (!b) return true;
    if (Date.now() > b.resetAt) {
      this.buckets.delete(key);
      return true;
    }
    return b.count < MAX_ATTEMPTS;
  }

  fail(key: string): void {
    this.sweep();
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now > b.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      b.count += 1;
    }
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

export const loginLimiter: LoginRateLimiter = new InMemoryLoginRateLimiter();

// Rate limit outbound CS reply: 30/menit per user+customer (cukup longgar untuk
// workflow CS, cukup ketat anti spam script). In-memory, single-instance.
const OUTBOUND_MAX = 30;
const OUTBOUND_WINDOW_MS = 60 * 1000;
const outboundBuckets = new Map<string, { count: number; resetAt: number }>();

export function outboundAllowed(userId: string, customerId: string): boolean {
  const key = `${userId}:${customerId}`;
  const now = Date.now();
  const b = outboundBuckets.get(key);
  if (!b || now > b.resetAt) {
    outboundBuckets.set(key, { count: 1, resetAt: now + OUTBOUND_WINDOW_MS });
    return true;
  }
  if (b.count >= OUTBOUND_MAX) return false;
  b.count += 1;
  return true;
}

// API lama (kompatibilitas mundur untuk pemanggil existing).
export function loginAllowed(key: string): boolean {
  return loginLimiter.allowed(key);
}
export function registerFailedLogin(key: string): void {
  return loginLimiter.fail(key);
}
export function clearLoginAttempts(key: string): void {
  return loginLimiter.reset(key);
}
