import { DatabaseManager } from '../database/schema';
import { PercolatorEngine } from '../percolator/engine';
import { SignalCodes } from '../types';

export interface SignalPayload {
  code: string;
  source: string;
  target: string;
  payload: Record<string, any>;
  timestamp: string;
}

export type SignalHandler = (signal: SignalPayload) => Promise<void>;

export class SignalHandlers {
  private db: DatabaseManager;
  private percolator: PercolatorEngine | null = null;
  private handlers: Map<string, SignalHandler> = new Map();

  constructor(db: DatabaseManager) {
    this.db = db;
    this.registerHandlers();
  }

  setPercolator(percolator: PercolatorEngine): void {
    this.percolator = percolator;
  }

  private registerHandlers(): void {
    // SKILL_CREATED from skill-builder
    this.handlers.set(SignalCodes.SKILL_CREATED, async (signal) => {
      await this.handleSkillCreated(signal);
    });

    // VERIFICATION_RESULT from verifier-mcp
    this.handlers.set(SignalCodes.VERIFICATION_RESULT, async (signal) => {
      await this.handleVerificationResult(signal);
    });

    // PATTERN_DETECTED from consciousness-mcp
    this.handlers.set(SignalCodes.PATTERN_DETECTED, async (signal) => {
      await this.handlePatternDetected(signal);
    });

    // PATTERN_EMERGED from experience-layer
    this.handlers.set(SignalCodes.PATTERN_EMERGED, async (signal) => {
      await this.handlePatternEmerged(signal);
    });

    // Heartbeat ACK
    this.handlers.set(SignalCodes.ACK, async (signal) => {
      // Just acknowledge, no action needed
    });
  }

  async handle(action: string, signal: SignalPayload): Promise<void> {
    const handler = this.handlers.get(signal.code);
    if (handler) {
      await handler(signal);
    }
  }

  private async handleSkillCreated(signal: SignalPayload): Promise<void> {
    // Auto-submit new skills for percolation
    const { skill_name, skill_content, depth } = signal.payload;

    if (!skill_content) return;

    // Create a blueprint from the skill
    const blueprint = this.db.createBlueprint(
      skill_content,
      depth || 'standard',
      undefined,
      'skill-builder',
      { skill_name, source_signal: signal.code }
    );

    this.db.log(blueprint.id, 'AUTO_SUBMIT_FROM_SIGNAL', {
      signal_code: signal.code,
      source: signal.source,
      skill_name
    });

    // Start percolation if engine is available
    if (this.percolator) {
      try {
        await this.percolator.percolate(blueprint.id);
      } catch (error) {
        // Log but don't throw - signal handling should be resilient
        this.db.log(blueprint.id, 'AUTO_PERCOLATION_FAILED', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async handleVerificationResult(signal: SignalPayload): Promise<void> {
    // Update confidence scores based on verification
    const { blueprint_id, verified, confidence_delta } = signal.payload;

    if (!blueprint_id) return;

    const blueprint = this.db.getBlueprint(blueprint_id);
    if (!blueprint) return;

    // Adjust confidence based on verification result
    const adjustment = verified ? (confidence_delta || 0.1) : -(confidence_delta || 0.1);
    const newConfidence = Math.max(0, Math.min(1, blueprint.confidence_score + adjustment));

    this.db.updateBlueprintStatus(blueprint_id, blueprint.status as any, newConfidence);

    this.db.log(blueprint_id, 'VERIFICATION_UPDATE', {
      signal_code: signal.code,
      verified,
      confidence_delta: adjustment,
      new_confidence: newConfidence
    });
  }

  private async handlePatternDetected(signal: SignalPayload): Promise<void> {
    // Learn from patterns to improve stress testing
    const { pattern_type, pattern_data } = signal.payload;

    // Store pattern for future stress test design
    // In a full implementation, this would update the stress test scenarios
    // For now, just log it

    // Log to a pending blueprint if one exists
    const pendingBlueprints = this.db.listBlueprints('percolating', 1);
    if (pendingBlueprints.length > 0) {
      this.db.log(pendingBlueprints[0].id, 'PATTERN_DETECTED', {
        signal_code: signal.code,
        pattern_type,
        pattern_data
      });
    }
  }

  private async handlePatternEmerged(signal: SignalPayload): Promise<void> {
    // Learn from experience patterns to improve hole detection
    const { pattern_type, failure_modes } = signal.payload;

    // In a full implementation, this would update hole detection patterns
    // For now, just log it

    const pendingBlueprints = this.db.listBlueprints('percolating', 1);
    if (pendingBlueprints.length > 0) {
      this.db.log(pendingBlueprints[0].id, 'PATTERN_EMERGED', {
        signal_code: signal.code,
        pattern_type,
        failure_modes
      });
    }
  }
}

export default SignalHandlers;
