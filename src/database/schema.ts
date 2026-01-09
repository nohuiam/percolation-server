import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Types
export type BlueprintStatus = 'pending' | 'percolating' | 'completed' | 'failed';
export type HoleStatus = 'open' | 'patched' | 'wont_fix';
export type HoleSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DepthLevel = 'quick' | 'standard' | 'thorough' | 'exhaustive';

export interface Blueprint {
  id: string;
  original_content: string;
  current_content: string;
  status: BlueprintStatus;
  depth: DepthLevel;
  budget_tokens: number;
  tokens_used: number;
  confidence_score: number;
  submitted_at: string;
  completed_at: string | null;
  source: string | null;
  metadata: string | null;
}

export interface Hole {
  id: string;
  blueprint_id: string;
  hole_type: string;
  description: string;
  severity: HoleSeverity;
  status: HoleStatus;
  location: string | null;
  suggested_fix: string | null;
  identified_at: string;
  patched_at: string | null;
}

export interface StressTest {
  id: string;
  blueprint_id: string;
  test_type: string;
  intensity: number;
  passed: boolean;
  findings: string;
  duration_ms: number;
  run_at: string;
}

export interface Optimization {
  id: string;
  blueprint_id: string;
  source: string;
  description: string;
  improvement_score: number;
  tokens_cost: number;
  applied_at: string;
}

export interface PercolationLog {
  id: string;
  blueprint_id: string;
  action: string;
  details: string;
  timestamp: string;
}

// Singleton database manager
let dbInstance: DatabaseManager | null = null;

export class DatabaseManager {
  private db: Database.Database;
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(__dirname, '../../data');

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    const dbPath = path.join(this.dataDir, 'percolation.db');
    this.db = new Database(dbPath);

    // Use DELETE mode for tests (avoids WAL lock conflicts)
    // WAL mode for production (better concurrent performance)
    const isTest = process.env.NODE_ENV === 'test' || dataDir?.includes('test');
    if (isTest) {
      this.db.pragma('journal_mode = DELETE');
    } else {
      this.db.pragma('journal_mode = WAL');
    }

