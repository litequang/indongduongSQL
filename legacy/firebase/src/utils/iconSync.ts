/**
 * Dynamic App Icon, Favicon, PWA Web App Manifest and Branding Synchronization
 * Supports custom icon.svg and brand logos across Desktop, iPad, iOS Safari, Android PWA.
 */

let dynamicManifestBlobUrl: string | null = null;

export const applyDynamicAppIcon = (
  iconUrlOrSvg?: string | null,
  companyName?: string,
  shortName?: string
) => {
  if (typeof document === 'undefined') return;

  const activeIcon = iconUrlOrSvg && iconUrlOrSvg.trim() ? iconUrlOrSvg.trim() : '/icon.svg';
  const effectiveName = companyName?.trim() || 'Lệnh In Túi Bánh Mì - Quản Lý Xưởng In';
  const effectiveShortName = shortName?.trim() || 'Lệnh In Túi';

  // 1. Update Document Title & Meta Titles
  document.title = companyName?.trim()
    ? `${companyName.trim()} - Quản Lý Sản Xuất In Ấn`
    : 'Lệnh In Túi Bánh Mì - Quản Lý Sản Xuất Xưởng In';

  const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitleMeta) {
    appleTitleMeta.setAttribute('content', effectiveShortName);
  }

  // 2. Update Favicon (<link rel="icon">)
  let faviconLink = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!faviconLink) {
    faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    document.head.appendChild(faviconLink);
  }
  faviconLink.href = activeIcon;
  if (activeIcon.endsWith('.svg')) {
    faviconLink.type = 'image/svg+xml';
  } else if (activeIcon.endsWith('.png')) {
    faviconLink.type = 'image/png';
  }

  // 3. Update Apple Touch Icon (<link rel="apple-touch-icon">)
  let appleTouchLink = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
  if (!appleTouchLink) {
    appleTouchLink = document.createElement('link');
    appleTouchLink.rel = 'apple-touch-icon';
    document.head.appendChild(appleTouchLink);
  }
  appleTouchLink.href = activeIcon;

  // 4. Update Dynamic Web App Manifest Blob for PWA Home Screen Installation
  try {
    const manifestObj = {
      name: effectiveName,
      short_name: effectiveShortName,
      description: `Ứng dụng quản lý sản xuất và lệnh in túi giấy cho ${effectiveName}`,
      start_url: '/',
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: '#f59e0b',
      orientation: 'portrait-primary',
      icons: [
        {
          src: activeIcon,
          sizes: '192x192 512x512',
          type: activeIcon.includes('svg') ? 'image/svg+xml' : 'image/png',
          purpose: 'any maskable'
        }
      ]
    };

    const manifestJson = JSON.stringify(manifestObj, null, 2);
    const blob = new Blob([manifestJson], { type: 'application/manifest+json' });

    if (dynamicManifestBlobUrl) {
      URL.revokeObjectURL(dynamicManifestBlobUrl);
    }
    dynamicManifestBlobUrl = URL.createObjectURL(blob);

    let manifestLink = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = dynamicManifestBlobUrl;
  } catch (err) {
    console.warn('Could not construct dynamic PWA manifest:', err);
  }
};

/**
 * Triggers a download of the current SVG file
 */
export const downloadSvgAsset = (svgDataOrUrl: string, fileName = 'icon.svg') => {
  if (typeof document === 'undefined') return;

  const a = document.createElement('a');
  a.download = fileName;
  a.href = svgDataOrUrl;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
