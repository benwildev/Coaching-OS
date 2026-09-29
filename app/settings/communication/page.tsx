'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate } from '@/lib/i18n';

type Channel = 'SMS' | 'WHATSAPP' | 'EMAIL';
type Tab = Channel | 'REPORTS';

interface FieldStatus {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  set: boolean;
}

interface ChannelStatus {
  channel: Channel;
  configured: boolean;
  enabled: boolean;
  fields: FieldStatus[];
}

interface SmsRecipientReport {
  number: string;
  charge: string | number;
  status: string;
}

interface DeliveryReportData {
  ok: boolean;
  requestId?: string | number | null;
  requestStatus?: string | null;
  requestCharge?: string | number | null;
  recipients?: SmsRecipientReport[];
  message?: string;
}

interface RecentSmsLog {
  id: string;
  recipientPhone: string | null;
  status: string;
  providerMessageId: string | null;
  message: string;
  createdAt: string;
  sentAt: string | null;
  errorMessage: string | null;
}

const CHANNELS: Channel[] = ['SMS', 'WHATSAPP', 'EMAIL'];

type DeepString<T> = {
  [K in keyof T]: T[K] extends object ? DeepString<T[K]> : string;
};

type CommSettingsDict = DeepString<(typeof DICTIONARY)['en']['communicationSettings']>;
type CommonDict = DeepString<(typeof DICTIONARY)['en']['common']>;

