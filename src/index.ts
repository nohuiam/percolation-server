#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { DatabaseManager } from './database/schema';
import { PercolatorEngine } from './percolator/engine';
import { InterlockManager } from './interlock';
import { HttpServer } from './http/server';
import { WsServer } from './websocket/server';
import {
  allTools,
  submitBlueprint,
  getBlueprintStatus,
  stressTest,
  findHoles,
  patchHole,
  researchImprovements,
  applyOptimization,
  getPercolationResult,
} from './tools';

// Load config
import fs from 'fs';
import path from 'path';

interface ServerConfig {
  ports: {
    udp: number;
    http: number;
    websocket: number;
  };
}

function loadConfig(): ServerConfig {
  const configPath = path.join(__dirname, '../config/interlock.json');
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {
      ports: { udp: 3030, http: 8030, websocket: 9030 }
    };
  }
}

class PercolationServer {
  private server: Server;
  private db: DatabaseManager;
  private percolator: PercolatorEngine;
  private interlock: InterlockManager;
  private httpServer: HttpServer;
  private wsServer: WsServer;
  private config: ServerConfig;

  constructor() {
    this.config = loadConfig();

    // Initialize database
    this.db = DatabaseManager.getInstance();

    // Initialize percolator engine
    this.percolator = new PercolatorEngine(this.db);

    // Initialize InterLock mesh
    this.interlock = InterlockManager.getInstance(this.db);
    this.interlock.setPercolator(this.percolator);

    // Initialize HTTP server
    this.httpServer = HttpServer.getInstance(this.db, this.config.ports.http);
    this.httpServer.setPercolator(this.percolator);

    // Initialize WebSocket server
    this.wsServer = WsServer.getInstance(this.config.ports.websocket);
    this.wsServer.setPercolator(this.percolator);

    // Wire percolator events to InterLock
    this.percolator.on('percolation_started', (event) => {
      this.interlock.emitPercolationStarted(
        event.blueprintId,
        event.data.depth,
        event.data.budget
      );
    });

    this.percolator.on('hole_found', (event) => {
      this.interlock.emitHoleFound(
        event.blueprintId,
        event.data.hole_id,
        event.data.type,
        event.data.severity
      );
    });

    this.percolator.on('hole_patched', (event) => {
      this.interlock.emitHolePatched(
        event.blueprintId,
        event.data.hole_id
      );
    });

    this.percolator.on('percolation_complete', (event) => {
      this.interlock.emitPercolationComplete(
        event.blueprintId,
        event.data.confidence_score
      );
    });

    this.percolator.on('percolation_failed', (event) => {
      this.interlock.emitPercolationFailed(
        event.blueprintId,
        event.data.error
      );
    });

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'percolation-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: allTools };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: any;

        switch (name) {
          case 'submit_blueprint':
            result = await submitBlueprint(args, this.db);
            break;
          case 'get_blueprint_status':
            result = await getBlueprintStatus(args, this.db);
            break;
          case 'stress_test':
            result = await stressTest(args, this.db);
            break;
          case 'find_holes':
            result = await findHoles(args, this.db);
            break;
          case 'patch_hole':
            result = await patchHole(args, this.db);
            break;
          case 'research_improvements':
            result = await researchImprovements(args, this.db);
            break;
          case 'apply_optimization':
            result = await applyOptimization(args, this.db);
            break;
          case 'get_percolation_result':
            result = await getPercolationResult(args, this.db);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.shutdown();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    // Start InterLock mesh
    try {
      await this.interlock.start();
      console.error(`[InterLock] UDP listening on port ${this.config.ports.udp}`);
    } catch (error) {
      console.error('[InterLock] Failed to start:', error);
    }

    // Start HTTP server
    try {
      await this.httpServer.start();
      console.error(`[HTTP] REST API on port ${this.config.ports.http}`);
    } catch (error) {
      console.error('[HTTP] Failed to start:', error);
    }

    // Start WebSocket server
    try {
      await this.wsServer.start();
      console.error(`[WebSocket] Real-time events on port ${this.config.ports.websocket}`);
    } catch (error) {
      console.error('[WebSocket] Failed to start:', error);
    }

    // Start MCP server (stdio)
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP] Server running on stdio');
  }

  async shutdown(): Promise<void> {
    console.error('[Shutdown] Graceful shutdown initiated...');

    try {
      await this.interlock.stop();
      console.error('[InterLock] Stopped');
    } catch (error) {
      console.error('[InterLock] Stop error:', error);
    }

    try {
      await this.httpServer.stop();
      console.error('[HTTP] Stopped');
    } catch (error) {
      console.error('[HTTP] Stop error:', error);
    }

    try {
      await this.wsServer.stop();
      console.error('[WebSocket] Stopped');
    } catch (error) {
      console.error('[WebSocket] Stop error:', error);
    }

    try {
      this.db.close();
      console.error('[Database] Closed');
    } catch (error) {
      console.error('[Database] Close error:', error);
    }

    console.error('[Shutdown] Complete');
  }
}

// Start the server
const server = new PercolationServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
