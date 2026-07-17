import { describe, it, expect } from 'vitest';
import { CircuitBreaker, OfflineError, TimeoutError } from './resilience.js';

/** A tripping (connectivity) failure — timeouts count toward opening. */
const timeout = () => Promise.reject(new TimeoutError(30_000));
/** A reachable failure — GitHub answered 404, must NOT trip the breaker. */
const http404 = () =>
  Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
const ok = () => Promise.resolve('ok');

describe('CircuitBreaker', () => {
  it('stays closed and passes results through while calls succeed', async () => {
    const cb = new CircuitBreaker({ threshold: 2 });
    await expect(cb.run(ok)).resolves.toBe('ok');
    await expect(cb.run(ok)).resolves.toBe('ok');
  });

  it('opens after `threshold` consecutive tripping failures, then short-circuits', async () => {
    let now = 1000;
    const cb = new CircuitBreaker({
      threshold: 2,
      cooldownMs: 5000,
      now: () => now,
    });

    // Below threshold: still attempts the call (surfaces the real error).
    await expect(cb.run(timeout)).rejects.toBeInstanceOf(TimeoutError);
    // Reaches threshold → opens.
    await expect(cb.run(timeout)).rejects.toBeInstanceOf(TimeoutError);

    // Now open: the wrapped fn is never invoked — fails instantly with OfflineError.
    let called = false;
    await expect(
      cb.run(async () => {
        called = true;
        return 'x';
      }),
    ).rejects.toBeInstanceOf(OfflineError);
    expect(called).toBe(false);
  });

  it('does NOT trip on HTTP answers (reachable service)', async () => {
    const cb = new CircuitBreaker({ threshold: 2 });
    await expect(cb.run(http404)).rejects.toHaveProperty('status', 404);
    await expect(cb.run(http404)).rejects.toHaveProperty('status', 404);
    // Never opened — a real call still runs.
    await expect(cb.run(ok)).resolves.toBe('ok');
  });

  it('allows a probe after cooldown; success closes the circuit', async () => {
    let now = 0;
    const cb = new CircuitBreaker({
      threshold: 1,
      cooldownMs: 5000,
      now: () => now,
    });

    await expect(cb.run(timeout)).rejects.toBeInstanceOf(TimeoutError); // opens
    now = 4999; // within cooldown → still short-circuited
    await expect(cb.run(ok)).rejects.toBeInstanceOf(OfflineError);
    now = 5000; // cooldown elapsed → probe allowed, succeeds → closes
    await expect(cb.run(ok)).resolves.toBe('ok');
    await expect(cb.run(ok)).resolves.toBe('ok');
  });

  it('half-open lets ONE probe through and short-circuits concurrent callers', async () => {
    let now = 0;
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 5000, now: () => now });

    await expect(cb.run(timeout)).rejects.toBeInstanceOf(TimeoutError); // opens at t=0
    now = 5000; // cooldown elapsed → half-open

    // A slow probe that never settles during this test — it holds the probe slot.
    let probeStarted = false;
    const probe = cb.run(() => {
      probeStarted = true;
      return new Promise(() => {}); // pending forever
    });
    await Promise.resolve(); // let run() start the probe
    expect(probeStarted).toBe(true);

    // A concurrent caller while the probe is in flight is rejected instantly,
    // and its fn is never invoked.
    let secondCalled = false;
    await expect(
      cb.run(async () => {
        secondCalled = true;
        return 'x';
      }),
    ).rejects.toBeInstanceOf(OfflineError);
    expect(secondCalled).toBe(false);
    void probe; // (left pending on purpose)
  });

  it('re-opens when the post-cooldown probe fails again', async () => {
    let now = 0;
    const cb = new CircuitBreaker({
      threshold: 1,
      cooldownMs: 5000,
      now: () => now,
    });

    await expect(cb.run(timeout)).rejects.toBeInstanceOf(TimeoutError); // opens at t=0
    now = 5000; // probe allowed → fails → re-opens, openedAt=5000
    await expect(cb.run(timeout)).rejects.toBeInstanceOf(TimeoutError);
    now = 9999; // within the new cooldown window
    await expect(cb.run(ok)).rejects.toBeInstanceOf(OfflineError);
  });

  it('fires onOpen / onClose on state transitions', async () => {
    let now = 0;
    let opens = 0;
    let closes = 0;
    const cb = new CircuitBreaker({
      threshold: 1,
      cooldownMs: 1000,
      now: () => now,
      onOpen: () => opens++,
      onClose: () => closes++,
    });

    await expect(cb.run(timeout)).rejects.toBeInstanceOf(TimeoutError); // open
    expect(opens).toBe(1);
    now = 1000;
    await expect(cb.run(ok)).resolves.toBe('ok'); // probe closes
    expect(closes).toBe(1);
  });
});
