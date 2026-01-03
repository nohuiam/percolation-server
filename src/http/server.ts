import express, { Express, Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../database/schema';
import { PercolatorEngine } from '../percolator/engine';
import cors from 'cors';

// Singleton instance
let instance: HttpServer | null = null;

export class HttpServer {
  private app: Express;
  private server: any = null;
  private db: DatabaseManager;
  private percolator: PercolatorEngine | null = null;
  private port: number;
  private startTime: number;

  constructor(db: DatabaseManager, port: number = 8030) {
    this.app = express();
    this.db = db;
    this.port = port;
    this.startTime = Date.now();

    this.setupMiddleware();
    this.setupRoutes();
  }

  static getInstance(db: DatabaseManager, port?: number): HttpServer {
    if (!instance) {
      instance = new HttpServer(db, port);
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
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      const stats = this.db.getStats();
      res.json({
        status: 'healthy',
        server: 'percolation-server',
        version: '1.0.0',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        active_percolations: this.percolator?.getActivePercolations().length || 0,
        stats: {
          total_blueprints: stats.total_blueprints,
          pending: stats.pending,
          percolating: stats.percolating,
          completed: stats.completed
        }
      });
    });

    // Get stats
    this.app.get('/api/stats', (req: Request, res: Response) => {
      const stats = this.db.getStats();
      res.json(stats);
    });

    // List blueprints
    this.app.get('/api/blueprints', (req: Request, res: Response) => {
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;

      const blueprints = this.db.listBlueprints(
        status as any,
        limit
      );

      res.json({
        count: blueprints.length,
        blueprints: blueprints.map(b => ({
          id: b.id,
          status: b.status,
          depth: b.depth,
          budget_tokens: b.budget_tokens,
          tokens_used: b.tokens_used,
          confidence_score: b.confidence_score,
          submitted_at: b.submitted_at,
          completed_at: b.completed_at
        }))
      });
    });

    // Submit blueprint
    this.app.post('/api/blueprints', async (req: Request, res: Response) => {
      try {
        const { blueprint, depth, budget_tokens, source, metadata } = req.body;

        if (!blueprint) {
          return res.status(400).json({ error: 'Blueprint content is required' });
        }

        const created = this.db.createBlueprint(
          blueprint,
          depth || 'standard',
          budget_tokens,
          source,
          metadata
        );

        res.status(201).json({
          blueprint_id: created.id,
          status: created.status,
          depth: created.depth,
          budget_tokens: created.budget_tokens,
          message: 'Blueprint submitted successfully'
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get blueprint details
    this.app.get('/api/blueprints/:id', (req: Request, res: Response) => {
      const blueprint = this.db.getBlueprint(req.params.id);

      if (!blueprint) {
        return res.status(404).json({ error: 'Blueprint not found' });
      }

      const holes = this.db.getHolesForBlueprint(blueprint.id);
      const tests = this.db.getStressTestsForBlueprint(blueprint.id);
      const optimizations = this.db.getOptimizationsForBlueprint(blueprint.id);

      res.json({
        ...blueprint,
        open_holes: holes.filter(h => h.status === 'open').length,
        patched_holes: holes.filter(h => h.status === 'patched').length,
        stress_tests_run: tests.length,
        stress_tests_passed: tests.filter(t => t.passed).length,
        optimizations_applied: optimizations.length
      });
    });

    // Get holes for blueprint
    this.app.get('/api/blueprints/:id/holes', (req: Request, res: Response) => {
      const blueprint = this.db.getBlueprint(req.params.id);
      if (!blueprint) {
        return res.status(404).json({ error: 'Blueprint not found' });
      }

      const status = req.query.status as string | undefined;
      const holes = this.db.getHolesForBlueprint(blueprint.id, status as any);

      res.json({
        count: holes.length,
        holes
      });
    });

    // Get stress tests for blueprint
    this.app.get('/api/blueprints/:id/tests', (req: Request, res: Response) => {
      const blueprint = this.db.getBlueprint(req.params.id);
      if (!blueprint) {
        return res.status(404).json({ error: 'Blueprint not found' });
      }

      const tests = this.db.getStressTestsForBlueprint(blueprint.id);

      res.json({
        count: tests.length,
        tests
      });
    });

    // Get optimizations for blueprint
    this.app.get('/api/blueprints/:id/optimizations', (req: Request, res: Response) => {
      const blueprint = this.db.getBlueprint(req.params.id);
      if (!blueprint) {
        return res.status(404).json({ error: 'Blueprint not found' });
      }

      const optimizations = this.db.getOptimizationsForBlueprint(blueprint.id);

      res.json({
        count: optimizations.length,
        optimizations
      });
    });

    // Trigger manual stress test
    this.app.post('/api/blueprints/:id/stress', async (req: Request, res: Response) => {
      const blueprint = this.db.getBlueprint(req.params.id);
      if (!blueprint) {
        return res.status(404).json({ error: 'Blueprint not found' });
      }

      const { test_type, intensity } = req.body;

      if (!test_type) {
        return res.status(400).json({ error: 'test_type is required' });
      }

      try {
        const { StressTester } = await import('../percolator/stress-tester');
        const tester = new StressTester(this.db);
        const result = await tester.runTest(blueprint.id, test_type, intensity || 5);

        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get logs for blueprint
    this.app.get('/api/blueprints/:id/logs', (req: Request, res: Response) => {
      const blueprint = this.db.getBlueprint(req.params.id);
      if (!blueprint) {
        return res.status(404).json({ error: 'Blueprint not found' });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = this.db.getLogsForBlueprint(blueprint.id, limit);

      res.json({
        count: logs.length,
        logs
      });
    });

    // Start percolation
    this.app.post('/api/blueprints/:id/percolate', async (req: Request, res: Response) => {
      const blueprint = this.db.getBlueprint(req.params.id);
      if (!blueprint) {
        return res.status(404).json({ error: 'Blueprint not found' });
      }

      if (!this.percolator) {
        return res.status(503).json({ error: 'Percolator not available' });
      }

      if (blueprint.status !== 'pending') {
        return res.status(400).json({ error: `Blueprint is ${blueprint.status}, must be pending` });
      }

      try {
        // Start percolation in background
        this.percolator.percolate(blueprint.id).catch(err => {
          console.error(`Percolation failed for ${blueprint.id}:`, err);
        });

        res.json({
          blueprint_id: blueprint.id,
          status: 'percolation_started',
          message: 'Percolation started in background'
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('HTTP Error:', err);
      res.status(500).json({ error: err.message });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`HTTP server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }
}

// Need to install cors
// Add to package.json if not present

export default HttpServer;
