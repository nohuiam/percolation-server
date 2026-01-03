import { DatabaseManager, HoleSeverity } from '../database/schema';
import { FindHolesSchema, FindHolesResult, HoleTypes } from '../types';
import { z } from 'zod';

export type FindHolesInput = z.infer<typeof FindHolesSchema>;

interface HoleDetection {
  type: string;
  description: string;
  severity: HoleSeverity;
  location: string | null;
  suggestedFix: string | null;
}

// Hole detection patterns by analysis depth
function detectHoles(content: string, depth: 'shallow' | 'moderate' | 'deep'): HoleDetection[] {
  const holes: HoleDetection[] = [];
  const lines = content.split('\n');

  // Shallow analysis - basic structure checks
  if (!content.includes('step') && !content.includes('Step') && !content.includes('1.')) {
    holes.push({
      type: HoleTypes.MISSING_STEP,
      description: 'Blueprint lacks numbered steps or clear procedure',
      severity: 'medium',
      location: null,
      suggestedFix: 'Add numbered steps to clearly define the procedure'
    });
  }

  // Check for TODO/FIXME markers
  const todoPatterns = /(TODO|FIXME|XXX|HACK|BUG)[:)]?\s*(.+)/gi;
  let match;
  while ((match = todoPatterns.exec(content)) !== null) {
    holes.push({
      type: HoleTypes.INCOMPLETE_VALIDATION,
      description: `Unresolved marker found: ${match[1]} - ${match[2].substring(0, 50)}`,
      severity: 'high',
      location: `Near: "${match[0].substring(0, 40)}..."`,
      suggestedFix: 'Address the TODO/FIXME item before finalizing'
    });
  }

  if (depth === 'shallow') return holes;

  // Moderate analysis - semantic checks
  const conditionalPatterns = /if\s+|when\s+|unless\s+/gi;
  const conditionals = content.match(conditionalPatterns) || [];
  const elsePatterns = /else|otherwise|alternative/gi;
  const alternatives = content.match(elsePatterns) || [];

  if (conditionals.length > 0 && alternatives.length === 0) {
    holes.push({
      type: HoleTypes.EDGE_CASE_UNHANDLED,
      description: 'Conditional logic found without alternative paths',
      severity: 'medium',
      location: null,
      suggestedFix: 'Add else/otherwise clauses for all conditional branches'
    });
  }

  // Check for vague language
  const vagueTerms = ['somehow', 'maybe', 'perhaps', 'might', 'could be', 'possibly'];
  for (const term of vagueTerms) {
    if (content.toLowerCase().includes(term)) {
      holes.push({
        type: HoleTypes.AMBIGUOUS_INSTRUCTION,
        description: `Vague language detected: "${term}"`,
        severity: 'low',
        location: null,
        suggestedFix: `Replace "${term}" with specific, deterministic language`
      });
    }
  }

  // Check for missing dependencies
  const dependencyPatterns = /(requires?|depends?\s+on|needs?|import|from)\s+(\w+)/gi;
  const deps = content.match(dependencyPatterns) || [];
  if (deps.length > 0) {
    const installPatterns = /(install|setup|configure|init)/gi;
    if (!content.match(installPatterns)) {
      holes.push({
        type: HoleTypes.DEPENDENCY_MISSING,
        description: 'Dependencies mentioned but no installation/setup instructions',
        severity: 'medium',
        location: null,
        suggestedFix: 'Add setup/installation steps for dependencies'
      });
    }
  }

  if (depth === 'moderate') return holes;

  // Deep analysis - comprehensive checks
  // Check for rollback/recovery procedures
  const actionPatterns = /(delete|remove|update|modify|change|write|create)/gi;
  const actions = content.match(actionPatterns) || [];
  const rollbackPatterns = /(rollback|undo|revert|recover|backup|restore)/gi;
  const rollbacks = content.match(rollbackPatterns) || [];

  if (actions.length > 2 && rollbacks.length === 0) {
    holes.push({
      type: HoleTypes.MISSING_STEP,
      description: 'Destructive actions found without rollback/recovery procedures',
      severity: 'high',
      location: null,
      suggestedFix: 'Add backup and rollback procedures for destructive operations'
    });
  }

  // Check for verification steps
  const verifyPatterns = /(verify|confirm|check|validate|test|assert)/gi;
  const verifications = content.match(verifyPatterns) || [];
  if (verifications.length < actions.length / 2) {
    holes.push({
      type: HoleTypes.INCOMPLETE_VALIDATION,
      description: 'Insufficient verification steps for actions taken',
      severity: 'medium',
      location: null,
      suggestedFix: 'Add verification steps after each significant action'
    });
  }

  // Check for timeout/retry logic
  const asyncPatterns = /(wait|async|fetch|request|call|query|api)/gi;
  const asyncOps = content.match(asyncPatterns) || [];
  const timeoutPatterns = /(timeout|retry|attempt|fallback)/gi;
  const timeouts = content.match(timeoutPatterns) || [];

  if (asyncOps.length > 0 && timeouts.length === 0) {
    holes.push({
      type: HoleTypes.EDGE_CASE_UNHANDLED,
      description: 'Async operations without timeout/retry handling',
      severity: 'medium',
      location: null,
      suggestedFix: 'Add timeout and retry logic for async operations'
    });
  }

  // Check for logging/observability
  const logPatterns = /(log|trace|debug|monitor|metric|observe)/gi;
  if (!content.match(logPatterns) && content.length > 500) {
    holes.push({
      type: HoleTypes.MISSING_STEP,
      description: 'No logging or observability mentioned in complex blueprint',
      severity: 'low',
      location: null,
      suggestedFix: 'Add logging steps for debugging and monitoring'
    });
  }

  return holes;
}

