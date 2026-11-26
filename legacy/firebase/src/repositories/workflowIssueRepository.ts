import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';
import { WorkflowIssue } from '../types';

export const workflowIssueRepository = {
  async getOpenForEntities(entityIds: string[], stage: WorkflowIssue['stage']): Promise<WorkflowIssue[]> {
    const db = getFirebaseDb();
    if (!db || entityIds.length === 0) return [];
    const snapshot = await getDocs(query(collection(db, 'workflow_issues'), orderBy('createdAt', 'desc')));
    const ids = new Set(entityIds);
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as WorkflowIssue)
      .filter(issue => issue.status === 'OPEN' && issue.stage === stage && ids.has(issue.entityId));
  },
  subscribe(onChange: (issues: WorkflowIssue[]) => void, onError?: (error: Error) => void): () => void {
    const db = getFirebaseDb();
    if (!db) {
      onChange([]);
      return () => undefined;
    }
    return onSnapshot(query(collection(db, 'workflow_issues'), orderBy('createdAt', 'desc')), snapshot => {
      onChange(snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as WorkflowIssue));
    }, error => onError?.(error));
  },
};
