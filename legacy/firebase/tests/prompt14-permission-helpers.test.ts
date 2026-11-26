import assert from 'node:assert/strict';
import {
  canAcceptPrintJob,
  canConfirmWarehouseDispatch,
  canCreateSalesOrderDraft,
  canEditCommercialSalesOrder,
  canFinishPrinting,
  canManageFinishing,
  canRequestProductionCancellation,
  canStartPrinting,
  hasIssueRecipientAuthority,
  hasManagementAuthority,
  hasProductionTechnicalAuthority,
  isIssueReporter,
} from '../src/permissions/index.ts';
import type { ProductionOrder, User, UserRole } from '../src/types.ts';

const user = (id: string, role: UserRole): User => ({ id, name: id, role, active: true });
const management = ['MANAGER', 'ADMIN', 'DEVELOPER'] as const;
const order = { id: 'po-1', printerId: 'printer-a' } as ProductionOrder;

for (const role of management) {
  const actor = user(role.toLowerCase(), role);
  assert.equal(hasManagementAuthority(actor), true, `${role} phải có management authority`);
  assert.equal(hasProductionTechnicalAuthority(actor), true, `${role} phải có technical authority trước Start`);
  assert.equal(canRequestProductionCancellation(actor), true, `${role} phải request cancellation được trước Start`);
  assert.equal(canConfirmWarehouseDispatch(actor), true, `${role} phải confirm dispatch được`);
}

const assignedPrinter = user('printer-a', 'PRINTER');
const wrongPrinter = user('printer-b', 'PRINTER');
const admin = user('admin', 'ADMIN');
assert.equal(canAcceptPrintJob(assignedPrinter, order), true);
assert.equal(canStartPrinting(assignedPrinter, order), true);
assert.equal(canFinishPrinting(assignedPrinter, order), true);
assert.equal(canAcceptPrintJob(wrongPrinter, order), false);
assert.equal(canStartPrinting(wrongPrinter, order), false);
assert.equal(canFinishPrinting(wrongPrinter, order), false);
assert.equal(canAcceptPrintJob(admin, { ...order, printerId: admin.id }), false, 'Admin không được đóng vai Printer');
assert.equal(canManageFinishing(admin), false, 'Admin không được đóng vai Finisher');
assert.equal(canManageFinishing(user('finisher', 'FINISHER')), true);

const managerIssue = { recipientRoles: ['MANAGER'] as UserRole[], recipientUserIds: [] as string[] };
assert.equal(hasIssueRecipientAuthority(user('manager', 'MANAGER'), managerIssue), true);
assert.equal(hasIssueRecipientAuthority(admin, managerIssue), true);
assert.equal(hasIssueRecipientAuthority(user('developer', 'DEVELOPER'), managerIssue), true);
assert.equal(hasIssueRecipientAuthority(user('sale', 'SALE'), managerIssue), false);
const printerIssue = { recipientRoles: ['PRINTER'] as UserRole[], recipientUserIds: [] as string[] };
assert.equal(hasIssueRecipientAuthority(admin, printerIssue), false, 'Management không kế thừa recipient chuyên môn');
assert.equal(hasIssueRecipientAuthority(wrongPrinter, { recipientRoles: [], recipientUserIds: [wrongPrinter.id] }), true);

assert.equal(isIssueReporter(user('reporter', 'SALE'), { reportedBy: 'reporter' }), true);
assert.equal(isIssueReporter(user('other', 'SALE'), { reportedBy: 'reporter' }), false);
assert.equal(canCreateSalesOrderDraft(user('designer', 'DESIGNER')), true);
assert.equal(canEditCommercialSalesOrder(user('designer', 'DESIGNER')), false);
assert.equal(canEditCommercialSalesOrder(user('manager', 'MANAGER')), true);

console.log('PASS Prompt 14 canonical frontend permission helpers');
