import { DatabaseManager, DepthLevel, BlueprintStatus } from '../database/schema';
import { StressTester } from './stress-tester';
import { HoleFinder } from './hole-finder';
import { Optimizer } from './optimizer';
import { PercolatorConfig, StressTestTypes } from '../types';
import { EventEmitter } from 'events';

export interface PercolationEvent {
  type: string;
  blueprintId: string;
  data: Record<string, any>;
  timestamp: string;
}

export class PercolatorEngine extends EventEmitter {
  private db: DatabaseManager;
  private stressTester: StressTester;
  private holeFinder: HoleFinder;
  private optimizer: Optimizer;
  private config: PercolatorConfig;
  private activePercolations: Map<string, boolean> = new Map();

  constructor(db: DatabaseManager, config?: Partial<PercolatorConfig>) {
    super();
    this.db = db;
    this.stressTester = new StressTester(db);
    this.holeFinder = new HoleFinder(db);
    this.optimizer = new Optimizer(db);

    this.config = {
      depths: {
        quick: { budget: 1000, stressTests: 3, researchQueries: 1 },
        standard: { budget: 5000, stressTests: 10, researchQueries: 3 },
        thorough: { budget: 20000, stressTests: 25, researchQueries: 10 },
        exhaustive: { budget: 100000, stressTests: 100, researchQueries: -1 }
      },
      defaultDepth: 'standard',
      maxConcurrentPercolations: 5,
      ...config
    };
  }

  emitEvent(event: string, data: PercolationEvent): boolean {
    return super.emit(event, data);
  }

