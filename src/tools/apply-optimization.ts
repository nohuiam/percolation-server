import { DatabaseManager } from '../database/schema';
import { ApplyOptimizationSchema, ApplyOptimizationResult } from '../types';
import { z } from 'zod';

export type ApplyOptimizationInput = z.infer<typeof ApplyOptimizationSchema>;

// Estimate tokens for a string
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Generate optimization content based on source
function generateOptimizationContent(source: string, description: string): string {
  const optimizations: Record<string, string> = {
    best_practices: `
## Input Validation

Before processing any input:
1. Validate structure using Zod schema
2. Check for required fields
3. Sanitize string inputs
4. Reject invalid data early with clear error messages
`,
    observability: `
## Logging

Add structured logging at key points:
1. Log entry with input parameters (sanitized)
2. Log significant state changes
3. Log errors with context
4. Log completion with duration metrics
`,
    resilience: `
## Error Handling

Implement comprehensive error handling:
1. Wrap operations in try-catch blocks
2. Define error types for different failure modes
3. Provide graceful degradation options
4. Return actionable error messages
5. Clean up resources on failure
`,
    quality: `
## Verification Steps

After each significant action:
1. Verify expected state was achieved
2. Check postconditions are met
3. Log verification results
4. Abort with clear message if verification fails
`,
    safety: `
## Rollback Capability

Before destructive operations:
1. Create backup/snapshot of current state
2. Track changes made
3. Provide undo function
4. Test rollback before proceeding
`,
    performance_research: `
## Performance Optimization

Improve processing efficiency:
1. Batch similar operations together
2. Use caching for repeated lookups
3. Process independent items in parallel
4. Implement pagination for large datasets
`,
    security_research: `
## Security Hardening

Enhance security posture:
1. Sanitize all user inputs
2. Implement rate limiting
3. Add audit logging for sensitive operations
4. Validate permissions before actions
5. Use secure defaults
`,
    ux_research: `
## User Experience

Improve user interaction:
1. Provide progress indicators
2. Give clear, actionable error messages
3. Confirm destructive actions
4. Show preview before changes
5. Support undo/cancel operations
`
  };

  return optimizations[source] || `
## Improvement: ${description}

Apply the following enhancement:
${description}
`;
}

export async function applyOptimization(
  input: unknown,
  db: DatabaseManager
): Promise<ApplyOptimizationResult> {
  // Validate input
  const parsed = ApplyOptimizationSchema.parse(input);

  // Get blueprint
  const blueprint = db.getBlueprint(parsed.blueprint_id);
  if (!blueprint) {
    throw new Error(`Blueprint not found: ${parsed.blueprint_id}`);
  }

  // For now, we need to look up the optimization from the research suggestions
  // In a real implementation, we'd store pending optimizations
  // Here we'll generate the content based on common patterns
  const optimizationId = parsed.optimization_id;

  // Generate optimization content (in production, this would use stored suggestions)
  const source = 'best_practices'; // Would be retrieved from stored suggestion
  const description = 'Apply best practices optimization';
  const optimizationContent = generateOptimizationContent(source, description);

  const tokensUsed = estimateTokens(optimizationContent);
  const improvementScore = 0.15; // Would be from stored suggestion

  // Check budget
  const remainingBudget = blueprint.budget_tokens - blueprint.tokens_used;
  if (tokensUsed > remainingBudget) {
    throw new Error(`Insufficient token budget. Need ${tokensUsed}, have ${remainingBudget}`);
  }

  // Apply the optimization
  const newContent = blueprint.current_content + '\n\n' + optimizationContent;

  // Update blueprint
  db.updateBlueprintContent(blueprint.id, newContent, tokensUsed);

  // Record the optimization
  const optimization = db.createOptimization(
    blueprint.id,
    source,
    description,
    improvementScore,
    tokensUsed
  );

  // Log the optimization
  db.log(blueprint.id, 'APPLY_OPTIMIZATION', {
    optimization_id: optimization.id,
    source,
    improvement_score: improvementScore,
    tokens_used: tokensUsed
  });

  // Get preview
  const previewLength = 200;
  const newContentPreview = newContent.length > previewLength
    ? '...' + newContent.substring(newContent.length - previewLength)
    : newContent;

  return {
    optimization_id: optimization.id,
    blueprint_id: blueprint.id,
    applied: true,
    improvement_score: improvementScore,
    new_content_preview: newContentPreview,
    tokens_used: tokensUsed
  };
}

export const applyOptimizationTool = {
  name: 'apply_optimization',
  description: 'Apply a researched improvement to the blueprint.',
  inputSchema: {
    type: 'object',
    properties: {
      blueprint_id: {
        type: 'string',
        description: 'The UUID of the blueprint'
      },
      optimization_id: {
        type: 'string',
        description: 'The UUID of the optimization to apply (from research_improvements result)'
      }
    },
    required: ['blueprint_id', 'optimization_id']
  }
};
