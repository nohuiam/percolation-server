import { WebSocketServer, WebSocket } from 'ws';
import { PercolatorEngine, PercolationEvent } from '../percolator/engine';
import { WSEventTypes } from '../types';

// Singleton instance
let instance: WsServer | null = null;

export class WsServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;
  private percolator: PercolatorEngine | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(port: number = 9030) {
    this.port = port;
  }

  static getInstance(port?: number): WsServer {
    if (!instance) {
      instance = new WsServer(port);
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

    // Listen to all percolation events
    percolator.on('*', (event: PercolationEvent) => {
      this.broadcast({
        type: event.type,
        data: {
          blueprint_id: event.blueprintId,
          ...event.data
        },
        timestamp: event.timestamp
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('connection', (ws: WebSocket) => {
        this.handleConnection(ws);
      });

      this.wss.on('listening', () => {
        console.log(`WebSocket server listening on port ${this.port}`);

        // Start ping interval
        this.pingInterval = setInterval(() => {
          this.pingClients();
        }, 30000);

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    return new Promise((resolve) => {
      if (this.wss) {
        // Close all clients
        for (const client of this.clients) {
          client.close();
        }
        this.clients.clear();

        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);

    // Send welcome message
    this.send(ws, {
      type: 'connected',
      data: {
        server: 'percolation-server',
        version: '1.0.0',
        active_percolations: this.percolator?.getActivePercolations() || []
      },
      timestamp: new Date().toISOString()
    });

    ws.on('message', (data: Buffer) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
      this.clients.delete(ws);
    });

    // Handle pong
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });
  }

  private handleMessage(ws: WebSocket, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case WSEventTypes.PING:
          this.send(ws, {
            type: WSEventTypes.PONG,
            data: {},
            timestamp: new Date().toISOString()
          });
          break;

        case 'subscribe':
          // Client wants to subscribe to specific blueprint
          // For now, all clients receive all events
          this.send(ws, {
            type: 'subscribed',
            data: { blueprint_id: message.blueprint_id },
            timestamp: new Date().toISOString()
          });
          break;

        case 'get_active':
          this.send(ws, {
            type: 'active_percolations',
            data: {
              blueprints: this.percolator?.getActivePercolations() || []
            },
            timestamp: new Date().toISOString()
          });
          break;

        default:
          this.send(ws, {
            type: 'error',
            data: { message: `Unknown message type: ${message.type}` },
            timestamp: new Date().toISOString()
          });
      }
    } catch (error) {
      this.send(ws, {
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: new Date().toISOString()
      });
    }
  }

  private send(ws: WebSocket, event: { type: string; data: any; timestamp: string }): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  broadcast(event: { type: string; data: any; timestamp: string }): void {
    const message = JSON.stringify(event);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  private pingClients(): void {
    for (const client of this.clients) {
      if ((client as any).isAlive === false) {
        client.terminate();
        this.clients.delete(client);
        continue;
      }

      (client as any).isAlive = false;
      client.ping();
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getPort(): number {
    return this.port;
  }
}

export default WsServer;