export async function findHoles(
  input: unknown,
  db: DatabaseManager
): Promise<FindHolesResult> {
  // Validate input
  const parsed = FindHolesSchema.parse(input);

  // Get blueprint
  const blueprint = db.getBlueprint(parsed.blueprint_id);
  if (!blueprint) {
    throw new Error(`Blueprint not found: ${parsed.blueprint_id}`);
  }

  // Detect holes
  const detectedHoles = detectHoles(blueprint.current_content, parsed.analysis_depth);

  // Store holes in database
  const storedHoles: Array<{
    id: string;
    type: string;
    description: string;
    severity: HoleSeverity;
    location: string | null;
    suggested_fix: string | null;
  }> = [];

  for (const hole of detectedHoles) {
    const created = db.createHole(
      blueprint.id,
      hole.type,
      hole.description,
      hole.severity,
      hole.location || undefined,
      hole.suggestedFix || undefined
    );

    storedHoles.push({
      id: created.id,
      type: created.hole_type,
      description: created.description,
      severity: created.severity as HoleSeverity,
      location: created.location,
      suggested_fix: created.suggested_fix
    });
  }

  // Log the analysis
  db.log(blueprint.id, 'FIND_HOLES', {
    analysis_depth: parsed.analysis_depth,
    holes_found: storedHoles.length,
    severity_breakdown: {
      critical: storedHoles.filter(h => h.severity === 'critical').length,
      high: storedHoles.filter(h => h.severity === 'high').length,
      medium: storedHoles.filter(h => h.severity === 'medium').length,
      low: storedHoles.filter(h => h.severity === 'low').length
    }
  });

  return {
    blueprint_id: blueprint.id,
    holes_found: storedHoles.length,
    holes: storedHoles
  };
}

export const findHolesTool = {
  name: 'find_holes',
  description: 'Analyze a blueprint to identify weaknesses, gaps, and potential failure points.',
  inputSchema: {
    type: 'object',
    properties: {
      blueprint_id: {
        type: 'string',
        description: 'The UUID of the blueprint to analyze'
      },
      analysis_depth: {
        type: 'string',
        enum: ['shallow', 'moderate', 'deep'],
        description: 'Depth of analysis. shallow=basic structure, moderate=semantic, deep=comprehensive. Default: moderate'
      }
    },
    required: ['blueprint_id']
  }
};
