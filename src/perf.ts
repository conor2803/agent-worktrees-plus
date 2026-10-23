/**
 * Counters for the work the panel does on its own: git spawns, gathers, and the
 * triggers and fallbacks that cause them. They exist so a performance claim can
 * be checked. The benchmark (bench/) reads them through the extension's exports,
 * and a running window logs a summary line a minute to the output channel.
 *
 * No vscode import, so the unit suite can load it.
 */

export interface TimingSummary {
  count: number;
  p50: number;
  p95: number;
  max: number;
}

export interface PerfSnapshot {
  counts: Record<string, number>;
  timings: Record<string, TimingSummary>;
}

export class PerfCounters {
  private counts = new Map<string, number>();
  private timings = new Map<string, number[]>();

  count(name: string): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }

  time(name: string, ms: number): void {
    const list = this.timings.get(name);
    if (list) list.push(ms);
    else this.timings.set(name, [ms]);
  }

  reset(): void {
    this.counts.clear();
    this.timings.clear();
  }

  snapshot(): PerfSnapshot {
    const counts: Record<string, number> = {};
    for (const name of [...this.counts.keys()].sort()) {
      counts[name] = this.counts.get(name)!;
    }
    const timings: Record<string, TimingSummary> = {};
    for (const name of [...this.timings.keys()].sort()) {
      timings[name] = summarise(this.timings.get(name)!);
    }
    return { counts, timings };
  }

  /** One line for the output channel, or undefined when nothing happened. */
  summaryLine(): string | undefined {
    const { counts, timings } = this.snapshot();
    const parts = Object.entries(counts).map(([name, n]) => `${name}=${n}`);
    for (const [name, t] of Object.entries(timings)) {
      parts.push(`${name}(p50/p95/max)=${t.p50}/${t.p95}/${t.max}`);
    }
    return parts.length ? parts.join(" ") : undefined;
  }
}

function summarise(values: number[]): TimingSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return {
    count: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  };
}

/** The extension host's one set of counters. */
export const perf = new PerfCounters();
