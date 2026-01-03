import { InterlockSocket, InterlockConfig } from './socket';
import { Tumbler, TumblerConfig } from './tumbler';
import { SignalHandlers, SignalPayload } from './handlers';
import { BaNanoProtocol } from './protocol';
import { DatabaseManager } from '../database/schema';
import { PercolatorEngine } from '../percolator/engine';
import { SignalCodes } from '../types';
import fs from 'fs';
import path from 'path';

export interface InterlockManagerConfig {
  configPath?: string;
}

// Singleton instance
let instance: InterlockManager | null = null;

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
      peers: interlockConfig.peers.map((p: any) => ({ name: p.name, port: p.port })),
      heartbeatInterval: interlockConfig.interlock.heartbeatInterval,
      timeout: interlockConfig.interlock.timeout
    });

    this.tumbler = new Tumbler({
      listenSignals: interlockConfig.signals.listen.map((s: any) => ({
        code: s.code.replace('0x', ''),
        from: s.from,
        action: s.action
      })),
      emitSignals: interlockConfig.signals.emit.map((s: any) => ({
        code: s.code.replace('0x', ''),
        name: s.name,
        to: s.to
      }))
    });

    this.handlers = new SignalHandlers(db);

    // Wire up signal handling
    this.socket.on('signal', (signal: SignalPayload) => {
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

  private loadConfig(configPath: string): any {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
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

  private async handleIncomingSignal(signal: SignalPayload): Promise<void> {
    const { accept, action } = this.tumbler.shouldAccept(signal.code, signal.source);

    if (!accept) return;

    if (action) {
      await this.handlers.handle(action, signal);
    }
  }

  // Emit signals
  emitPercolationStarted(blueprintId: string, depth: string, budget: number): void {
    this.emit(SignalCodes.PERCOLATION_STARTED, {
      blueprint_id: blueprintId,
      depth,
      budget,
      started_at: new Date().toISOString()
    });
  }

  emitHoleFound(blueprintId: string, holeId: string, holeType: string, severity: string): void {
    this.emit(SignalCodes.HOLE_FOUND, {
      blueprint_id: blueprintId,
      hole_id: holeId,
      hole_type: holeType,
      severity
    });
  }

  emitHolePatched(blueprintId: string, holeId: string): void {
    this.emit(SignalCodes.HOLE_PATCHED, {
      blueprint_id: blueprintId,
      hole_id: holeId,
      patched_at: new Date().toISOString()
    });
  }

  emitPercolationComplete(blueprintId: string, confidenceScore: number): void {
    this.emit(SignalCodes.PERCOLATION_COMPLETE, {
      blueprint_id: blueprintId,
      confidence_score: confidenceScore,
      completed_at: new Date().toISOString()
    });
  }

  emitPercolationFailed(blueprintId: string, error: string): void {
    this.emit(SignalCodes.PERCOLATION_FAILED, {
      blueprint_id: blueprintId,
      error,
      failed_at: new Date().toISOString()
    });
  }

  private emit(code: string, payload: Record<string, any>): void {
    if (!this.tumbler.canEmit(code)) return;

    const targets = this.tumbler.getEmitTargets(code);
    this.socket.send(code, targets, payload);
  }

  isActive(): boolean {
    return this.socket.isActive();
  }

  getPort(): number {
    return this.socket.getPort();
  }
}

export { InterlockSocket, Tumbler, SignalHandlers, BaNanoProtocol };
export default InterlockManager;
