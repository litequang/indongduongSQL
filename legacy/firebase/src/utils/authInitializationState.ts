/**
 * Firebase Auth resolves asynchronously, including when it restores a saved
 * browser session. Keep the render decision separate from a nullable user so
 * Login can never appear before that initial resolution completes.
 */
export type AuthInitializationState = 'AUTH_INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

export type AuthGateMode = 'SPLASH' | 'APP' | 'LOGIN' | 'ACCOUNT_ERROR';

// Kept in the auth resolver rather than relying on a profile document's role.
export const AUTH_IDENTITY_ROLES: readonly UserRole[] = [
  'DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER', 'SALE', 'PRINTER', 'FINISHER', 'WAREHOUSE',
];

export function isAuthIdentityRole(value: unknown): value is UserRole {
  return AUTH_IDENTITY_ROLES.includes(String(value) as UserRole);
}

export interface AuthGateInput {
  authInitializationState: AuthInitializationState;
  hasResolvedBusinessProfile: boolean;
  hasResolutionError: boolean;
  isDemoActive: boolean;
}

/**
 * Fail closed for the production app shell. The Login screen is reachable
 * only after Firebase explicitly reports that no user is signed in.
 */
export function getAuthGateMode({
  authInitializationState,
  hasResolvedBusinessProfile,
  hasResolutionError,
  isDemoActive,
}: AuthGateInput): AuthGateMode {
  if (isDemoActive) return 'APP';
  if (hasResolutionError) return 'ACCOUNT_ERROR';
  if (authInitializationState === 'AUTH_INITIALIZING') return 'SPLASH';
  if (authInitializationState === 'UNAUTHENTICATED') return 'LOGIN';
  return hasResolvedBusinessProfile ? 'APP' : 'SPLASH';
}
import type { UserRole } from '../types';
