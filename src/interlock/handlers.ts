import { DatabaseManager } from '../database/schema';
import { PercolatorEngine } from '../percolator/engine';
import { Signal, SignalTypes, getSignalName } from './protocol';

export type SignalHandler = (signal: Signal) => Promise<void>;

export class SignalHandlers {
  private db: DatabaseManager;
  private percolator: PercolatorEngine | null = null;
  private handlers: Map<number, SignalHandler> = new Map();

  constructor(db: DatabaseManager) {
    this.db = db;
    this.registerHandlers();
  }

  setPercolator(percolator: PercolatorEngine): void {
    this.percolator = percolator;
  }

  private registerHandlers(): void {
    // SKILL_CREATED from skill-builder
    this.handlers.set(SignalTypes.SKILL_CREATED, async (signal) => {
      await this.handleSkillCreated(signal);
    });

    // VERIFICATION_RESULT from verifier-mcp
    this.handlers.set(SignalTypes.VERIFICATION_RESULT, async (signal) => {
      await this.handleVerificationResult(signal);
    });

    // PATTERN_DETECTED from consciousness-mcp
    this.handlers.set(SignalTypes.PATTERN_DETECTED, async (signal) => {
      await this.handlePatternDetected(signal);
    });

    // PATTERN_EMERGED from experience-layer
    this.handlers.set(SignalTypes.PATTERN_EMERGED, async (signal) => {
      await this.handlePatternEmerged(signal);
    });

    // Heartbeat ACK
    this.handlers.set(SignalTypes.ACK, async () => {
      // Just acknowledge, no action needed
    });

    // Heartbeat
    this.handlers.set(SignalTypes.HEARTBEAT, async () => {
      // Log heartbeat, no action needed
    });
  }

  async handle(signal: Signal): Promise<void> {
    const handler = this.handlers.get(signal.signalType);
    if (handler) {
      await handler(signal);
    }
  }

  private async handleSkillCreated(signal: Signal): Promise<void> {
    // Auto-submit new skills for percolation
    const { sender, skill_name, skill_content, depth } = signal.payload as {
      sender: string;
      skill_name?: string;
      skill_content?: string;
      depth?: string;
    };

    if (!skill_content) return;

    // Create a blueprint from the skill
    const blueprint = this.db.createBlueprint(
      skill_content,
      (depth as 'quick' | 'standard' | 'thorough' | 'exhaustive') || 'standard',
      undefined,
      'skill-builder',
      { skill_name, source_signal: getSignalName(signal.signalType) }
    );

    this.db.log(blueprint.id, 'AUTO_SUBMIT_FROM_SIGNAL', {
      signal_type: getSignalName(signal.signalType),
      source: sender,
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

  private async handleVerificationResult(signal: Signal): Promise<void> {
    // Update confidence scores based on verification
    const { sender, blueprint_id, verified, confidence_delta } = signal.payload as {
      sender: string;
      blueprint_id?: string;
      verified?: boolean;
      confidence_delta?: number;
    };

    if (!blueprint_id) return;

    const blueprint = this.db.getBlueprint(blueprint_id);
    if (!blueprint) return;

    // Adjust confidence based on verification result
    const adjustment = verified ? (confidence_delta || 0.1) : -(confidence_delta || 0.1);
    const newConfidence = Math.max(0, Math.min(1, blueprint.confidence_score + adjustment));

    this.db.updateBlueprintStatus(blueprint_id, blueprint.status as 'pending' | 'percolating' | 'completed' | 'failed', newConfidence);

    this.db.log(blueprint_id, 'VERIFICATION_UPDATE', {
      signal_type: getSignalName(signal.signalType),
      verified,
      confidence_delta: adjustment,
      new_confidence: newConfidence
    });
  }

  private async handlePatternDetected(signal: Signal): Promise<void> {
    // Learn from patterns to improve stress testing
    const { sender, pattern_type, pattern_data } = signal.payload as {
      sender: string;
      pattern_type?: string;
      pattern_data?: unknown;
    };

    // Store pattern for future stress test design
    // In a full implementation, this would update the stress test scenarios
    // For now, just log it

    // Log to a pending blueprint if one exists
    const pendingBlueprints = this.db.listBlueprints('percolating', 1);
    if (pendingBlueprints.length > 0) {
      this.db.log(pendingBlueprints[0].id, 'PATTERN_DETECTED', {
        signal_type: getSignalName(signal.signalType),
        pattern_type,
        pattern_data
      });
    }
  }

  private async handlePatternEmerged(signal: Signal): Promise<void> {
    // Learn from experience patterns to improve hole detection
    const { sender, pattern_type, failure_modes } = signal.payload as {
      sender: string;
      pattern_type?: string;
      failure_modes?: unknown;
    };

    // In a full implementation, this would update hole detection patterns
    // For now, just log it

    const pendingBlueprints = this.db.listBlueprints('percolating', 1);
    if (pendingBlueprints.length > 0) {
      this.db.log(pendingBlueprints[0].id, 'PATTERN_EMERGED', {
        signal_type: getSignalName(signal.signalType),
        pattern_type,
        failure_modes
      });
    }
  }
}

export default SignalHandlers;
