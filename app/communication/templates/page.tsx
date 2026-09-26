'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader, { EmptyState } from '@/components/PageHeader';
import CommunicationSubNav from '@/components/CommunicationSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

interface TemplateRow {
  id: string;
  title: string;
  channel: string;
  triggerEvent: string | null;
  isActive: boolean;
}

export default function CommunicationTemplatesPage() {
  const { lang, currentUser } = useApp();
  const t = DICTIONARY[lang];
  const comm = t.communication;
  const c = t.common;
  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/communication/templates?pageSize=100');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setRows(data.templates);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
      <PageHeader eyebrow={t.nav.communication} title={comm.title} subtitle={comm.subtitle}>
        {canManage && (
          <Link href="/communication/templates/new" className="primary">
            <Icon name="plus" size={16} />
            {comm.newTemplate}
          </Link>
        )}
      </PageHeader>

      <CommunicationSubNav />

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{c.loadFailed}</div>
        ) : rows.length === 0 ? (
          <EmptyState message={comm.empty} actionHref={canManage ? '/communication/templates/new' : undefined} actionLabel={canManage ? comm.newTemplate : undefined} icon="message" />
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="tbl min-w-[640px]">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>{c.title}</th>
                  <th style={{ textAlign: 'left' }}>{comm.channel}</th>
                  <th style={{ textAlign: 'left' }}>{comm.event}</th>
                  <th>{c.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="trow">
                    <td style={{ textAlign: 'left' }}>
                      <Link href={`/communication/templates/${r.id}`} className="font-semibold text-[#092f63] hover:underline">
                        {r.title}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'left' }}>{r.channel}</td>
                    <td style={{ textAlign: 'left' }}>{r.triggerEvent ? (t.notificationEvent as Record<string, string>)[r.triggerEvent] || r.triggerEvent : c.none}</td>
                    <td>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {r.isActive ? comm.active : comm.inactive}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
