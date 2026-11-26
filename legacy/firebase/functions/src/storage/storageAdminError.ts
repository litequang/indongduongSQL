import { WorkflowErrorCode } from '../workflows/workflowAuth';

export type StorageAdminErrorCode = WorkflowErrorCode | 'aborted' | 'deadline-exceeded' | 'unavailable';

export class StorageAdminError extends Error {
  constructor(
    public readonly code: StorageAdminErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StorageAdminError';
  }
}
