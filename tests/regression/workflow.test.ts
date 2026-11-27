import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuickOrderText } from "../../shared/quick-order-parser";
import { findUniquePrinterMatch } from "../../shared/printer-matching";
import { createSynchronousSubmissionLock } from "../../shared/submission-lock";
test("ported quick order parser and unambiguous active specialist matching", () => {
  const p = parseQuickOrderText("Mỗi màu 2600 tờ BB58 42x56 @Thoin");
  assert.equal(p.quantity, 2600);
  assert.equal(p.paperType, "BB");
  assert.equal(p.paperGsm, "58");
  assert.equal(p.paperWidth, "42");
  assert.equal(p.paperHeight, "56");
  assert.equal(p.printerName, "Thoin");
  const users = [
    { id: "p1", name: "Nguyễn Văn Thời", role: "PRINTER", active: true },
    { id: "p2", name: "Lê Minh", role: "PRINTER", active: true },
  ];
  assert.equal(findUniquePrinterMatch("Giao @Thoin", users)?.id, "p1");
  assert.equal(
    findUniquePrinterMatch("Thời", [...users, { ...users[0], id: "p3" }]),
    undefined,
  );
  assert.equal(
    findUniquePrinterMatch("Thời", [{ ...users[0], active: false }]),
    undefined,
  );
  assert.equal(
    findUniquePrinterMatch("Thời", [{ ...users[0], role: "MANAGER" }]),
    undefined,
  );
});
test("ported synchronous duplicate submit lock used by SQL composer", () => {
  const lock = createSynchronousSubmissionLock();
  assert(lock.tryAcquire());
  assert(!lock.tryAcquire());
  assert(!lock.tryAcquire());
  assert(lock.isLocked());
  lock.release();
  assert(!lock.isLocked());
  assert(lock.tryAcquire());
});
