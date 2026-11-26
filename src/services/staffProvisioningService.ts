import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '../config/firebase';
import { UserRole } from '../types';

const FUNCTIONS_REGION = 'asia-southeast1';
let emulatorConnected = false;

export type ProvisionMode = 'new' | 'linkExisting';

export interface ProvisionStaffInput {
  mode: ProvisionMode;
  name?: string;
  email: string;
  initialPassword: string;
  role?: UserRole;
  phone?: string;
  username?: string;
  avatar?: string;
  machineAssigned?: string;
  active?: boolean;
  existingBusinessUserId?: string;
}

export interface StaffProvisioningStatus {
  businessUserId: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  authLinked: boolean;
  machineAssigned?: string;
}

function functionsClient() {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase is not configured.');
  const functions = getFunctions(app, FUNCTIONS_REGION);
  if (!emulatorConnected && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    const host = (import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1').trim();
    const port = Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);
    connectFunctionsEmulator(functions, host, Number.isFinite(port) ? port : 5001);
    emulatorConnected = true;
  }
  return functions;
}

function userFacingFunctionsError(error: unknown): Error {
  const code = String((error as { code?: unknown })?.code || '').replace(/^functions\//, '');
  const messages: Record<string, string> = {
    unauthenticated: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
    'permission-denied': 'Bạn không có quyền quản lý tài khoản nhân sự.',
    'invalid-argument': 'Thông tin tài khoản không hợp lệ. Hãy kiểm tra lại các trường bắt buộc.',
    'already-exists': 'Email, tên đăng nhập hoặc liên kết tài khoản đã tồn tại.',
    'failed-precondition': 'Tài khoản chưa ở trạng thái phù hợp để thực hiện thao tác này.',
    'not-found': 'Không tìm thấy nhân sự cần thao tác.',
    unavailable: 'Dịch vụ tạo tài khoản đang tạm thời không khả dụng. Vui lòng thử lại.',
    internal: 'Không thể hoàn tất thao tác tài khoản. Vui lòng liên hệ Owner nếu lỗi lặp lại.',
  };
  return new Error(messages[code] || 'Không thể hoàn tất thao tác tài khoản. Vui lòng thử lại.');
}

async function call<TRequest extends object, TResponse>(name: string, data: TRequest): Promise<TResponse> {
  try {
    const callable = httpsCallable<TRequest, TResponse>(functionsClient(), name, { timeout: 20000 });
    const result = await callable(data);
    return result.data;
  } catch (error) {
    throw userFacingFunctionsError(error);
  }
}

export const staffProvisioningService = {
  async provision(input: ProvisionStaffInput): Promise<{ businessUserId: string; role: UserRole; active: boolean; mode: ProvisionMode }> {
    return call<ProvisionStaffInput, { businessUserId: string; role: UserRole; active: boolean; mode: ProvisionMode }>('provisionStaffUser', input);
  },

  async getStatus(): Promise<StaffProvisioningStatus[]> {
    const result = await call<Record<string, never>, { staff: StaffProvisioningStatus[] }>('getStaffProvisioningStatus', {});
    return Array.isArray(result.staff) ? result.staff : [];
  },

  async setActive(businessUserId: string, active: boolean): Promise<void> {
    await call<{ businessUserId: string; active: boolean }, unknown>('setStaffActive', { businessUserId, active });
  },

  async changeRole(businessUserId: string, role: UserRole): Promise<void> {
    await call<{ businessUserId: string; role: UserRole }, unknown>('changeStaffRole', { businessUserId, role });
  },

  async resetPassword(businessUserId: string, temporaryPassword: string): Promise<void> {
    await call<{ businessUserId: string; temporaryPassword: string }, unknown>('resetStaffPassword', { businessUserId, temporaryPassword });
  },
};
