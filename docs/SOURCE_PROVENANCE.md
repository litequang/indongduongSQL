# Source provenance

Source: https://github.com/litequang/indongduong.git
Source main: b1cefcdd65746c0d611c4a53633c83aef4945f5c0
Snapshot date: 2026-11-26 (Asia/Ho_Chi_Minh).

The target was empty. Gitleaks scanned all 10 source commits and reported no detected secrets. A clean snapshot is used instead of publishing that history because employee-like names, phone numbers and demo PINs were embedded in source fixtures; their fictional status could not be established. Those fixtures and historical reports/context with potentially internal operational details are omitted. Production Firebase project identifiers are replaced with examples. No production service or database was contacted.

The private source checkout is a read-only audit/reference; only the independent target repository is written or pushed. No source-repository remote is retained in the target. Phase 04 retires the 211-file isolated Firebase reference after source/SQL parity review and regression replacement. Its last immutable target checkpoint is `9231886544ec92415e7d9b8dce36f070a76c2489`, `legacy/firebase` tree `4c5333b6bf1311a5b6ae513ffb3b9847f7843470`. Git history preserves the sanitized reference; original production data/accounts/history are never imported. See PHASE_04_PARITY.md for the removal and coverage map.
