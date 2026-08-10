## 2026-08-06T14:52:40Z
Task Objective:
Fix the single test assertion mismatch in `client/src/__tests__/hooks_stress.test.ts:291`:
- In `client/src/__tests__/hooks_stress.test.ts`, line 291: update `expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Đã xoá'), undefined)` to `expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Đã xoá'))` (or matching the exact 1-argument signature of `showToast("Đã xoá ...")`).
- Execute verification commands:
  - `npm --prefix client run test:run`
  - `npm test`
- Confirm 100% of client unit tests and server tests pass with exit code 0.