    this.initSchema();
  }

  static getInstance(dataDir?: string): DatabaseManager {
    if (!dbInstance) {
      dbInstance = new DatabaseManager(dataDir);
    }
    return dbInstance;
  }

  static resetInstance(): void {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
  }

  private initSchema(): void {
    // Blueprints table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blueprints (
        id TEXT PRIMARY KEY,
        original_content TEXT NOT NULL,
        current_content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        depth TEXT NOT NULL DEFAULT 'standard',
        budget_tokens INTEGER NOT NULL DEFAULT 5000,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        confidence_score REAL NOT NULL DEFAULT 0.0,
        submitted_at TEXT NOT NULL,
        completed_at TEXT,
        source TEXT,
        metadata TEXT
      )
    `);

    // Holes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS holes (
        id TEXT PRIMARY KEY,
        blueprint_id TEXT NOT NULL,
        hole_type TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'open',
        location TEXT,
        suggested_fix TEXT,
        identified_at TEXT NOT NULL,
        patched_at TEXT,
        FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE
      )
    `);

    // Stress tests table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stress_tests (
        id TEXT PRIMARY KEY,
        blueprint_id TEXT NOT NULL,
        test_type TEXT NOT NULL,
        intensity INTEGER NOT NULL DEFAULT 1,
        passed INTEGER NOT NULL DEFAULT 0,
        findings TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        run_at TEXT NOT NULL,
        FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE
      )
    `);

    // Optimizations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS optimizations (
        id TEXT PRIMARY KEY,
        blueprint_id TEXT NOT NULL,
        source TEXT NOT NULL,
        description TEXT NOT NULL,
        improvement_score REAL NOT NULL DEFAULT 0.0,
        tokens_cost INTEGER NOT NULL DEFAULT 0,
        applied_at TEXT NOT NULL,
        FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE
      )
    `);

    // Percolation logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS percolation_logs (
        id TEXT PRIMARY KEY,
        blueprint_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_blueprints_status ON blueprints(status);
      CREATE INDEX IF NOT EXISTS idx_holes_blueprint ON holes(blueprint_id);
      CREATE INDEX IF NOT EXISTS idx_holes_status ON holes(status);
      CREATE INDEX IF NOT EXISTS idx_stress_tests_blueprint ON stress_tests(blueprint_id);
      CREATE INDEX IF NOT EXISTS idx_optimizations_blueprint ON optimizations(blueprint_id);
      CREATE INDEX IF NOT EXISTS idx_logs_blueprint ON percolation_logs(blueprint_id);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON percolation_logs(timestamp);
    `);
  }

  // Blueprint CRUD
  createBlueprint(content: string, depth: DepthLevel = 'standard', budgetTokens?: number, source?: string, metadata?: object): Blueprint {
    const id = uuidv4();
    const now = new Date().toISOString();

    const depthBudgets: Record<DepthLevel, number> = {
      quick: 1000,
      standard: 5000,
      thorough: 20000,
      exhaustive: 100000
    };

    const budget = budgetTokens ?? depthBudgets[depth];

    const stmt = this.db.prepare(`
      INSERT INTO blueprints (id, original_content, current_content, status, depth, budget_tokens, tokens_used, confidence_score, submitted_at, source, metadata)
      VALUES (?, ?, ?, 'pending', ?, ?, 0, 0.0, ?, ?, ?)
    `);

    stmt.run(id, content, content, depth, budget, now, source || null, metadata ? JSON.stringify(metadata) : null);

    return this.getBlueprint(id)!;
  }

  getBlueprint(id: string): Blueprint | null {
    const stmt = this.db.prepare('SELECT * FROM blueprints WHERE id = ?');
    const result = stmt.get(id) as Blueprint | undefined;
    return result ?? null;
  }

  updateBlueprintContent(id: string, content: string, tokensUsed: number = 0): void {
    const stmt = this.db.prepare(`
      UPDATE blueprints
      SET current_content = ?, tokens_used = tokens_used + ?
      WHERE id = ?
    `);
    stmt.run(content, tokensUsed, id);
  }

  updateBlueprintStatus(id: string, status: BlueprintStatus, confidenceScore?: number): void {
    if (status === 'completed' || status === 'failed') {
      const stmt = this.db.prepare(`
        UPDATE blueprints
        SET status = ?, confidence_score = COALESCE(?, confidence_score), completed_at = ?
        WHERE id = ?
      `);
      stmt.run(status, confidenceScore ?? null, new Date().toISOString(), id);
    } else {
      const stmt = this.db.prepare(`
        UPDATE blueprints
        SET status = ?, confidence_score = COALESCE(?, confidence_score)
        WHERE id = ?
      `);
      stmt.run(status, confidenceScore ?? null, id);
    }
  }

  listBlueprints(status?: BlueprintStatus, limit: number = 100): Blueprint[] {
    if (status) {
      const stmt = this.db.prepare('SELECT * FROM blueprints WHERE status = ? ORDER BY submitted_at DESC LIMIT ?');
      return stmt.all(status, limit) as Blueprint[];
    }
    const stmt = this.db.prepare('SELECT * FROM blueprints ORDER BY submitted_at DESC LIMIT ?');
    return stmt.all(limit) as Blueprint[];
  }

  // Hole CRUD
  createHole(blueprintId: string, holeType: string, description: string, severity: HoleSeverity = 'medium', location?: string, suggestedFix?: string): Hole {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO holes (id, blueprint_id, hole_type, description, severity, status, location, suggested_fix, identified_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `);

    stmt.run(id, blueprintId, holeType, description, severity, location || null, suggestedFix || null, now);

    return this.getHole(id)!;
  }

  getHole(id: string): Hole | null {
    const stmt = this.db.prepare('SELECT * FROM holes WHERE id = ?');
    return stmt.get(id) as Hole | null;
  }

  updateHoleStatus(id: string, status: HoleStatus): void {
    const patchedAt = status === 'patched' ? new Date().toISOString() : null;
    const stmt = this.db.prepare('UPDATE holes SET status = ?, patched_at = ? WHERE id = ?');
    stmt.run(status, patchedAt, id);
  }

  getHolesForBlueprint(blueprintId: string, status?: HoleStatus): Hole[] {
    if (status) {
      const stmt = this.db.prepare('SELECT * FROM holes WHERE blueprint_id = ? AND status = ? ORDER BY identified_at DESC');
      return stmt.all(blueprintId, status) as Hole[];
    }
    const stmt = this.db.prepare('SELECT * FROM holes WHERE blueprint_id = ? ORDER BY identified_at DESC');
    return stmt.all(blueprintId) as Hole[];
  }

  countOpenHoles(blueprintId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM holes WHERE blueprint_id = ? AND status = ?');
    const result = stmt.get(blueprintId, 'open') as { count: number };
    return result.count;
  }

  // Stress Test CRUD
  createStressTest(blueprintId: string, testType: string, intensity: number, passed: boolean, findings: string, durationMs: number): StressTest {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO stress_tests (id, blueprint_id, test_type, intensity, passed, findings, duration_ms, run_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, blueprintId, testType, intensity, passed ? 1 : 0, findings, durationMs, now);

    return this.getStressTest(id)!;
  }

  getStressTest(id: string): StressTest | null {
    const stmt = this.db.prepare('SELECT * FROM stress_tests WHERE id = ?');
    const row = stmt.get(id) as any;
    if (row) {
      row.passed = !!row.passed;
    }
    return row as StressTest | null;
  }

  getStressTestsForBlueprint(blueprintId: string): StressTest[] {
    const stmt = this.db.prepare('SELECT * FROM stress_tests WHERE blueprint_id = ? ORDER BY run_at DESC');
    const rows = stmt.all(blueprintId) as any[];
    return rows.map(r => ({ ...r, passed: !!r.passed }));
  }

  // Optimization CRUD
  createOptimization(blueprintId: string, source: string, description: string, improvementScore: number, tokensCost: number): Optimization {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO optimizations (id, blueprint_id, source, description, improvement_score, tokens_cost, applied_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, blueprintId, source, description, improvementScore, tokensCost, now);

    return this.getOptimization(id)!;
  }

  getOptimization(id: string): Optimization | null {
    const stmt = this.db.prepare('SELECT * FROM optimizations WHERE id = ?');
    return stmt.get(id) as Optimization | null;
  }

  getOptimizationsForBlueprint(blueprintId: string): Optimization[] {
    const stmt = this.db.prepare('SELECT * FROM optimizations WHERE blueprint_id = ? ORDER BY applied_at DESC');
    return stmt.all(blueprintId) as Optimization[];
  }

  // Percolation Log CRUD
  log(blueprintId: string, action: string, details: string | object): PercolationLog {
    const id = uuidv4();
    const now = new Date().toISOString();
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);

    const stmt = this.db.prepare(`
      INSERT INTO percolation_logs (id, blueprint_id, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, blueprintId, action, detailsStr, now);

    return { id, blueprint_id: blueprintId, action, details: detailsStr, timestamp: now };
  }

  getLogsForBlueprint(blueprintId: string, limit: number = 100): PercolationLog[] {
    const stmt = this.db.prepare('SELECT * FROM percolation_logs WHERE blueprint_id = ? ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(blueprintId, limit) as PercolationLog[];
  }

  // Statistics
  getStats(): {
    total_blueprints: number;
    pending: number;
    percolating: number;
    completed: number;
    failed: number;
    total_holes: number;
    open_holes: number;
    patched_holes: number;
    total_tests: number;
    passed_tests: number;
    total_optimizations: number;
    avg_confidence: number;
  } {
    const blueprintStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'percolating' THEN 1 ELSE 0 END) as percolating,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE WHEN status = 'completed' THEN confidence_score ELSE NULL END) as avg_confidence
      FROM blueprints
    `).get() as any;

    const holeStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_holes,
        SUM(CASE WHEN status = 'patched' THEN 1 ELSE 0 END) as patched
      FROM holes
    `).get() as any;

    const testStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed
      FROM stress_tests
    `).get() as any;

    const optStats = this.db.prepare('SELECT COUNT(*) as total FROM optimizations').get() as any;

    return {
      total_blueprints: blueprintStats.total || 0,
      pending: blueprintStats.pending || 0,
      percolating: blueprintStats.percolating || 0,
      completed: blueprintStats.completed || 0,
      failed: blueprintStats.failed || 0,
      total_holes: holeStats.total || 0,
      open_holes: holeStats.open_holes || 0,
      patched_holes: holeStats.patched || 0,
      total_tests: testStats.total || 0,
      passed_tests: testStats.passed || 0,
      total_optimizations: optStats.total || 0,
      avg_confidence: blueprintStats.avg_confidence || 0
    };
  }

  // Cleanup old data
  cleanup(daysOld: number = 30): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const cutoffStr = cutoff.toISOString();

    const stmt = this.db.prepare(`
      DELETE FROM blueprints
      WHERE (status = 'completed' OR status = 'failed')
      AND completed_at <= ?
    `);

    const result = stmt.run(cutoffStr);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}

export default DatabaseManager;
