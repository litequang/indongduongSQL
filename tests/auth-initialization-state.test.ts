import assert from 'node:assert/strict';
import { getAuthGateMode, isAuthIdentityRole } from '../src/utils/authInitializationState';

function gate(input: Parameters<typeof getAuthGateMode>[0]) {
  return getAuthGateMode(input);
}

// A: Existing Firebase session during F5/reload stays on the splash until the
// identity and business profile are both resolved.
assert.equal(gate({
  authInitializationState: 'AUTH_INITIALIZING',
  hasResolvedBusinessProfile: false,
  hasResolutionError: false,
  isDemoActive: false,
}), 'SPLASH', 'F5 authenticated: initial auth resolution must not show Login');

assert.equal(gate({
  authInitializationState: 'AUTHENTICATED',
  hasResolvedBusinessProfile: true,
  hasResolutionError: false,
  isDemoActive: false,
}), 'APP', 'verified identity/profile should open the app');

// B/C: Login is shown only after Firebase reports no current user, including
// the terminal state after logout.
assert.equal(gate({
  authInitializationState: 'UNAUTHENTICATED',
  hasResolvedBusinessProfile: false,
  hasResolutionError: false,
  isDemoActive: false,
}), 'LOGIN', 'unauthenticated Firebase state should show Login');

// D: A Firebase user with a missing identity, disabled profile, or denied
// profile read is an account error, never a fallback to Login.
assert.equal(gate({
  authInitializationState: 'AUTHENTICATED',
  hasResolvedBusinessProfile: false,
  hasResolutionError: true,
  isDemoActive: false,
}), 'ACCOUNT_ERROR', 'resolved account error must not show Login');

// E: Slow auth/profile I/O remains visible as the loading state.
assert.equal(gate({
  authInitializationState: 'AUTH_INITIALIZING',
  hasResolvedBusinessProfile: false,
  hasResolutionError: false,
  isDemoActive: false,
}), 'SPLASH', 'slow auth resolution must remain on Splash');

// The existing DEMO build keeps its PIN workflow and is not constrained by
// production Firebase session resolution.
assert.equal(gate({
  authInitializationState: 'UNAUTHENTICATED',
  hasResolvedBusinessProfile: false,
  hasResolutionError: false,
  isDemoActive: true,
}), 'APP', 'demo build keeps its separate shell/login flow');

for (const role of ['DEVELOPER', 'ADMIN', 'PRINTER', 'DESIGNER', 'SALE', 'FINISHER']) {
  assert.equal(isAuthIdentityRole(role), true, `${role} must remain a valid identity-resolved role`);
}
assert.equal(isAuthIdentityRole('UNTRUSTED_ROLE'), false, 'untrusted roles must remain rejected');

console.log('PASS AUTH INITIALIZATION GATE: F5 authenticated, F5 unauthenticated, logout, missing identity, slow initialization, demo isolation, and role resolution');
