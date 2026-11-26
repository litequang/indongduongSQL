import assert from 'node:assert/strict';
import { getProductionEligibility } from '../src/utils/productionEligibility';
assert.equal(getProductionEligibility({ status: 'WAITING_ACCEPTANCE', plateStatus: 'NOT_REQUIRED' }).canAccept, true);
assert.equal(getProductionEligibility({ status: 'ACCEPTED', plateStatus: 'SENT', productionRevision: 1, printerAcknowledgedRevision: 1 }).canStartPrint, true);
assert.equal(getProductionEligibility({ status: 'WAITING_PRINT', plateStatus: 'NOT_SENT', hasBlockingIssue: true, productionRevision: 2, printerAcknowledgedRevision: 2 }).canStartPrint, true);
assert.equal(getProductionEligibility({ status: 'ACCEPTED', plateStatus: 'RECEIVED', productionRevision: 2, printerAcknowledgedRevision: 1 }).canStartPrint, false);
assert.equal(getProductionEligibility({ status: 'PRINTING', plateStatus: 'RECEIVED' }).canCompletePrint, true);
assert.equal(getProductionEligibility({ status: 'PRINTED', plateStatus: 'RECEIVED' }).canCompletePrint, false);
console.log('PASS production eligibility state transitions');
