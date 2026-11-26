import { collection, doc, serverTimestamp, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';
import { safeFirestoreSetDoc } from '../utils/firestoreSafeWrite';

export interface AuditLogEntry {
  id?: string;
  action: 'ORDER_FORCE_REOPENED' | 'RETURN_INSPECTION_COMPLETED' | 'DISPATCH_REVERSED' | 'ORDER_CANCELLED' | 'CUSTOM';
  targetType: 'SALES_ORDER' | 'SHIPMENT' | 'PRODUCTION_ORDER' | 'FINISHED_GOOD';
  targetId: string;
  targetCode?: string;
  userId: string;
  userName: string;
  userRole?: string;
  reason?: string;
  oldStatus?: string;
  newStatus?: string;
  details?: any;
  timestamp: string;
}

const COLLECTION = 'audit_logs';

export const auditRepository = {
  async recordLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'> & { timestamp?: string }): Promise<string> {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Audit log was not recorded.');
    const docRef = doc(collection(db, COLLECTION));
    const logData: AuditLogEntry = {
      ...entry,
      id: docRef.id,
      timestamp: entry.timestamp || new Date().toISOString()
    };
    await safeFirestoreSetDoc(docRef, {
      ...logData,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  },

  async getLogsByTarget(targetType: string, targetId: string): Promise<AuditLogEntry[]> {
    try {
      const db = getFirebaseDb();
      if (!db) return [];
      
      const q = query(
        collection(db, COLLECTION),
        where('targetType', '==', targetType),
        where('targetId', '==', targetId),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id } as AuditLogEntry));
    } catch (err) {
      console.warn('Could not query audit logs', err);
      return [];
    }
  }
};
