// Tumbler - Signal whitelist filtering for InterLock mesh

export interface SignalFilter {
  code: string;
  from: string[];
  action: string;
}

export interface TumblerConfig {
  listenSignals: SignalFilter[];
  emitSignals: Array<{ code: string; name: string; to: string[] }>;
}

export class Tumbler {
  private listenFilters: Map<string, SignalFilter> = new Map();
  private emitTargets: Map<string, string[]> = new Map();

  constructor(config: TumblerConfig) {
    for (const filter of config.listenSignals) {
      this.listenFilters.set(filter.code, filter);
    }

    for (const emit of config.emitSignals) {
      this.emitTargets.set(emit.code, emit.to);
    }
  }

  shouldAccept(code: string, source: string): { accept: boolean; action: string | null } {
    const filter = this.listenFilters.get(code);

    if (!filter) {
      return { accept: false, action: null };
    }

    if (!filter.from.includes(source) && !filter.from.includes('*')) {
      return { accept: false, action: null };
    }

    return { accept: true, action: filter.action };
  }

  getEmitTargets(code: string): string[] {
    return this.emitTargets.get(code) || [];
  }

  canEmit(code: string): boolean {
    return this.emitTargets.has(code);
  }

  getListenedCodes(): string[] {
    return Array.from(this.listenFilters.keys());
  }

  getEmittedCodes(): string[] {
    return Array.from(this.emitTargets.keys());
  }
}

export default Tumbler;
