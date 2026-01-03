import dgram from 'dgram';
import { EventEmitter } from 'events';
import { BaNanoProtocol, BaNanoPacket } from './protocol';

export interface InterlockConfig {
  port: number;
  serverName: string;
  peers: Array<{ name: string; port: number }>;
  heartbeatInterval: number;
  timeout: number;
}

export class InterlockSocket extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private config: InterlockConfig;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: InterlockConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.socket = dgram.createSocket('udp4');

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.socket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo);
    });

    return new Promise((resolve, reject) => {
      this.socket!.bind(this.config.port, () => {
        this.isRunning = true;
        this.startHeartbeat();
        this.emit('listening', this.config.port);
        resolve();
      });

      this.socket!.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.close(() => {
          this.socket = null;
          this.isRunning = false;
          resolve();
        });
      } else {
        this.isRunning = false;
        resolve();
      }
    });
  }

  send(code: string, target: string | string[], payload: Record<string, any>): void {
    if (!this.socket || !this.isRunning) return;

    const targets = Array.isArray(target) ? target : [target];

    for (const t of targets) {
      const peer = this.config.peers.find(p => p.name === t);
      if (!peer) continue;

      const buffer = BaNanoProtocol.encode({
        code,
        source: this.config.serverName,
        target: t,
        payload
      });

      this.socket.send(buffer, 0, buffer.length, peer.port, '127.0.0.1', (err) => {
        if (err) {
          this.emit('send-error', { target: t, error: err });
        }
      });
    }
  }

  broadcast(code: string, payload: Record<string, any>, exclude?: string[]): void {
    const targets = this.config.peers
      .filter(p => !exclude || !exclude.includes(p.name))
      .map(p => p.name);

    this.send(code, targets, payload);
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const packet = BaNanoProtocol.decode(msg);
    if (!packet) {
      this.emit('invalid-packet', { from: rinfo.address, port: rinfo.port });
      return;
    }

    const payload = BaNanoProtocol.decodePayload(packet.payload);

    this.emit('signal', {
      code: packet.code,
      source: packet.source,
      target: packet.target,
      payload,
      timestamp: new Date(packet.timestamp).toISOString()
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.broadcast('00', {
        status: 'alive',
        uptime: process.uptime()
      });
    }, this.config.heartbeatInterval);
  }

  getPort(): number {
    return this.config.port;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export default InterlockSocket;
