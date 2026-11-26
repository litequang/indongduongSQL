import React, { useEffect, useState } from 'react';
import { imageStorageService } from '../services/imageStorageService';
import { StoredImageReference } from '../types';

export function useResolvedImageUrl(image: Partial<StoredImageReference> | undefined, legacyUrl?: string): string {
  const [url, setUrl] = useState(legacyUrl || image?.downloadUrl || '');
  useEffect(() => {
    let active = true;
    setUrl(legacyUrl || image?.downloadUrl || '');
    void imageStorageService.resolveImageUrl(image, legacyUrl || image?.downloadUrl)
      .then((resolved) => {
        if (active) setUrl(resolved);
      })
      .catch(() => {
        if (active) setUrl(legacyUrl || image?.downloadUrl || '');
      });
    return () => { active = false; };
  }, [image?.imageId, image?.providerType, image?.providerConfigId, image?.objectKey, image?.storagePath, image?.downloadUrl, legacyUrl]);
  return url;
}

type ResolvedImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  image?: Partial<StoredImageReference>;
  legacyUrl?: string;
  fallbackUrl?: string;
};

export const ResolvedImage: React.FC<ResolvedImageProps> = ({ image, legacyUrl, fallbackUrl, ...props }) => {
  const resolved = useResolvedImageUrl(image, legacyUrl);
  if (!resolved && !fallbackUrl) return null;
  return <img {...props} src={resolved || fallbackUrl} />;
};
