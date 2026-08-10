# E2E Test Infra: Roboflow Upgrade

## Test Philosophy
- Opaque-box, requirement-driven. Derived from user requirements in ORIGINAL_REQUEST.md.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Version Control & Isolation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | UI/UX Redesign (Dark Mode & Responsive) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 3 | Dashboard & Reports Expansion | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 4 | Performance & Refactoring (Client & Server) | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 5 | Database Schema Changes & Migrations | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 6 | Verification & Testing (No Crashes/Warnings) | ORIGINAL_REQUEST §R6 | 5 | 5 | ✓ |

## Test Architecture
- Backend integration runner: `node tests/auth.test.js` & `npm run test:server`
- Client unit runner: `vitest` in `client/`
- E2E browser runner: `npx playwright test`
- Application startup & log auditor: `node scripts/verify-startup.js`

## Coverage Goals
- Tier 1: Feature Coverage (≥5 tests per feature)
- Tier 2: Boundary & Corner Cases (≥5 tests per feature)
- Tier 3: Cross-Feature Interactions
- Tier 4: Real-World Application Workloads
