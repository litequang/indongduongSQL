import {
  CreateStorageProviderConfigInput,
  R2Credentials,
  UpdateStorageProviderConfigInput,
} from './types';
import { StorageAdminError } from './storageAdminError';

const CONFIG_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const R2_JURISDICTIONS = ['', 'eu.', 'fedramp.', 'us.'] as const;

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', 'A request object is required.');
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(data: Record<string, unknown>, allowed: readonly string[]): void {
  const unexpected = Object.keys(data).find((key) => !allowed.includes(key));
  if (unexpected) throw new StorageAdminError('invalid-argument', `Unexpected field: ${unexpected}.`);
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new StorageAdminError('invalid-argument', `${field} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new StorageAdminError('invalid-argument', `${field} must be between 1 and ${maxLength} characters.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireText(value, field, maxLength);
}

export function validateProviderConfigId(value: unknown): string {
  const providerConfigId = requireText(value, 'Provider configuration ID', 64).toLowerCase();
  if (!CONFIG_ID_PATTERN.test(providerConfigId)) {
    throw new StorageAdminError('invalid-argument', 'Provider configuration ID must use 3-64 lowercase letters, numbers, or hyphens and start with a letter.');
  }
  return providerConfigId;
}

function validateAccountId(value: unknown): string {
  const accountId = requireText(value, 'R2 account ID', 32).toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new StorageAdminError('invalid-argument', 'R2 account ID must be a 32-character hexadecimal Cloudflare account ID.');
  }
  return accountId;
}

function validateBucket(value: unknown): string {
  const bucket = requireText(value, 'R2 bucket', 63);
  if (!BUCKET_PATTERN.test(bucket)) {
    throw new StorageAdminError('invalid-argument', 'R2 bucket must be 3-63 lowercase letters, numbers, or hyphens and start/end with a letter or number.');
  }
  return bucket;
}

function derivedEndpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function validateR2Endpoint(value: unknown, accountId: string): string {
  const raw = optionalText(value, 'R2 endpoint', 300) || derivedEndpoint(accountId);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new StorageAdminError('invalid-argument', 'R2 endpoint must be a valid HTTPS URL.');
  }
  const allowedHosts = R2_JURISDICTIONS.map((jurisdiction) => `${accountId}.${jurisdiction}r2.cloudflarestorage.com`);
  if (
    url.protocol !== 'https:' || url.port || url.username || url.password ||
    (url.pathname !== '' && url.pathname !== '/') || url.search || url.hash ||
    !allowedHosts.includes(url.hostname as typeof allowedHosts[number])
  ) {
    throw new StorageAdminError('invalid-argument', 'R2 endpoint must be the account S3 endpoint, optionally using the EU, US, or FedRAMP jurisdiction.');
  }
  return `https://${url.hostname}`;
}

function validateDeliveryBaseUrl(value: unknown): string | undefined {
  const raw = optionalText(value, 'Delivery base URL', 500);
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new StorageAdminError('invalid-argument', 'Delivery base URL must be a valid HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new StorageAdminError('invalid-argument', 'Delivery base URL must be HTTPS and cannot contain credentials, a query, or a fragment.');
  }
  return raw.replace(/\/+$/, '');
}

function validateEnabled(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') throw new StorageAdminError('invalid-argument', 'Enabled must be true or false.');
  return value;
}

function validatePriority(value: unknown, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 10000) {
    throw new StorageAdminError('invalid-argument', 'Priority must be an integer from 0 to 10000.');
  }
  return value as number;
}

function validateSoftLimitBytes(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new StorageAdminError('invalid-argument', 'Soft limit must be a positive whole number of bytes.');
  }
  return value as number;
}