export default function CommunicationSettingsPage() {
  const { lang, currentUser, showToast } = useApp();
  const t = DICTIONARY[lang];
  const cs = t.communicationSettings;
  const c = t.common;
  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<Tab>('SMS');
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);
  const [testRecipient, setTestRecipient] = useState<Record<Channel, string>>({ SMS: '', WHATSAPP: '', EMAIL: '' });
  const [testingChannel, setTestingChannel] = useState<Channel | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string; providerMessageId?: string | null }>>({});

  // SMS Balance state
  const [balance, setBalance] = useState<{
    loading: boolean;
    data: { ok: boolean; balance?: string | number | null; currency?: string | null; validity?: string | null; message?: string } | null;
  }>({ loading: false, data: null });

  // Delivery Reports state
  const [reportInputId, setReportInputId] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [currentReport, setCurrentReport] = useState<DeliveryReportData | null>(null);
  const [recentLogs, setRecentLogs] = useState<RecentSmsLog[]>([]);
  const [recentLogsLoading, setRecentLogsLoading] = useState(false);

  const fetchBalance = useCallback((ch: Channel = 'SMS') => {
    setBalance((prev) => ({ ...prev, loading: true }));
    fetch(`/api/settings/communication/balance?channel=${ch}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBalance({ loading: false, data: d });
        } else {
          setBalance({ loading: false, data: { ok: false, message: d.message } });
        }
      })
      .catch((err) => {
        setBalance({ loading: false, data: { ok: false, message: err?.message || 'Failed to check balance' } });
      });
  }, []);

  const load = useCallback(() => {
    fetch('/api/settings/communication')
      .then((r) => r.json())
      .then((d) => d.success && setChannels(d.channels))
      .catch(() => {});
  }, []);

  const loadRecentLogs = useCallback(() => {
    setRecentLogsLoading(true);
    fetch('/api/settings/communication/report')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.recentLogs)) {
          setRecentLogs(d.recentLogs);
        }
      })
      .catch(() => {})
      .finally(() => setRecentLogsLoading(false));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const sms = channels?.find((c) => c.channel === 'SMS');
    if (sms?.configured) {
      fetchBalance('SMS');
    }
  }, [channels, fetchBalance]);

  useEffect(() => {
    if (activeTab === 'REPORTS') {
      loadRecentLogs();
    }
  }, [activeTab, loadRecentLogs]);

  const toggleEnabled = async (channel: Channel, enabled: boolean) => {
    const res = await fetch('/api/settings/communication', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, enabled }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setChannels(data.channels);
      showToast(cs.updated);
    } else {
      showToast(data.message || c.actionFailed);
    }
  };

  const testConnection = async (channel: Channel) => {
    setTestingChannel(channel);
    try {
      const res = await fetch('/api/settings/communication/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, testRecipient: testRecipient[channel] || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.result) {
        setTestResult((prev) => ({
          ...prev,
          [channel]: {
            ok: Boolean(data.result.ok),
            message: data.result.message,
            providerMessageId: data.result.providerMessageId,
          },
        }));
      } else {
        setTestResult((prev) => ({
          ...prev,
          [channel]: { ok: false, message: data.message || c.actionFailed },
        }));
      }
      if (channel === 'SMS') fetchBalance('SMS');
    } finally {
      setTestingChannel(null);
    }
  };

  const checkReport = async (reqId: string) => {
    const clean = reqId.trim();
    if (!clean) return;
    setReportInputId(clean);
    setReportLoading(true);
    setCurrentReport(null);
    try {
      const res = await fetch(`/api/settings/communication/report?requestId=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (res.ok && data.success && data.report) {
        setCurrentReport(data.report);
      } else {
        setCurrentReport({
          ok: false,
          message: data.message || 'Report request failed.',
        });
      }
    } catch (err) {
      setCurrentReport({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error fetching report.',
      });
    } finally {
      setReportLoading(false);
    }
  };

  const goToReportWithId = (reqId: string) => {
    setActiveTab('REPORTS');
    setReportInputId(reqId);
    checkReport(reqId);
  };

  if (!canManage) {
    return (
      <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
        <PageHeader backHref="/settings" backLabel={t.nav.settings} title={cs.title} subtitle={cs.subtitle} />
        <div className="card py-16 text-center text-[13px] text-[#64748b]">{c.actionFailed}</div>
      </div>
    );
  }

  const smsStatus = channels?.find((c) => c.channel === 'SMS');
  const waStatus = channels?.find((c) => c.channel === 'WHATSAPP');
  const emailStatus = channels?.find((c) => c.channel === 'EMAIL');

  const tabDefs: Array<{
    key: Tab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    badgeClass?: string;
    activeDot?: boolean;
  }> = [
    {
      key: 'SMS',
      label: cs.tabs?.sms || 'SMS Gateway',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      badge: smsStatus ? (smsStatus.configured ? (cs.configured || 'Configured') : (cs.notConfigured || 'Not configured')) : undefined,
      badgeClass: smsStatus?.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
      activeDot: smsStatus?.enabled && smsStatus?.configured,
    },
    {
      key: 'REPORTS',
      label: cs.tabs?.reports || 'Delivery Reports',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      badge: cs.reports?.checkButton || 'Live Report',
      badgeClass: 'bg-blue-100 text-blue-800',
    },
    {
      key: 'WHATSAPP',
      label: cs.tabs?.whatsapp || 'WhatsApp Business',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      badge: waStatus ? (waStatus.configured ? (cs.configured || 'Configured') : (cs.notConfigured || 'Not configured')) : undefined,
      badgeClass: waStatus?.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
      activeDot: waStatus?.enabled && waStatus?.configured,
    },
    {
      key: 'EMAIL',
      label: cs.tabs?.email || 'Email (SMTP)',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      badge: emailStatus ? (emailStatus.configured ? (cs.configured || 'Configured') : (cs.notConfigured || 'Not configured')) : undefined,
      badgeClass: emailStatus?.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
      activeDot: emailStatus?.enabled && emailStatus?.configured,
    },
  ];

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-6 pb-12">
      <PageHeader backHref="/settings" backLabel={t.nav.settings} title={cs.title} subtitle={cs.subtitle} />

      {/* Modern Pill Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200/80">
        {tabDefs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-[13px] transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#092f63] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-slate-500'}>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.activeDot && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Channel Active" />
              )}
              {tab.badge && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                    isActive ? 'bg-white/20 text-white' : tab.badgeClass
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!channels ? (
        <div className="card py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
      ) : activeTab === 'REPORTS' ? (
        <DeliveryReportsView
          reportInputId={reportInputId}
          setReportInputId={setReportInputId}
          onCheck={checkReport}
          loading={reportLoading}
          report={currentReport}
          recentLogs={recentLogs}
          recentLogsLoading={recentLogsLoading}
          onRefreshLogs={loadRecentLogs}
          cs={cs}
          c={c}
        />
      ) : (
        CHANNELS.filter((ch) => ch === activeTab).map((channel) => {
          const status = channels.find((s) => s.channel === channel);
          if (!status) return null;

          return (
            <div key={channel} className="flex flex-col gap-5">
              {/* Channel Hero & Status Banner */}
              <div className="card p-5 flex flex-col gap-4 border border-slate-200/80 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#092f63] flex items-center justify-center font-bold">
                      {channel === 'SMS' ? '💬' : channel === 'WHATSAPP' ? '📱' : '✉️'}
                    </div>
                    <div>
                      <div className="font-bold text-[#092f63] text-[16px]">
                        {channel === 'SMS'
                          ? 'SMS Gateway (sms.net.bd)'
                          : channel === 'WHATSAPP'
                          ? 'WhatsApp Cloud API (Meta)'
                          : 'Email Gateway (SMTP)'}
                      </div>
                      <div className="text-[12px] text-slate-500">
                        {channel === 'SMS'
                          ? 'Masking & Non-masking SMS gateway for Bangladesh phone numbers'
                          : channel === 'WHATSAPP'
                          ? 'Send automated alerts via official WhatsApp Business API'
                          : 'Send receipts, invitations, and notices via standard SMTP / Gmail'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                        status.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {status.configured ? cs.configured : cs.notConfigured}
                    </span>

                    {/* Enable / Disable toggle switch */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-[12px] font-medium text-slate-700">
                        {status.enabled ? cs.enabled : cs.disabled}
                      </span>
                      <input
                        type="checkbox"
                        checked={status.enabled}
                        disabled={!status.configured}
                        onChange={(e) => toggleEnabled(channel, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 relative disabled:opacity-50"></div>
                    </label>
                  </div>
                </div>

                {/* Live SMS Balance Card (SMS only) */}
                {channel === 'SMS' && status.configured && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-emerald-50 via-emerald-50/60 to-teal-50/50 border border-emerald-200 rounded-xl shadow-xs">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xl shadow-xs">
                        ৳
                      </div>
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-900/80">
                          {cs.balanceTitle || 'SMS Balance / Recharge'}
                        </div>
                        <div className="text-[18px] font-extrabold text-emerald-950 flex items-baseline gap-2">
                          {balance.loading ? (
                            <span className="text-[13px] font-normal text-emerald-700 animate-pulse">
                              {cs.checkingBalance || 'Checking balance…'}
                            </span>
                          ) : balance.data?.ok ? (
                            <>
                              <span>৳{balance.data.balance}</span>
                              <span className="text-[12px] font-semibold text-emerald-800">
                                {balance.data.currency || 'BDT'}
                              </span>
                              {balance.data.validity && (
                                <span className="text-[11px] font-medium text-emerald-800/80 bg-emerald-100/80 px-2 py-0.5 rounded-md ml-1">
                                  {cs.validTill || 'Valid till'}: {balance.data.validity.split(' ')[0]}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[12px] font-normal text-rose-600">
                              {balance.data?.message || cs.unableToCheckBalance || 'Unable to check balance'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => fetchBalance('SMS')}
                        disabled={balance.loading}
                        className="px-3 py-1.5 text-[12px] font-medium text-emerald-900 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg shadow-xs transition disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <svg
                          className={`w-3.5 h-3.5 ${balance.loading ? 'animate-spin' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        <span>{balance.loading ? '…' : cs.refreshBalance || 'Refresh'}</span>
                      </button>
                      <a
                        href="https://portal.sms.net.bd/my-account/recharge"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 text-[12px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{cs.rechargeNow || 'Recharge'}</span>
                        <span className="text-[11px]">↗</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Provider Credentials Form */}
                <CredentialsForm
                  channel={channel}
                  fields={status.fields}
                  cs={cs}
                  c={c}
                  showToast={showToast}
                  onSaved={() => {
                    load();
                    if (channel === 'SMS') fetchBalance('SMS');
                  }}
                />

                {/* Test Connection / Send Test Message */}
                {status.configured && (
                  <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <label className="text-[13px] font-bold text-[#092f63] flex items-center gap-2">
                        <span>🧪</span>
                        <span>{cs.testRecipientLabel || 'Send a test message to (optional)'}</span>
                      </label>
                      <span className="text-[11px] text-slate-500">
                        {channel === 'SMS' ? 'Format: 01XXXXXXXXX' : channel === 'WHATSAPP' ? 'With country code' : 'Valid email address'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <input
                          value={testRecipient[channel]}
                          onChange={(e) => setTestRecipient((prev) => ({ ...prev, [channel]: e.target.value }))}
                          placeholder={
                            channel === 'SMS'
                              ? 'e.g. 01700000000'
                              : channel === 'WHATSAPP'
                              ? 'e.g. +8801700000000'
                              : 'e.g. admin@example.com'
                          }
                          className="h-10 w-full rounded-xl border border-slate-300 px-3.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#092f63]/20 focus:border-[#092f63]"
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-navy h-10 px-5 flex items-center justify-center gap-2"
                        disabled={testingChannel === channel}
                        onClick={() => testConnection(channel)}
                      >
                        {testingChannel === channel ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            <span>{cs.testing}</span>
                          </>
                        ) : testRecipient[channel] ? (
                          cs.sendTestMessage
                        ) : (
                          cs.testConnection
                        )}
                      </button>
                    </div>

                    {!testRecipient[channel] && (
                      <p className="text-[11px] text-slate-500">{cs.connectionCheckOnly}</p>
                    )}

                    {testResult[channel] && (
                      <div
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px] ${
                          testResult[channel].ok
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{testResult[channel].ok ? '✓' : '⚠'}</span>
                          <span className="font-medium">{testResult[channel].message}</span>
                        </div>
                        {channel === 'SMS' && testResult[channel].providerMessageId && (
                          <button
                            type="button"
                            onClick={() => goToReportWithId(testResult[channel].providerMessageId!)}
                            className="px-2.5 py-1 text-[11px] font-bold text-emerald-950 bg-emerald-200/80 hover:bg-emerald-300 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>{cs.reports?.checkDeliveryReport || 'Check Delivery Report'}</span>
                            <span>↗</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function CredentialsForm({
  channel,
  fields,
  cs,
  c,
  showToast,
  onSaved,
}: {
  channel: Channel;
  fields: FieldStatus[];
  cs: CommSettingsDict;
  c: CommonDict;
  showToast: (msg: string) => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setValues({});
    setDirty(new Set());
    setShowSecrets({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, fields.map((f) => f.set).join(',')]);

  const setField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const save = async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    try {
      const credentials = Object.fromEntries(Array.from(dirty).map((key) => [key, values[key] ?? '']));
      const res = await fetch('/api/settings/communication/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, credentials }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(cs.credentialsSaved);
        onSaved();
      } else {
        showToast(data.message || c.actionFailed);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 pt-2">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">
          {cs.credentialsTitle}
        </div>
        <span className="text-[11px] text-slate-400">
          {cs.credentialsPrivacyNote}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {fields.map((f) => {
          const isSecret = f.secret && !showSecrets[f.key];
          return (
            <label key={f.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-slate-800">
                  {f.label}
                  {f.required && !f.set && <span className="text-rose-600 font-bold"> *</span>}
                </span>
                {f.set && (
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    Set
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type={isSecret ? 'password' : 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.set ? cs.alreadySet : undefined}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3.5 pr-10 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#092f63]/20 focus:border-[#092f63]"
                  autoComplete="off"
                />
                {f.secret && (
                  <button
                    type="button"
                    onClick={() => toggleShowSecret(f.key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showSecrets[f.key] ? 'Hide' : 'Show'}
                  >
                    {showSecrets[f.key] ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-end pt-2">
        <button
          type="button"
          className="btn-navy h-9 px-5 text-[13px]"
          disabled={saving || dirty.size === 0}
          onClick={save}
        >
          {saving ? '…' : cs.saveCredentials}
        </button>
      </div>
    </div>
  );
}

function DeliveryReportsView({
  reportInputId,
  setReportInputId,
  onCheck,
  loading,
  report,
  recentLogs,
  recentLogsLoading,
  onRefreshLogs,
  cs,
  c,
}: {
  reportInputId: string;
  setReportInputId: (v: string) => void;
  onCheck: (id: string) => void;
  loading: boolean;
  report: DeliveryReportData | null;
  recentLogs: RecentSmsLog[];
  recentLogsLoading: boolean;
  onRefreshLogs: () => void;
  cs: CommSettingsDict;
  c: CommonDict;
}) {
  const rpt = cs.reports;

  return (
    <div className="flex flex-col gap-6">
      {/* Search Bar Card */}
      <div className="card p-5 border border-slate-200/80 shadow-xs flex flex-col gap-4">
        <div>
          <div className="font-bold text-[#092f63] text-[16px]">{rpt.title}</div>
          <div className="text-[12px] text-slate-500">{rpt.subtitle}</div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCheck(reportInputId);
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={reportInputId}
              onChange={(e) => setReportInputId(e.target.value)}
              placeholder={rpt.lookupPlaceholder}
              className="h-10 w-full pl-10 pr-3.5 rounded-xl border border-slate-300 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#092f63]/20 focus:border-[#092f63]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !reportInputId.trim()}
            className="btn-navy h-10 px-5 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                <span>{rpt.checking}</span>
              </>
            ) : (
              rpt.checkButton
            )}
          </button>
        </form>

        {/* Live Delivery Report Details */}
        {report && (
          <div className="mt-2 pt-4 border-t border-slate-100 flex flex-col gap-3.5">
            {report.ok ? (
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/80 via-slate-50 to-emerald-50/60 border border-blue-200/80 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wide">
                      {rpt.requestId}:
                    </span>
                    <span className="font-mono font-bold text-[14px] text-[#092f63] bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-xs">
                      #{report.requestId}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        String(report.requestStatus).toLowerCase().includes('complete')
                          ? 'bg-emerald-100 text-emerald-800'
                          : String(report.requestStatus).toLowerCase().includes('fail')
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {report.requestStatus}
                    </span>

                    <span className="text-[12px] font-bold text-slate-700 bg-white px-3 py-1 rounded-md border border-slate-200 shadow-xs">
                      {rpt.requestCharge}: ৳{report.requestCharge} BDT
                    </span>
                  </div>
                </div>

                {/* Recipients Table */}
                {report.recipients && report.recipients.length > 0 && (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">{rpt.recipientNumber}</th>
                          <th className="py-2 px-3">{rpt.deliveryStatus}</th>
                          <th className="py-2 px-3 text-right">{rpt.charge}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.recipients.map((rec, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70 transition">
                            <td className="py-2 px-3 font-mono text-slate-800">{rec.number}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                                  String(rec.status).toLowerCase().includes('sent') ||
                                  String(rec.status).toLowerCase().includes('deliver')
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {rec.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                              ৳{rec.charge}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[12px] flex items-center gap-2">
                <span>⚠</span>
                <span>{report.message}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Sent SMS with Direct 1-Click Report Check */}
      <div className="card p-5 border border-slate-200/80 shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-[#092f63] text-[15px]">{rpt.recentTitle}</div>
            <div className="text-[12px] text-slate-500">{rpt.recentSubtitle}</div>
          </div>
          <button
            type="button"
            onClick={onRefreshLogs}
            disabled={recentLogsLoading}
            className="text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition disabled:opacity-50 cursor-pointer"
          >
            {recentLogsLoading ? '…' : (cs.refreshBalance || 'Refresh')}
          </button>
        </div>

        {recentLogsLoading && recentLogs.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-500">{c.loading}</div>
        ) : recentLogs.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-400">{rpt.noRecentLogs}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3.5">Recipient</th>
                  <th className="py-2.5 px-3.5">Message Snippet</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5">Sent Time</th>
                  <th className="py-2.5 px-3.5">Request ID</th>
                  <th className="py-2.5 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3.5 font-mono text-slate-800">
                      {log.recipientPhone || '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-600 max-w-[260px] truncate" title={log.message}>
                      {log.message}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          log.status === 'DELIVERED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : log.status === 'SENT'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : log.status === 'FAILED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                        title={
                          log.status === 'SKIPPED'
                            ? 'Gateway was not configured when this message was queued — no SMS was sent.'
                            : log.status
                        }
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                      {log.sentAt ? formatDhakaDate(new Date(log.sentAt)) : formatDhakaDate(new Date(log.createdAt))}
                    </td>
                    <td className="py-2.5 px-3.5">
                      {log.providerMessageId ? (
                        <span className="font-mono text-[11px] font-bold text-[#092f63] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          #{log.providerMessageId}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">None</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      {log.providerMessageId ? (
                        <button
                          type="button"
                          onClick={() => onCheck(log.providerMessageId!)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition cursor-pointer"
                        >
                          {rpt.viewLiveReport}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          {log.status === 'SKIPPED' ? 'Not sent (Skipped)' : '—'}
                        </span>
                      )}
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
