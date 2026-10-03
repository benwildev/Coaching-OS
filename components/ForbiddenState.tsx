'use client';

import Link from 'next/link';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

/**
 * Shared "no permission" state. Rendered by the app shell INSTEAD of the page
 * (the page never mounts, so it never fetches data it should not see).
 */
export default function ForbiddenState() {
  const { lang } = useApp();
  const t = DICTIONARY[lang].forbidden;
  return (
    <div role="alert" data-testid="forbidden-state" className="max-w-[520px] mx-auto card p-8 text-center flex flex-col items-center gap-3">
      <span className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
        <Icon name="lock" size={22} />
      </span>
      <div className="text-xs font-black tracking-wider text-[#64748b]">{t.code}</div>
      <h1 className="text-xl font-black text-[#092f63]">{t.title}</h1>
      <p className="text-[13px] text-[#64748b]">{t.body}</p>
      <Link href="/dashboard" className="btn-navy mt-2">
        {t.back}
      </Link>
    </div>
  );
}
