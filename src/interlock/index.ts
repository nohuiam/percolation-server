import { InterlockSocket, InterlockConfig } from './socket';
import { Tumbler, TumblerConfig } from './tumbler';
import { SignalHandlers } from './handlers';
import { Signal, SignalTypes, encode, decode, createSignal, getSignalName, encodeSignal, decodeSignal, isValidSignal } from './protocol';
import { DatabaseManager } from '../database/schema';
import { PercolatorEngine } from '../percolator/engine';
import fs from 'fs';
import path from 'path';

export interface InterlockManagerConfig {
  configPath?: string;
}

// Singleton instance
let instance: InterlockManager | null = null;

/**
 * Parse hex string code to number (e.g., "0x40" -> 64)
 */
function parseSignalCode(code: string): number {
  if (code.startsWith('0x')) {
    return parseInt(code, 16);
  }
  // Try to parse as hex anyway
  const parsed = parseInt(code, 16);
  return isNaN(parsed) ? 0 : parsed;
}

export class InterlockManager {
  private socket: InterlockSocket;
  private tumbler: Tumbler;
  private handlers: SignalHandlers;
  private db: DatabaseManager;
  private percolator: PercolatorEngine | null = null;

  constructor(db: DatabaseManager, config?: InterlockManagerConfig) {
    this.db = db;

    // Load config from file
    const configPath = config?.configPath || path.join(__dirname, '../../config/interlock.json');
    const interlockConfig = this.loadConfig(configPath);

    // Initialize components
    this.socket = new InterlockSocket({
      port: interlockConfig.ports.udp,
      serverName: interlockConfig.server.name,
      peers: interlockConfig.peers.map((p: { name: string; port: number }) => ({ name: p.name, port: p.port })),
      heartbeatInterval: interlockConfig.interlock.heartbeatInterval,
      timeout: interlockConfig.interlock.timeout
    });

    this.tumbler = new Tumbler({
      listenSignals: interlockConfig.signals.listen.map((s: { code: string; from: string[]; action: string }) => ({
        signalType: parseSignalCode(s.code),
        from: s.from,
        action: s.action
      })),
      emitSignals: interlockConfig.signals.emit.map((s: { code: string; name: string; to: string[] }) => ({
        signalType: parseSignalCode(s.code),
        name: s.name,
        to: s.to
      }))
    });

    this.handlers = new SignalHandlers(db);

    // Wire up signal handling
    this.socket.on('signal', (signal: Signal) => {
      this.handleIncomingSignal(signal);
    });
  }

  static getInstance(db: DatabaseManager, config?: InterlockManagerConfig): InterlockManager {
    if (!instance) {
      instance = new InterlockManager(db, config);
    }
    return instance;
  }

  static resetInstance(): void {
    if (instance) {
      instance.stop();
      instance = null;
    }
  }

  setPercolator(percolator: PercolatorEngine): void {
    this.percolator = percolator;
    this.handlers.setPercolator(percolator);
  }

  private loadConfig(configPath: string): {
    server: { name: string; version: string };
    ports: { udp: number; http: number; websocket: number };
    interlock: { heartbeatInterval: number; timeout: number };
    signals: { listen: Array<{ code: string; from: string[]; action: string }>; emit: Array<{ code: string; name: string; to: string[] }> };
    peers: Array<{ name: string; port: number }>;
  } {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    } catch {
      // Return default config if file not found
      return {
        server: { name: 'percolation-server', version: '1.0.0' },
        ports: { udp: 3030, http: 8030, websocket: 9030 },
        interlock: { heartbeatInterval: 30000, timeout: 90000 },
        signals: { listen: [], emit: [] },
        peers: []
      };
    }
  }

  async start(): Promise<void> {
    await this.socket.start();
  }

  async stop(): Promise<void> {
    await this.socket.stop();
  }

  private async handleIncomingSignal(signal: Signal): Promise<void> {
    const { accept, action } = this.tumbler.shouldAccept(signal);

    if (!accept) return;

    await this.handlers.handle(signal);
  }

  // Emit signals
  emitPercolationStarted(blueprintId: string, depth: string, budget: number): void {
    this.emit(SignalTypes.PERCOLATION_STARTED, {
      blueprint_id: blueprintId,
      depth,
      budget,
      started_at: new Date().toISOString()
    });
  }

  emitHoleFound(blueprintId: string, holeId: string, holeType: string, severity: string): void {
    this.emit(SignalTypes.HOLE_FOUND, {
      blueprint_id: blueprintId,
      hole_id: holeId,
      hole_type: holeType,
      severity
    });
  }

  emitHolePatched(blueprintId: string, holeId: string): void {
    this.emit(SignalTypes.HOLE_PATCHED, {
      blueprint_id: blueprintId,
      hole_id: holeId,
      patched_at: new Date().toISOString()
    });
  }

  emitPercolationComplete(blueprintId: string, confidenceScore: number): void {
    this.emit(SignalTypes.PERCOLATION_COMPLETE, {
      blueprint_id: blueprintId,
      confidence_score: confidenceScore,
      completed_at: new Date().toISOString()
    });
  }

  emitPercolationFailed(blueprintId: string, error: string): void {
    this.emit(SignalTypes.PERCOLATION_FAILED, {
      blueprint_id: blueprintId,
      error,
      failed_at: new Date().toISOString()
    });
  }

  private emit(signalType: number, data: Record<string, unknown>): void {
    if (!this.tumbler.canEmit(signalType)) return;

    const targets = this.tumbler.getEmitTargets(signalType);
    this.socket.send(signalType, targets, data);
  }

  isActive(): boolean {
    return this.socket.isActive();
  }

  getPort(): number {
    return this.socket.getPort();
  }
}

// Export protocol functions and types
export {
  encode,
  decode,
  encodeSignal,
  decodeSignal,
  createSignal,
  getSignalName,
  isValidSignal,
  SignalTypes,
  Signal
} from './protocol';

export { InterlockSocket, Tumbler, SignalHandlers };
export default InterlockManager;