  async percolate(blueprintId: string): Promise<void> {
    // Check if already percolating
    if (this.activePercolations.get(blueprintId)) {
      throw new Error(`Blueprint ${blueprintId} is already being percolated`);
    }

    // Check concurrent limit
    if (this.activePercolations.size >= this.config.maxConcurrentPercolations) {
      throw new Error(`Maximum concurrent percolations (${this.config.maxConcurrentPercolations}) reached`);
    }

    const blueprint = this.db.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    if (blueprint.status !== 'pending') {
      throw new Error(`Blueprint is not pending (status: ${blueprint.status})`);
    }

    // Start percolation
    this.activePercolations.set(blueprintId, true);
    this.db.updateBlueprintStatus(blueprintId, 'percolating');

    this.sendEvent('percolation_started', blueprintId, {
      depth: blueprint.depth,
      budget: blueprint.budget_tokens
    });

    try {
      await this.runPercolationLoop(blueprintId);
    } catch (error) {
      this.db.updateBlueprintStatus(blueprintId, 'failed');
      this.sendEvent('percolation_failed', blueprintId, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      this.activePercolations.delete(blueprintId);
    }
  }

  private async runPercolationLoop(blueprintId: string): Promise<void> {
    const blueprint = this.db.getBlueprint(blueprintId)!;
    const depthConfig = this.config.depths[blueprint.depth as DepthLevel];

    let iteration = 0;
    const maxIterations = depthConfig.stressTests;
    let researchQueriesUsed = 0;
    const maxResearchQueries = depthConfig.researchQueries === -1 ? Infinity : depthConfig.researchQueries;

    this.db.log(blueprintId, 'PERCOLATION_LOOP_START', {
      max_iterations: maxIterations,
      budget: blueprint.budget_tokens,
      depth: blueprint.depth
    });

    while (iteration < maxIterations) {
      // Check budget
      const currentBlueprint = this.db.getBlueprint(blueprintId)!;
      const remainingBudget = currentBlueprint.budget_tokens - currentBlueprint.tokens_used;

      if (remainingBudget < 100) {
        this.db.log(blueprintId, 'BUDGET_EXHAUSTED', { remaining: remainingBudget });
        break;
      }

      iteration++;

      // Run stress test
      const testType = this.selectTestType(iteration, maxIterations);
      const intensity = this.calculateIntensity(iteration, maxIterations);

      this.sendEvent('stress_test_running', blueprintId, {
        iteration,
        test_type: testType,
        intensity
      });

      const testResult = await this.stressTester.runTest(blueprintId, testType, intensity);

      this.sendEvent('stress_test_complete', blueprintId, {
        iteration,
        passed: testResult.passed,
        holes_found: testResult.holesFound
      });

      // Find additional holes if test didn't pass
      if (!testResult.passed) {
        const analysisDepth = iteration < maxIterations / 3 ? 'shallow' :
                             iteration < maxIterations * 2 / 3 ? 'moderate' : 'deep';

        const holes = await this.holeFinder.analyze(blueprintId, analysisDepth);

        for (const hole of holes) {
          this.sendEvent('hole_found', blueprintId, {
            hole_id: hole.id,
            type: hole.type,
            severity: hole.severity
          });
        }
      }

      // Attempt to patch open holes
      const openHoles = this.db.getHolesForBlueprint(blueprintId, 'open');

      for (const hole of openHoles) {
        // Research improvement if we have budget
        if (researchQueriesUsed < maxResearchQueries) {
          const improvement = await this.optimizer.researchForHole(blueprintId, hole);
          if (improvement) {
            researchQueriesUsed++;

            // Apply the improvement as a patch
            await this.optimizer.applyPatch(blueprintId, hole.id, improvement.patch);

            this.sendEvent('hole_patched', blueprintId, {
              hole_id: hole.id,
              improvement_source: improvement.source
            });
          }
        }
      }

      // Check if all holes are patched
      const remainingHoles = this.db.countOpenHoles(blueprintId);
      if (remainingHoles === 0 && iteration >= 3) {
        // Run a final comprehensive test
        const finalTest = await this.stressTester.runTest(blueprintId, 'consistency', 10);
        if (finalTest.passed) {
          this.db.log(blueprintId, 'EARLY_COMPLETION', {
            iteration,
            reason: 'All holes patched and final test passed'
          });
          break;
        }
      }
    }

    // Calculate final confidence score
    const confidenceScore = this.calculateConfidence(blueprintId);

    // Mark as completed
    this.db.updateBlueprintStatus(blueprintId, 'completed', confidenceScore);

    this.db.log(blueprintId, 'PERCOLATION_COMPLETE', {
      iterations: iteration,
      research_queries: researchQueriesUsed,
      final_confidence: confidenceScore
    });

    this.sendEvent('percolation_complete', blueprintId, {
      confidence_score: confidenceScore,
      iterations: iteration
    });
  }

  private selectTestType(iteration: number, maxIterations: number): string {
    const testTypes = Object.values(StressTestTypes);
    const phase = Math.floor((iteration / maxIterations) * 3);

    switch (phase) {
      case 0:
        // Early phase: basic tests
        return testTypes[iteration % 3]; // edge_case, adversarial, load
      case 1:
        // Middle phase: security and boundary
        return testTypes[3 + (iteration % 3)]; // boundary, security, consistency
      default:
        // Late phase: cycle through all
        return testTypes[iteration % testTypes.length];
    }
  }

  private calculateIntensity(iteration: number, maxIterations: number): number {
    // Intensity increases as we progress
    const progress = iteration / maxIterations;
    return Math.min(10, Math.max(1, Math.floor(progress * 8) + 3));
  }

  private calculateConfidence(blueprintId: string): number {
    const blueprint = this.db.getBlueprint(blueprintId)!;
    const holes = this.db.getHolesForBlueprint(blueprintId);
    const stressTests = this.db.getStressTestsForBlueprint(blueprintId);
    const optimizations = this.db.getOptimizationsForBlueprint(blueprintId);

    // Base score
    let score = 0.5;

    // Holes factor (max -0.3)
    const openHoles = holes.filter(h => h.status === 'open').length;
    const patchedHoles = holes.filter(h => h.status === 'patched').length;
    if (holes.length > 0) {
      const patchRate = patchedHoles / holes.length;
      score += (patchRate * 0.2) - (openHoles * 0.05);
    }

    // Test factor (max +0.25)
    if (stressTests.length > 0) {
      const passRate = stressTests.filter(t => t.passed).length / stressTests.length;
      score += passRate * 0.25;
    }

    // Optimization factor (max +0.15)
    const optScore = Math.min(0.15, optimizations.length * 0.03);
    score += optScore;

    // Ensure bounds
    return Math.max(0, Math.min(1, score));
  }

  private sendEvent(type: string, blueprintId: string, data: Record<string, any>): void {
    const event: PercolationEvent = {
      type,
      blueprintId,
      data,
      timestamp: new Date().toISOString()
    };

    this.emit(type, event);
    this.emit('*', event); // Wildcard listener
  }

  getActivePercolations(): string[] {
    return Array.from(this.activePercolations.keys());
  }

  isPercolating(blueprintId: string): boolean {
    return this.activePercolations.get(blueprintId) || false;
  }
}

export default PercolatorEngine;
