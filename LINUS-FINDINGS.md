# Linus Audit Findings: percolation-server

**Audit Date:** 2026-01-08
**Auditor:** Linus (Instance 9)
**Status:** CRITICAL FIXES APPLIED

---

## Executive Summary

percolation-server had **3 CRITICAL** issues related to stability, resource management, and test reliability. All critical issues have been fixed. Tests: 81/81 passing.

---

## Critical Fixes Applied

### C4: Database Locking in Tests
**File:** `src/database/schema.ts:87-94`, `tests/setup.ts:31-39`
**Problem:** WAL journal mode caused database locking conflicts when multiple test suites ran concurrently, because WAL requires exclusive access during pragma changes.
**Fix:**
- Use DELETE journal mode for test environments (detected via `NODE_ENV=test` or path containing `test`)
- Keep WAL mode for production (better concurrent read performance)
- Added unique database paths per test with counter + random suffix to prevent path collisions
**Impact:** Tests reliably pass without lock errors.

### C5: Unbounded Patch Growth (Memory)
**File:** `src/percolator/optimizer.ts:4-25, 60-74, 107-128`
**Problem:** Patches appended to `current_content` indefinitely with no size limits. A malicious or buggy percolation loop could exhaust memory.
**Fix:**
- Added configurable content size limits:
  - `MAX_CONTENT_SIZE_BYTES = 102400` (100KB default)
  - `MAX_PATCH_SIZE_BYTES = 10240` (10KB max per patch)
- Both `applyPatch()` and `applyOptimization()` validate sizes before applying
- Clear error messages when limits exceeded: `"Content would exceed size limit: X bytes > Y bytes. Consider completing the blueprint."`
**Impact:** Prevents unbounded memory growth from accumulated patches.

### C6: No Percolation Timeout
**File:** `src/percolator/engine.ts:99-127, 209-235`, `src/types.ts:172, 191`
**Problem:** `runPercolationLoop()` ran until `maxIterations` with no wall-clock limit. Slow stress tests or research queries could cause loops to run indefinitely.
**Fix:**
- Added `timeoutMs` config option (default 5 minutes = 300,000ms)
- Track start time at beginning of loop
- Check elapsed time at start of each iteration
- Break with timeout event if exceeded
- Apply 20% confidence penalty for timed-out percolations (incomplete analysis)
- Added `PERCOLATION_TIMEOUT` event type for WebSocket notifications
**Impact:** Percolations now have predictable maximum duration.

---

## Additional Fixes

### getBlueprint null vs undefined
**File:** `src/database/schema.ts:226-230`
**Problem:** `better-sqlite3`'s `get()` returns `undefined`, but tests expected `null`.
**Fix:** Added `return result ?? null;` to convert undefined to null.

### Cleanup cutoff comparison
**File:** `src/database/schema.ts:450-456`
**Problem:** `completed_at < cutoff` failed when timestamps matched exactly.
**Fix:** Changed to `completed_at <= cutoff` for correct boundary behavior.

---

## Types Updated

### PercolatorConfig
**File:** `src/types.ts:163-173`
**Change:** Added `timeoutMs: number` for wall-clock timeout configuration.

### WSEventTypes
**File:** `src/types.ts:182-194`
**Change:** Added `PERCOLATION_TIMEOUT: 'percolation_timeout'` event type.

---

## Testing Notes

All 81 tests pass with 82% code coverage. The timeout logic is covered in `engine.ts:115-126` but requires long-running test to trigger (currently uncovered).

---

## Files Modified

| File | Changes |
|------|---------|
| `src/database/schema.ts` | WAL/DELETE mode switch, null return, cleanup fix |
| `src/percolator/optimizer.ts` | Content size caps, patch size validation |
| `src/percolator/engine.ts` | Timeout tracking, confidence penalty |
| `src/types.ts` | timeoutMs config, PERCOLATION_TIMEOUT event |
| `tests/setup.ts` | Unique database paths per test |

---

## Recommendations

1. **Add timeout integration test** - Current tests don't trigger timeout path
2. **Consider per-depth timeouts** - Quick percolation could use 1 minute, exhaustive 30 minutes
3. **M1: Database cleanup task** - `cleanup()` exists but is never called automatically
4. **M2: Confidence scoring improvements** - Weight by hole severity, factor in depth

---

## Build Status

```
npm run build: SUCCESS
npm test: 81/81 PASSING (82% coverage)
```
