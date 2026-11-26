import { UserRole } from '../types';

export type CanonicalIssueType = 'PLATE' | 'MACHINE' | 'PRINT' | 'SHIPPING' | 'RETURN' | 'GENERAL';
export type IssueStatus = 'OPEN' | 'RESOLVED' | 'CANCELLED';

export interface IssuePolicy { issueType: CanonicalIssueType; ownerRole: UserRole; escalationRoles: UserRole[]; reporterRoles: UserRole[]; isBlocking: boolean; }

const POLICIES: Record<CanonicalIssueType, IssuePolicy> = {
  PLATE: { issueType: 'PLATE', ownerRole: 'DESIGNER', escalationRoles: ['MANAGER', 'ADMIN', 'DEVELOPER'], reporterRoles: ['PRINTER'], isBlocking: false },
  MACHINE: { issueType: 'MACHINE', ownerRole: 'MANAGER', escalationRoles: ['ADMIN', 'DEVELOPER'], reporterRoles: ['PRINTER'], isBlocking: false },
  PRINT: { issueType: 'PRINT', ownerRole: 'MANAGER', escalationRoles: ['ADMIN', 'DEVELOPER'], reporterRoles: ['PRINTER'], isBlocking: false },
  SHIPPING: { issueType: 'SHIPPING', ownerRole: 'SALE', escalationRoles: ['MANAGER', 'ADMIN', 'DEVELOPER'], reporterRoles: ['SALE', 'MANAGER', 'ADMIN', 'DEVELOPER'], isBlocking: false },
  RETURN: { issueType: 'RETURN', ownerRole: 'MANAGER', escalationRoles: ['ADMIN', 'DEVELOPER'], reporterRoles: ['SALE', 'MANAGER', 'ADMIN', 'DEVELOPER'], isBlocking: false },
  GENERAL: { issueType: 'GENERAL', ownerRole: 'MANAGER', escalationRoles: ['ADMIN', 'DEVELOPER'], reporterRoles: ['PRINTER', 'SALE', 'DESIGNER', 'MANAGER', 'ADMIN', 'DEVELOPER', 'FINISHER', 'WAREHOUSE'], isBlocking: false },
};

export function normalizeIssueType(value: unknown): CanonicalIssueType {
  const text = String(value || '').toUpperCase();
  if (text.includes('PLATE')) return 'PLATE';
  if (text.includes('MACHINE')) return 'MACHINE';
  if (text.includes('PRINT')) return 'PRINT';
  if (text.includes('SHIPPING') || text.includes('SHIPMENT')) return 'SHIPPING';
  if (text.includes('RETURN')) return 'RETURN';
  return 'GENERAL';
}
export function getIssuePolicy(value: unknown): IssuePolicy { return POLICIES[normalizeIssueType(value)]; }
export function isIssueResolver(role: UserRole, policy: IssuePolicy): boolean { return role === policy.ownerRole || policy.escalationRoles.includes(role); }
export function isBlockingIssue(issue: Record<string, unknown>): boolean {
  void issue;
  return false;
}
