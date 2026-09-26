'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/lib/notifications/events';

interface PreferenceRow {
  category: NotificationCategory;
  inApp: boolean;
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
}

const SMS_CONFIGURED = false; // no live SMS provider wired into this deployment
const WHATSAPP_CONFIGURED = false;
const EMAIL_CONFIGURED = false;

export default function NotificationSettingsPage() {
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const ns = t.notificationSettings;
  const c = t.common;

  const [rows, setRows] = useState<PreferenceRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch('/api/settings/notifications')
      .then((r) => r.json())
      .then((d) => d.success && setRows(d.preferences))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const toggle = (category: NotificationCategory, channel: keyof Omit<PreferenceRow, 'category'>) => {
    setRows((prev) => prev && prev.map((r) => (r.category === category ? { ...r, [channel]: !r[channel] } : r)));
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: rows }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(ns.saved);
        setRows(data.preferences);
      } else {
        showToast(data.message || c.actionFailed);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/settings" backLabel={t.nav.settings} title={ns.title} subtitle={ns.subtitle} />

      <div className="card overflow-hidden">
        {!rows ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="tbl min-w-[560px]">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>{ns.category}</th>
                  <th>{ns.inApp}</th>
                  <th>{ns.sms}</th>
                  <th>{ns.whatsapp}</th>
                  <th>{ns.email}</th>
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_CATEGORIES.map((category) => {
                  const row = rows.find((r) => r.category === category) || { category, inApp: true, sms: false, whatsapp: false, email: false };
                  return (
                    <tr key={category} className="trow">
                      <td style={{ textAlign: 'left' }} className="font-semibold text-[#092f63]">
                        {(t.notificationCategory as Record<string, string>)[category]}
                      </td>
                      <td>
                        <input type="checkbox" checked={row.inApp} onChange={() => toggle(category, 'inApp')} />
                      </td>
                      <td>
                        {SMS_CONFIGURED ? (
                          <input type="checkbox" checked={row.sms} onChange={() => toggle(category, 'sms')} />
                        ) : (
                          <span className="text-[11px] text-[#94a3b8]">{ns.notConfigured}</span>
                        )}
                      </td>
                      <td>
                        {WHATSAPP_CONFIGURED ? (
                          <input type="checkbox" checked={row.whatsapp} onChange={() => toggle(category, 'whatsapp')} />
                        ) : (
                          <span className="text-[11px] text-[#94a3b8]">{ns.notConfigured}</span>
                        )}
                      </td>
                      <td>
                        {EMAIL_CONFIGURED ? (
                          <input type="checkbox" checked={row.email} onChange={() => toggle(category, 'email')} />
                        ) : (
                          <span className="text-[11px] text-[#94a3b8]">{ns.notConfigured}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end px-4 py-3 border-t border-[#edf1f7]">
          <button type="button" className="btn-navy" disabled={!rows || saving} onClick={save}>
            {saving ? c.saving : c.save}
          </button>
        </div>
      </div>
    </div>
  );
}