export function validateCreateProviderConfig(value: unknown): CreateStorageProviderConfigInput {
  const data = requireObject(value);
  assertAllowedKeys(data, [
    'providerConfigId', 'providerType', 'displayName', 'accountId', 'bucket',
    'endpoint', 'deliveryBaseUrl', 'enabled', 'priority', 'softLimitBytes',
  ]);
  if (data.providerType !== 'R2') throw new StorageAdminError('invalid-argument', 'Provider type must be R2.');
  const accountId = validateAccountId(data.accountId);
  if (validateEnabled(data.enabled, false)) {
    throw new StorageAdminError('invalid-argument', 'New storage providers must be created disabled and enabled explicitly after a healthy test.');
  }
  return {
    providerConfigId: validateProviderConfigId(data.providerConfigId),
    providerType: 'R2',
    displayName: requireText(data.displayName, 'Display name', 100),
    accountId,
    bucket: validateBucket(data.bucket),
    endpoint: validateR2Endpoint(data.endpoint, accountId),
    deliveryBaseUrl: validateDeliveryBaseUrl(data.deliveryBaseUrl),
    enabled: false,
    priority: validatePriority(data.priority, 100),
    softLimitBytes: validateSoftLimitBytes(data.softLimitBytes),
  };
}

export function providerConfigIdFromRequest(value: unknown): string {
  return validateProviderConfigId(requireObject(value).providerConfigId);
}

export function validateUpdateProviderConfig(value: unknown, existingAccountId?: string): UpdateStorageProviderConfigInput {
  const data = requireObject(value);
  assertAllowedKeys(data, [
    'providerConfigId', 'displayName', 'accountId', 'bucket', 'endpoint',
    'deliveryBaseUrl', 'priority', 'softLimitBytes',
  ]);
  const providerConfigId = validateProviderConfigId(data.providerConfigId);
  if (Object.keys(data).length === 1) throw new StorageAdminError('invalid-argument', 'At least one provider field must be updated.');
  const accountId = data.accountId === undefined ? undefined : validateAccountId(data.accountId);
  const update: UpdateStorageProviderConfigInput = { providerConfigId };
  if (data.displayName !== undefined) update.displayName = requireText(data.displayName, 'Display name', 100);
  if (accountId !== undefined) update.accountId = accountId;
  if (data.bucket !== undefined) update.bucket = validateBucket(data.bucket);
  if (data.endpoint !== undefined) {
    const endpointAccountId = accountId || existingAccountId;
    if (!endpointAccountId) throw new StorageAdminError('invalid-argument', 'Account ID is required when changing the R2 endpoint.');
    update.endpoint = validateR2Endpoint(data.endpoint, endpointAccountId);
  } else if (accountId) {
    update.endpoint = derivedEndpoint(accountId);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'deliveryBaseUrl')) {
    update.deliveryBaseUrl = validateDeliveryBaseUrl(data.deliveryBaseUrl);
  }
  if (data.priority !== undefined) update.priority = validatePriority(data.priority, 100);
  if (Object.prototype.hasOwnProperty.call(data, 'softLimitBytes')) {
    update.softLimitBytes = validateSoftLimitBytes(data.softLimitBytes);
  }
  return update;
}

export function validateCredentialsRequest(value: unknown): { providerConfigId: string; credentials: R2Credentials } {
  const data = requireObject(value);
  assertAllowedKeys(data, ['providerConfigId', 'accessKeyId', 'secretAccessKey']);
  const accessKeyId = requireText(data.accessKeyId, 'R2 access key ID', 256);
  const secretAccessKey = requireText(data.secretAccessKey, 'R2 secret access key', 512);
  if (/\s/.test(accessKeyId) || /\s/.test(secretAccessKey)) {
    throw new StorageAdminError('invalid-argument', 'R2 credentials cannot contain whitespace.');
  }
  return {
    providerConfigId: validateProviderConfigId(data.providerConfigId),
    credentials: { accessKeyId, secretAccessKey },
  };
}

export function validateConfigIdRequest(value: unknown): string {
  const data = requireObject(value);
  assertAllowedKeys(data, ['providerConfigId']);
  return validateProviderConfigId(data.providerConfigId);
}

export function validateListRequest(value: unknown): void {
  if (value === undefined || value === null) return;
  const data = requireObject(value);
  assertAllowedKeys(data, []);
}
