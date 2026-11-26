import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '../config/firebase';

const REGION = 'asia-southeast1';
let emulatorConnected = false;

export interface BootstrapInput {
  companyName: string;
  appName: string;
  tagline?: string;
  logoUrl?: string;
  name: string;
  email: string;
  password: string;
  setupKey: string;
}

function client() {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase is not configured.');
  const functions = getFunctions(app, REGION);
  if (!emulatorConnected && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    connectFunctionsEmulator(functions, (import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1').trim(), Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001));
    emulatorConnected = true;
  }
  return functions;
}

function message(error: unknown): Error {
  const code = String((error as { code?: unknown })?.code || '').replace(/^functions\//, '');
  const messages: Record<string, string> = {
    'permission-denied': 'Setup key không đúng.',
    'failed-precondition': 'Hệ thống đã được khởi tạo hoặc đang được khởi tạo ở nơi khác.',
    'already-exists': 'Email này đã tồn tại. Hãy dùng email khác hoặc liên hệ Owner.',
    'invalid-argument': 'Thông tin khởi tạo chưa hợp lệ. Hãy kiểm tra lại.',
    unavailable: 'Dịch vụ khởi tạo hiện chưa sẵn sàng. Vui lòng thử lại.',
  };
  return new Error(messages[code] || 'Không thể khởi tạo hệ thống. Vui lòng thử lại.');
}

export const bootstrapService = {
  async getStatus(): Promise<{ needsSetup: boolean }> {
    try {
      const result = await httpsCallable<Record<string, never>, { needsSetup: boolean }>(client(), 'getBootstrapStatus', { timeout: 10000 })({});
      return { needsSetup: result.data?.needsSetup === true };
    } catch (error) {
      throw message(error);
    }
  },

  async bootstrap(input: BootstrapInput): Promise<void> {
    try {
      await httpsCallable<BootstrapInput, { businessUserId: string }>(client(), 'bootstrapFirstDeveloper', { timeout: 30000 })(input);
    } catch (error) {
      throw message(error);
    }
  },
};
