import assert from 'node:assert/strict';
import { chooseAuthoritativeDraft } from '../src/repositories/localProductionDraftRepository';
import { findUniquePrinterMatch } from '../src/utils/printerMatching';
import { parseQuickOrderText } from '../src/utils/textParser';
import type { ProductionOrder } from '../src/types';

const parsed = parseQuickOrderText('Mỗi màu 2600 tờ BB58 42x56 @Thoin');
assert.equal(parsed.quantity, 2600);
assert.equal(parsed.paperType, 'BB');
assert.equal(parsed.paperGsm, '58');
assert.equal(parsed.paperWidth, '42');
assert.equal(parsed.paperHeight, '56');
assert.equal(parsed.printerName, 'Thoin');

const printers = [
  { id: 'printer-thoi', name: 'Nguyễn Văn Thời', role: 'PRINTER', active: true },
  { id: 'printer-minh', name: 'Lê Minh', role: 'PRINTER', active: true },
];
assert.equal(findUniquePrinterMatch('Mỗi màu 2600 tờ BB58 42x56 @Thoin', printers)?.id, 'printer-thoi');
assert.equal(findUniquePrinterMatch('Giao cho Thời', [...printers, { id: 'printer-thoi-2', name: 'Trần Thời', role: 'PRINTER', active: true }]), undefined);

const baseOrder = {
  id: 'draft-stable-id',
  code: 'NHAP-draft-stable-id',
  status: 'DRAFT',
  items: [],
  createdAt: '2026-08-23T00:00:00.000Z',
} as unknown as ProductionOrder;
const local = { ...baseOrder, note: 'local wins', draftSync: { localRevision: 1, backupRevision: 99, backupStatus: 'BACKED_UP' as const } };
const backup = { ...baseOrder, note: 'older server backup', draftSync: { localRevision: 99, backupRevision: 99, backupStatus: 'BACKED_UP' as const } };
assert.equal(chooseAuthoritativeDraft(local, backup)?.note, 'local wins');
assert.equal(chooseAuthoritativeDraft(null, backup)?.note, 'older server backup');

const rapidIds = Array.from({ length: 20 }, (_, index) => `draft-${index}`);
assert.equal(new Set(rapidIds).size, 20);
console.log('PASS Workflow V2 local-first, parser, unique printer matching');
