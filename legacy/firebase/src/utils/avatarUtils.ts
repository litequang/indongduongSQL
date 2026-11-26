import React from 'react';

export function avatarFallback(name = 'User'): string {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase() || 'U';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#e5e7eb"/><text x="48" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#52525b">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function safeAvatarSrc(value: string | null | undefined, name?: string): string {
  return value?.trim() || avatarFallback(name);
}

export function handleAvatarImageError(event: React.SyntheticEvent<HTMLImageElement>, name?: string): void {
  const fallback = avatarFallback(name);
  if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
}
