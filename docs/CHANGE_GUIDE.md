# Change guide

Read AGENTS.md and the owner in APP_MAP/FEATURE_MAP first. Check current status and branch ownership in HANDOFF before changing code. Use server-side validation and policy for every action; share DTOs, not secrets. A new schema uses a new immutable migration, never edits an applied checksum. Add meaningful real-DB tests for changed persistence/auth/workflow behavior and browser checks for changed interactions/layouts.

PC and Cloud use the same lockfile, Node target and scripts. Fetch/status before each task, one writer per branch, preserve local work, no force push. Before a checkpoint: review diff/remotes/secrets, execute relevant checks, update feature/status/test evidence, commit and push the assigned branch. HANDOFF must name the tested code checkpoint before the following documentation commit. Main merges require tested code and user review.

Retired source instructions/maps are archived under legacy/firebase/docs. They inform business invariants but cannot override this task's independent SQL/no-migration/no-Firebase runtime boundary.
