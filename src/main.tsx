import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Prevent uncaught cross-origin script errors & internal firestore write stream exhausted errors from terminating the app
if (typeof window !== 'undefined') {
  const isBenignError = (msg: string): boolean => {
    if (!msg) return true;
    const lower = msg.toLowerCase();
    return (
      msg === 'Script error.' ||
      lower.includes('script error') ||
      lower.includes('resizeobserver') ||
      lower.includes('audiocontext') ||
      lower.includes('resource-exhausted') ||
      lower.includes('queued writes') ||
      lower.includes('backoff delay') ||
      lower.includes('firestore') ||
      lower.includes('unavailable') ||
      lower.includes('could not reach cloud firestore') ||
      lower.includes('timeout') ||
      lower.includes('failed to fetch') ||
      lower.includes('networkerror')
    );
  };

  window.onerror = (message, source, lineno, colno, error) => {
    const msg = String(message || error?.message || '');
    if (isBenignError(msg)) {
      return true; // suppresses the error from browser reporting
    }
    return false;
  };

  window.addEventListener('error', (event) => {
    const msg = event?.message || (event?.error ? String(event.error.message || event.error) : '');
    if (isBenignError(msg)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event?.reason?.message || event?.reason || '');
    if (isBenignError(reasonStr)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

