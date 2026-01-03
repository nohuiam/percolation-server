import { DatabaseManager, HoleSeverity, Hole } from '../database/schema';
import { HoleTypes } from '../types';

interface FoundHole {
  id: string;
  type: string;
  description: string;
  severity: HoleSeverity;
  location: string | null;
  suggestedFix: string | null;
}

export class HoleFinder {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async analyze(
    blueprintId: string,
    depth: 'shallow' | 'moderate' | 'deep'
  ): Promise<FoundHole[]> {
    const blueprint = this.db.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    const content = blueprint.current_content;
    const holes: FoundHole[] = [];

    // Run analysis based on depth
    if (depth === 'shallow') {
      holes.push(...this.shallowAnalysis(content, blueprintId));
    } else if (depth === 'moderate') {
      holes.push(...this.shallowAnalysis(content, blueprintId));
      holes.push(...this.moderateAnalysis(content, blueprintId));
    } else {
      holes.push(...this.shallowAnalysis(content, blueprintId));
      holes.push(...this.moderateAnalysis(content, blueprintId));
      holes.push(...this.deepAnalysis(content, blueprintId));
    }

    return holes;
  }

  private shallowAnalysis(content: string, blueprintId: string): FoundHole[] {
    const holes: FoundHole[] = [];

    // Check for TODO/FIXME markers
    const todoMatches = content.matchAll(/(TODO|FIXME|XXX|HACK)[:)]?\s*([^\n]+)/gi);
    for (const match of todoMatches) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.INCOMPLETE_VALIDATION,
        `Unresolved ${match[1]}: ${match[2].substring(0, 100)}`,
        'high',
        `Line containing: "${match[0].substring(0, 40)}..."`,
        `Resolve the ${match[1]} item`
      );
      holes.push(this.toFoundHole(hole));
    }

    // Check for empty sections
    const emptySection = content.match(/##\s+[^\n]+\n\s*\n(?=##|$)/);
    if (emptySection) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.MISSING_STEP,
        'Empty section detected in blueprint',
        'medium',
        emptySection[0].substring(0, 50),
        'Add content to the empty section'
      );
      holes.push(this.toFoundHole(hole));
    }

    return holes;
  }

  private moderateAnalysis(content: string, blueprintId: string): FoundHole[] {
    const holes: FoundHole[] = [];

    // Check for vague language
    const vagueTerms = [
      { term: 'somehow', severity: 'low' as HoleSeverity },
      { term: 'maybe', severity: 'low' as HoleSeverity },
      { term: 'probably', severity: 'low' as HoleSeverity },
      { term: 'might', severity: 'low' as HoleSeverity },
      { term: 'could be', severity: 'low' as HoleSeverity },
      { term: 'etc', severity: 'medium' as HoleSeverity },
      { term: 'and so on', severity: 'medium' as HoleSeverity }
    ];

    for (const { term, severity } of vagueTerms) {
      if (content.toLowerCase().includes(term)) {
        const hole = this.db.createHole(
          blueprintId,
          HoleTypes.AMBIGUOUS_INSTRUCTION,
          `Vague language: "${term}"`,
          severity,
          undefined,
          `Replace "${term}" with specific, concrete language`
        );
        holes.push(this.toFoundHole(hole));
      }
    }

    // Check for missing prerequisites
    const requiresPattern = /requires?\s+(\w+)/gi;
    const imports = content.match(requiresPattern) || [];
    if (imports.length > 0 && !content.match(/install|setup|configure|prerequisite/i)) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.DEPENDENCY_MISSING,
        'Dependencies mentioned without setup instructions',
        'medium',
        undefined,
        'Add a Prerequisites section with setup instructions'
      );
      holes.push(this.toFoundHole(hole));
    }

    // Check for conditional without alternatives
    const conditionals = content.match(/if\s+|when\s+|in case/gi) || [];
    const alternatives = content.match(/else|otherwise|alternative|fallback/gi) || [];
    if (conditionals.length > alternatives.length * 2) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.EDGE_CASE_UNHANDLED,
        'Conditionals without alternative paths',
        'medium',
        undefined,
        'Add else/otherwise clauses for conditional logic'
      );
      holes.push(this.toFoundHole(hole));
    }

    return holes;
  }

  private deepAnalysis(content: string, blueprintId: string): FoundHole[] {
    const holes: FoundHole[] = [];

    // Check for missing rollback
    const destructiveOps = (content.match(/delete|remove|update|modify|overwrite/gi) || []).length;
    const rollbackOps = (content.match(/rollback|undo|revert|backup|restore/gi) || []).length;
    if (destructiveOps > 2 && rollbackOps === 0) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.MISSING_STEP,
        'Destructive operations without rollback capability',
        'high',
        undefined,
        'Add backup and rollback procedures for destructive operations'
      );
      holes.push(this.toFoundHole(hole));
    }

    // Check for missing verification
    const actions = (content.match(/create|update|delete|modify|write/gi) || []).length;
    const verifications = (content.match(/verify|confirm|check|validate|assert/gi) || []).length;
    if (actions > 3 && verifications < actions / 3) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.INCOMPLETE_VALIDATION,
        'Insufficient verification for actions taken',
        'medium',
        undefined,
        'Add verification steps after significant actions'
      );
      holes.push(this.toFoundHole(hole));
    }

    // Check for missing logging
    if (content.length > 1000 && !content.match(/log|trace|record|audit|monitor/i)) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.MISSING_STEP,
        'No logging or audit trail in complex blueprint',
        'low',
        undefined,
        'Add logging for debugging and monitoring'
      );
      holes.push(this.toFoundHole(hole));
    }

    // Check for retry logic
    if (content.match(/request|fetch|api|call|query/i) && !content.match(/retry|attempt|backoff/i)) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.EDGE_CASE_UNHANDLED,
        'External calls without retry logic',
        'medium',
        undefined,
        'Add retry logic with exponential backoff for external calls'
      );
      holes.push(this.toFoundHole(hole));
    }

    // Check for timeout handling
    if (content.match(/async|await|promise|callback/i) && !content.match(/timeout|deadline|cancel/i)) {
      const hole = this.db.createHole(
        blueprintId,
        HoleTypes.EDGE_CASE_UNHANDLED,
        'Async operations without timeout handling',
        'medium',
        undefined,
        'Add timeout handling for async operations'
      );
      holes.push(this.toFoundHole(hole));
    }

    return holes;
  }

  private toFoundHole(hole: Hole): FoundHole {
    return {
      id: hole.id,
      type: hole.hole_type,
      description: hole.description,
      severity: hole.severity as HoleSeverity,
      location: hole.location,
      suggestedFix: hole.suggested_fix
    };
  }
}

export default HoleFinder;
