// Tumbler - Signal whitelist filtering for InterLock mesh

import { Signal, getSignalName } from './protocol';

export interface SignalFilter {
  signalType: number;
  from: string[];
  action: string;
}

export interface TumblerConfig {
  listenSignals: SignalFilter[];
  emitSignals: Array<{ signalType: number; name: string; to: string[] }>;
}

export class Tumbler {
  private listenFilters: Map<number, SignalFilter> = new Map();
  private emitTargets: Map<number, string[]> = new Map();

  constructor(config: TumblerConfig) {
    for (const filter of config.listenSignals) {
      this.listenFilters.set(filter.signalType, filter);
    }

    for (const emit of config.emitSignals) {
      this.emitTargets.set(emit.signalType, emit.to);
    }
  }

  shouldAccept(signal: Signal): { accept: boolean; action: string | null } {
    const filter = this.listenFilters.get(signal.signalType);

    if (!filter) {
      return { accept: false, action: null };
    }

    const source = signal.payload.sender;
    if (!filter.from.includes(source) && !filter.from.includes('*')) {
      return { accept: false, action: null };
    }

    return { accept: true, action: filter.action };
  }

  getEmitTargets(signalType: number): string[] {
    return this.emitTargets.get(signalType) || [];
  }

  canEmit(signalType: number): boolean {
    return this.emitTargets.has(signalType);
  }

  getListenedTypes(): number[] {
    return Array.from(this.listenFilters.keys());
  }

  getEmittedTypes(): number[] {
    return Array.from(this.emitTargets.keys());
  }
}

export default Tumbler;
