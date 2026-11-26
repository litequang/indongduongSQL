# Source baseline test report

Source b1cefcdd65746c0d611c4a53633c83aef4945f5c0; Windows PowerShell 5.1; Git 2.55.0.windows.3; Node 22.22.2; npm 10.9.7. Date 2026-11-26. All checks used a private source checkout without Firebase configuration or production network access.

| Check | Result | Exit code / evidence |
|---|---|---|
| Root npm ci --ignore-scripts | PASS | 0; 564 packages; audit found 17 advisories (1 low/5 moderate/10 high/1 critical) |
| npm run build | PASS | 0; browser bundle ~2.09 MiB precache, Firebase chunk 610.52 kB, main chunk 918.05 kB; JSON server built |
| npm run lint (root deps only) | FAIL | 2; root tsconfig also includes functions and emulator tests whose separate dependencies were not yet installed |
| Local assertion suites | 5 PASS / 1 FAIL | 1; auth initialization, demo preview, production eligibility, submission lock and local workflow PASS; permission helper expects MANAGER dispatch but current policy allows WAREHOUSE only |
| Firebase emulator/rules/integration/browser suites | SKIP | Not run; require emulator/provisioned identity fixtures. No production fallback allowed |
| Gitleaks source history | PASS | 0; all 10 source commits; no detected secrets |
| Gitleaks sanitized snapshot | PASS | 0; no detected secrets |

No attempt made to repair unrelated baseline policy assertions. A follow-up lint with both lockfiles installed will be recorded below. SQL checks are separate in PHASE_01_TEST_REPORT.md and do not claim Firebase parity.
`npm ci --ignore-scripts` in functions: PASS (0), 287 packages; Node 20 engine warning under Node 22; 13 advisory findings. After both lockfiles were installed, root `npm run lint`: PASS (0). Thus the first lint failure was dependency setup, not a retained source type error.
