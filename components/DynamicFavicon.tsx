'use client';

import { useEffect } from 'react';

/**
 * Next.js's app/favicon.ico is a static, build-time file — it can't reflect
 * a per-tenant uploaded favicon. This swaps the <link rel="icon"> tag at
 * runtime once branding data is available, falling back to the static
 * default (silently, by doing nothing) when no tenant favicon is set.
 */
export default function DynamicFavicon({ url }: { url?: string | null }) {
  useEffect(() => {
    if (!url) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  }, [url]);

  return null;
}
