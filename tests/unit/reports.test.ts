import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, reportQuery } from "../../shared/reports";
test("CSV text cannot initiate formulas and quotes/newlines stay in one cell", () => {
  for (const s of [
    "=1+1",
    "+1",
    "-1",
    "@SUM(1)",
    "  =1",
    "\tformula",
    "\n=1",
  ]) {
    assert(csvCell(s).startsWith("\"'"));
  }
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell(null), '""');
});
test("report dates reject rollover, reversed and unbounded intervals", () => {
  assert(
    !reportQuery.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success,
  );
  assert(
    !reportQuery.safeParse({ from: "2026-11-30", to: "2026-11-01" }).success,
  );
  assert(
    !reportQuery.safeParse({ from: "2025-01-01", to: "2026-01-02" }).success,
  );
  assert(
    reportQuery.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success,
  );
});
