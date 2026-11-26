import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { getFirebaseApp } from '../config/firebase';

const REGION = 'asia-southeast1';
let emulatorConnected = false;

export function getRegionalFunctions() {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase is not configured.');
  const functions = getFunctions(app, REGION);
  if (!emulatorConnected && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    const host = (import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1').trim();
    const configuredPort = Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);
    connectFunctionsEmulator(functions, host, Number.isFinite(configuredPort) ? configuredPort : 5001);
    emulatorConnected = true;
  }
  return functions;
}
