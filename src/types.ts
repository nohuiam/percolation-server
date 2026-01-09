import { z } from 'zod';

// Enums
export const BlueprintStatusSchema = z.enum(['pending', 'percolating', 'completed', 'failed']);
export const HoleStatusSchema = z.enum(['open', 'patched', 'wont_fix']);
export const HoleSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const DepthLevelSchema = z.enum(['quick', 'standard', 'thorough', 'exhaustive']);

export type BlueprintStatus = z.infer<typeof BlueprintStatusSchema>;
export type HoleStatus = z.infer<typeof HoleStatusSchema>;
export type HoleSeverity = z.infer<typeof HoleSeveritySchema>;
export type DepthLevel = z.infer<typeof DepthLevelSchema>;

// Tool Input Schemas
export const SubmitBlueprintSchema = z.object({
  blueprint: z.string().min(1, 'Blueprint content is required'),
  depth: DepthLevelSchema.optional().default('standard'),
  budget_tokens: z.number().int().positive().optional(),
  source: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export const GetBlueprintStatusSchema = z.object({
  blueprint_id: z.string().uuid('Invalid blueprint ID')
});

export const StressTestSchema = z.object({
  blueprint_id: z.string().uuid('Invalid blueprint ID'),
  test_type: z.enum(['edge_case', 'adversarial', 'load', 'boundary', 'security', 'consistency']),
  intensity: z.number().int().min(1).max(10).optional().default(5)
});

export const FindHolesSchema = z.object({
  blueprint_id: z.string().uuid('Invalid blueprint ID'),
  analysis_depth: z.enum(['shallow', 'moderate', 'deep']).optional().default('moderate')
});

export const PatchHoleSchema = z.object({
  blueprint_id: z.string().uuid('Invalid blueprint ID'),
  hole_id: z.string().uuid('Invalid hole ID'),
  patch: z.string().min(1, 'Patch content is required')
});

export const ResearchImprovementsSchema = z.object({
  blueprint_id: z.string().uuid('Invalid blueprint ID'),
  focus_areas: z.array(z.string()).optional().default([])
});

export const ApplyOptimizationSchema = z.object({
  blueprint_id: z.string().uuid('Invalid blueprint ID'),
  optimization_id: z.string().uuid('Invalid optimization ID')
});

export const GetPercolationResultSchema = z.object({
  blueprint_id: z.string().uuid('Invalid blueprint ID')
});

// Tool Output Types
export interface SubmitBlueprintResult {
  blueprint_id: string;
  status: BlueprintStatus;
  depth: DepthLevel;
  budget_tokens: number;
  message: string;
}

export interface BlueprintStatusResult {
  id: string;
  status: BlueprintStatus;
  depth: DepthLevel;
  budget_tokens: number;
  tokens_used: number;
  confidence_score: number;
  open_holes: number;
  patched_holes: number;
  stress_tests_run: number;
  stress_tests_passed: number;
  optimizations_applied: number;
  submitted_at: string;
  completed_at: string | null;
}

export interface StressTestResult {
  test_id: string;
  blueprint_id: string;
  test_type: string;
  intensity: number;
  passed: boolean;
  findings: string[];
  holes_found: number;
  duration_ms: number;
}

export interface FindHolesResult {
  blueprint_id: string;
  holes_found: number;
  holes: Array<{
    id: string;
    type: string;
    description: string;
    severity: HoleSeverity;
    location: string | null;
    suggested_fix: string | null;
  }>;
}

export interface PatchHoleResult {
  hole_id: string;
  blueprint_id: string;
  status: HoleStatus;
  patch_applied: boolean;
  new_content_preview: string;
  tokens_used: number;
}

export interface ResearchImprovementsResult {
  blueprint_id: string;
  improvements: Array<{
    id: string;
    source: string;
    description: string;
    estimated_improvement: number;
    tokens_cost: number;
  }>;
  research_queries_used: number;
}

export interface ApplyOptimizationResult {
  optimization_id: string;
  blueprint_id: string;
  applied: boolean;
  improvement_score: number;
  new_content_preview: string;
  tokens_used: number;
}

export interface PercolationResult {
  blueprint_id: string;
  status: BlueprintStatus;
  original_content: string;
  optimized_content: string;
  confidence_score: number;
  summary: {
    total_holes_found: number;
    holes_patched: number;
    stress_tests_run: number;
    stress_tests_passed: number;
    optimizations_applied: number;
    tokens_used: number;
    budget_tokens: number;
  };
  recommendations: string[];
}

// InterLock Signal Types - Re-export from protocol for backwards compatibility
// The canonical SignalTypes are now defined in interlock/protocol.ts
export { SignalTypes } from './interlock/protocol';

// Signal interface for BaNano protocol - Re-export from protocol
export type { Signal } from './interlock/protocol';

// Percolator Configuration
export interface PercolatorConfig {
  depths: {
    quick: { budget: number; stressTests: number; researchQueries: number };
    standard: { budget: number; stressTests: number; researchQueries: number };
    thorough: { budget: number; stressTests: number; researchQueries: number };
    exhaustive: { budget: number; stressTests: number; researchQueries: number };
  };
  defaultDepth: DepthLevel;
  maxConcurrentPercolations: number;
  timeoutMs: number; // Wall-clock timeout for percolation loop (default 5 minutes)
}

// WebSocket Event Types
export interface WSEvent {
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

export const WSEventTypes = {
  PERCOLATION_STARTED: 'percolation_started',
  STRESS_TEST_RUNNING: 'stress_test_running',
  STRESS_TEST_COMPLETE: 'stress_test_complete',
  HOLE_FOUND: 'hole_found',
  HOLE_PATCHED: 'hole_patched',
  OPTIMIZATION_APPLIED: 'optimization_applied',
  PERCOLATION_COMPLETE: 'percolation_complete',
  PERCOLATION_FAILED: 'percolation_failed',
  PERCOLATION_TIMEOUT: 'percolation_timeout',
  PING: 'ping',
  PONG: 'pong'
} as const;

// Test types for stress testing
export const StressTestTypes = {
  EDGE_CASE: 'edge_case',
  ADVERSARIAL: 'adversarial',
  LOAD: 'load',
  BOUNDARY: 'boundary',
  SECURITY: 'security',
  CONSISTENCY: 'consistency'
} as const;

// Hole types for hole finding
export const HoleTypes = {
  MISSING_STEP: 'missing_step',
  AMBIGUOUS_INSTRUCTION: 'ambiguous_instruction',
  EDGE_CASE_UNHANDLED: 'edge_case_unhandled',
  SECURITY_RISK: 'security_risk',
  PERFORMANCE_ISSUE: 'performance_issue',
  DEPENDENCY_MISSING: 'dependency_missing',
  INCONSISTENCY: 'inconsistency',
  INCOMPLETE_VALIDATION: 'incomplete_validation'
} as const;

export type StressTestType = typeof StressTestTypes[keyof typeof StressTestTypes];
export type HoleType = typeof HoleTypes[keyof typeof HoleTypes];
