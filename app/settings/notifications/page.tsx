'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, pickLocalized } from '@/lib/i18n';
import type {
  EnrichedNotificationPolicy,
} from '@/lib/services/notification-policy.service';
import type {
  NotificationRecipientType,
  NotificationDeliveryChannel,
  NotificationCategory,
} from '@/lib/notifications/events';
import {
  ShieldAlert,
  Sliders,
  Radio,
  Lock,
  Search,
  RotateCcw,
  Save,
  UserCheck,
  Users,
  GraduationCap,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface PreferenceRow {
  category: NotificationCategory;
  inApp: boolean;
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  ATTENDANCE: '📅',
  FEE: '💳',
  EXAM: '📝',
  RESULT: '🏆',
  HOMEWORK: '📚',
  NOTICE: '📢',
  SCHEDULE: '⏱️',
  ADMISSION: '🎓',
  COMMUNICATION: '💬',
  MATERIAL: '📂',
};

const RECIPIENT_ORDER: NotificationRecipientType[] = ['STUDENT', 'GUARDIAN', 'TEACHER', 'ADMIN'];

const RECIPIENT_LABELS: Record<NotificationRecipientType, { en: string; bn: string; icon: typeof Users }> = {
  STUDENT: { en: 'Student', bn: 'শিক্ষার্থী', icon: GraduationCap },
  GUARDIAN: { en: 'Guardian', bn: 'অভিভাবক', icon: Users },
  TEACHER: { en: 'Teacher', bn: 'শিক্ষক', icon: UserCheck },
  ADMIN: { en: 'Admin', bn: 'প্রশাসক', icon: ShieldCheck },
};

const CHANNEL_LABELS: Record<NotificationDeliveryChannel, string> = {
  IN_APP: 'In-App',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  PUSH: 'Push',
};

export default function NotificationSettingsPage() {
  const { lang, showToast, can } = useApp();
  const t = DICTIONARY[lang];
  const ns = t.notificationSettings;
  const c = t.common;
  const canManagePolicies = can('settings.notification_policy.update');

  // Tabs: 'policies' | 'preferences'
  const [activeTab, setActiveTab] = useState<'policies' | 'preferences'>('policies');

  // Policy Data
  const [policies, setPolicies] = useState<EnrichedNotificationPolicy[] | null>(null);
  const [originalPolicies, setOriginalPolicies] = useState<EnrichedNotificationPolicy[] | null>(null);
  const [preferences, setPreferences] = useState<PreferenceRow[] | null>(null);
  const [originalPreferences, setOriginalPreferences] = useState<PreferenceRow[] | null>(null);
  const [channelsConfigured, setChannelsConfigured] = useState({ SMS: false, WHATSAPP: false, EMAIL: false });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [mandatoryFilter, setMandatoryFilter] = useState<'ALL' | 'MANDATORY' | 'CONFIGURABLE'>('ALL');
  const [expandedChannelsPolicyId, setExpandedChannelsPolicyId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch('/api/settings/notifications')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPolicies(d.policies || []);
          setOriginalPolicies(JSON.parse(JSON.stringify(d.policies || [])));
          setPreferences(d.preferences || []);
          setOriginalPreferences(JSON.parse(JSON.stringify(d.preferences || [])));
          if (d.channelsConfigured) setChannelsConfigured(d.channelsConfigured);
        }
      })
      .catch((err) => {
        console.error('Failed to load notifications settings:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Track unsaved policy changes
  const modifiedPolicies = useMemo(() => {
    if (!policies || !originalPolicies) return [];
    return policies.filter((p) => {
      const orig = originalPolicies.find((o) => o.notificationType === p.notificationType);
      if (!orig) return false;
      return JSON.stringify(p) !== JSON.stringify(orig);
    });
  }, [policies, originalPolicies]);

  // Toggle master policy switch
  const handleTogglePolicy = (notificationType: string) => {
    if (!policies) return;
    setPolicies((prev) =>
      prev
        ? prev.map((p) => {
            if (p.notificationType !== notificationType) return p;
            if (p.isMandatory) return p; // Never allow toggling mandatory policy
            return { ...p, isEnabled: !p.isEnabled };
          })
        : null
    );
  };

  // Toggle recipient switch
  const handleToggleRecipient = (notificationType: string, recipientType: NotificationRecipientType) => {
    if (!policies) return;
    setPolicies((prev) =>
      prev
        ? prev.map((p) => {
            if (p.notificationType !== notificationType) return p;
            return {
              ...p,
              recipients: p.recipients.map((r) => {
                if (r.recipientType !== recipientType) return r;
                if (r.isMandatory) return r; // Locked
                return { ...r, isEnabled: !r.isEnabled };
              }),
            };
          })
        : null
    );
  };

  // Toggle channel for a recipient
  const handleToggleChannel = (
    notificationType: string,
    recipientType: NotificationRecipientType,
    channel: NotificationDeliveryChannel
  ) => {
    if (!policies) return;
    setPolicies((prev) =>
      prev
        ? prev.map((p) => {
            if (p.notificationType !== notificationType) return p;
            return {
              ...p,
              recipients: p.recipients.map((r) => {
                if (r.recipientType !== recipientType) return r;
                return {
                  ...r,
                  channels: r.channels.map((c) => {
                    if (c.channel !== channel) return c;
                    return { ...c, isEnabled: !c.isEnabled };
                  }),
                };
              }),
            };
          })
        : null
    );
  };

  // Save changes
  const handleSavePolicies = async () => {
    if (!policies || modifiedPolicies.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        policies: modifiedPolicies.map((p) => ({
          notificationType: p.notificationType,
          isEnabled: p.isEnabled,
          recipients: p.recipients.map((r) => ({
            recipientType: r.recipientType,
            isEnabled: r.isEnabled,
            channels: r.channels.map((ch) => ({
              channel: ch.channel,
              isEnabled: ch.isEnabled,
            })),
          })),
        })),
      };

      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(ns.saved);
        if (data.policies) {
          setPolicies(data.policies);
          setOriginalPolicies(JSON.parse(JSON.stringify(data.policies)));
        }
      } else {
        showToast(data.message || c.actionFailed);
      }
    } catch {
      showToast(c.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  // Discard changes
  const handleResetPolicies = () => {
    if (originalPolicies) {
      setPolicies(JSON.parse(JSON.stringify(originalPolicies)));
    }
  };

  // Categories list
  const categories = useMemo(() => {
    if (!policies) return [];
    const set = new Set<string>();
    policies.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [policies]);

  // Filtered policies
  const filteredPolicies = useMemo(() => {
    if (!policies) return [];
    return policies.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (mandatoryFilter === 'MANDATORY' && !p.isMandatory) return false;
      if (mandatoryFilter === 'CONFIGURABLE' && p.isMandatory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = p.titleEn.toLowerCase().includes(q) || p.titleBn.toLowerCase().includes(q);
        const matchDesc = p.descriptionEn.toLowerCase().includes(q) || p.descriptionBn.toLowerCase().includes(q);
        const matchType = p.notificationType.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchType) return false;
      }
      return true;
    });
  }, [policies, categoryFilter, mandatoryFilter, search]);

  // Group filtered policies by category
  const groupedPolicies = useMemo(() => {
    const map = new Map<string, EnrichedNotificationPolicy[]>();
    for (const p of filteredPolicies) {
      const list = map.get(p.category) || [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, [filteredPolicies]);

  return (
    <div className="max-w-[1140px] mx-auto flex flex-col gap-6 pb-24">
      {/* Top Header */}
      <PageHeader
        backHref="/settings"
        backLabel={t.nav.settings}
        title={ns.title}
        subtitle={ns.subtitle}
      />

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          {canManagePolicies && (
            <button
              type="button"
              onClick={() => setActiveTab('policies')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13.5px] font-bold transition-all shadow-sm ${
                activeTab === 'policies'
                  ? 'bg-[#092f63] text-white shadow-[#092f63]/20'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>{ns.policyTab}</span>
              {modifiedPolicies.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[11px] font-black rounded-full bg-amber-400 text-[#092f63]">
                  {modifiedPolicies.length}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13.5px] font-bold transition-all shadow-sm ${
              activeTab === 'preferences'
                ? 'bg-[#092f63] text-white shadow-[#092f63]/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>{ns.preferencesTab}</span>
          </button>
        </div>

        {/* Link to Gateway Channel Settings */}
        <Link
          href="/settings/communication"
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-600 hover:text-[#092f63] hover:border-slate-300 transition-all shadow-xs"
        >
          <Radio className="w-3.5 h-3.5 text-blue-500" />
          <span>{ns.channelsTab}</span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            (SMS: {channelsConfigured.SMS ? '🟢' : '⚪'})
          </span>
        </Link>
      </div>

      {/* TAB 1: NOTIFICATION ALERT POLICIES */}
      {activeTab === 'policies' && (
        <div className="flex flex-col gap-5">
          {/* Top Explanatory Banner */}
          <div className="card p-4.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white border-blue-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#092f63] text-white flex items-center justify-center shrink-0 shadow-sm">
                <ShieldCheck className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[#092f63] flex items-center gap-2">
                  <span>Organization Alert Control Engine</span>
                  <span className="px-2 py-0.5 text-[10.5px] font-black rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                    Owner & Admin Protected
                  </span>
                </h3>
                <p className="text-[12.5px] text-slate-600 mt-0.5 max-w-2xl leading-relaxed">
                  Define which alerts are dispatched, which roles (Student, Guardian, Teacher, Admin) receive them, and through which delivery channels. Mandatory alerts (e.g. Critical Absence, Urgent Notice) are locked 🔒 to guarantee institutional safety.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12px] font-bold text-slate-500 shrink-0">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                <Lock className="w-3.5 h-3.5" />
                <span>{ns.mandatoryBadge} (Locked)</span>
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                <span>{ns.configurableBadge}</span>
              </span>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="card p-3.5 flex flex-wrap items-center justify-between gap-3 bg-white">
            <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={ns.searchPlaceholder}
                  className="w-full pl-9 pr-3 py-1.5 text-[13px] rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#092f63] outline-hidden transition-all"
                />
              </div>

              {/* Category Dropdown Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="py-1.5 px-3 text-[12.5px] font-semibold rounded-lg border border-slate-200 bg-slate-50/50 text-slate-700 outline-hidden"
              >
                <option value="ALL">{ns.allCategories}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_ICONS[cat] || '📌'} {(t.notificationCategory as Record<string, string>)[cat] || cat}
                  </option>
                ))}
              </select>

              {/* Mandatory Filter */}
              <select
                value={mandatoryFilter}
                onChange={(e) => setMandatoryFilter(e.target.value as typeof mandatoryFilter)}
                className="py-1.5 px-3 text-[12.5px] font-semibold rounded-lg border border-slate-200 bg-slate-50/50 text-slate-700 outline-hidden"
              >
                <option value="ALL">All Alerts</option>
                <option value="MANDATORY">Mandatory Only 🔒</option>
                <option value="CONFIGURABLE">Configurable Only</option>
              </select>
            </div>

            <div className="text-[12px] font-bold text-slate-500">
              Showing {filteredPolicies.length} of {policies?.length || 0} policies
            </div>
          </div>

          {/* Policy List Grouped by Category */}
          {loading ? (
            <div className="card py-20 text-center text-slate-400 text-sm font-semibold flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-[#092f63] animate-spin" />
              <span>Loading alert policies...</span>
            </div>
          ) : filteredPolicies.length === 0 ? (
            <div className="card py-16 text-center text-slate-500 text-sm">
              No notification policies match your search or filter.
            </div>
          ) : (
            Array.from(groupedPolicies.entries()).map(([category, items]) => (
              <div key={category} className="flex flex-col gap-2.5">
                {/* Category Header */}
                <div className="flex items-center gap-2 px-1 pt-2">
                  <span className="text-base">{CATEGORY_ICONS[category] || '📌'}</span>
                  <h2 className="text-[14px] font-black text-[#092f63] tracking-wide uppercase">
                    {(t.notificationCategory as Record<string, string>)[category] || category}
                  </h2>
                  <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-full bg-slate-200/70 text-slate-700">
                    {items.length}
                  </span>
                </div>

                {/* Cards for each policy in this category */}
                <div className="flex flex-col gap-2.5">
                  {items.map((policy) => {
                    const isExpanded = expandedChannelsPolicyId === policy.id;
                    const isModified = modifiedPolicies.some((m) => m.notificationType === policy.notificationType);

                    return (
                      <div
                        key={policy.id}
                        className={`card overflow-hidden border transition-all ${
                          isModified
                            ? 'border-amber-400 shadow-md shadow-amber-500/5 bg-amber-50/20'
                            : 'border-slate-200/90 hover:border-slate-300'
                        }`}
                      >
                        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Left: Info */}
                          <div className="flex-1 min-w-[280px]">
                            <div className="flex items-center flex-wrap gap-2 mb-1">
                              <h3 className="font-extrabold text-[14.5px] text-[#092f63]">
                                {pickLocalized(lang, policy.titleEn, policy.titleBn)}
                              </h3>

                              {policy.isMandatory ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-extrabold rounded-md bg-amber-100 text-amber-900 border border-amber-200"
                                  title={ns.mandatoryTooltip}
                                >
                                  <Lock className="w-3 h-3 text-amber-700" />
                                  <span>{ns.mandatoryBadge}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 text-[10.5px] font-bold rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                  {ns.configurableBadge}
                                </span>
                              )}

                              {isModified && (
                                <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-amber-400 text-[#092f63]">
                                  MODIFIED
                                </span>
                              )}
                            </div>

                            <p className="text-[12.5px] text-slate-600 max-w-xl leading-relaxed">
                              {pickLocalized(lang, policy.descriptionEn, policy.descriptionBn)}
                            </p>
                          </div>

                          {/* Middle: Master Enable Switch */}
                          <div className="flex items-center gap-4 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0">
                            <div className="flex items-center gap-2.5">
                              <span className="text-[12px] font-bold text-slate-500">Alert Status:</span>
                              <button
                                type="button"
                                disabled={policy.isMandatory}
                                onClick={() => handleTogglePolicy(policy.notificationType)}
                                title={policy.isMandatory ? ns.mandatoryTooltip : 'Toggle alert on or off'}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                  policy.isEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                                } ${policy.isMandatory ? 'opacity-80 cursor-not-allowed' : ''}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                                    policy.isEnabled ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                >
                                  {policy.isMandatory && <Lock className="w-2.5 h-2.5 text-amber-700" />}
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* Right: Recipient Toggles */}
                          <div className="flex items-center flex-wrap gap-2 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0">
                            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-50 border border-slate-200/80">
                              {RECIPIENT_ORDER.map((recType) => {
                                const rec = policy.recipients.find((r) => r.recipientType === recType);
                                const isEnabled = rec ? rec.isEnabled : false;
                                const isMandatory = rec ? rec.isMandatory : false;
                                const label = pickLocalized(lang, RECIPIENT_LABELS[recType].en, RECIPIENT_LABELS[recType].bn);
                                const IconComponent = RECIPIENT_LABELS[recType].icon;

                                return (
                                  <button
                                    key={recType}
                                    type="button"
                                    disabled={isMandatory || !policy.isEnabled}
                                    onClick={() => handleToggleRecipient(policy.notificationType, recType)}
                                    title={
                                      isMandatory
                                        ? ns.recipientMandatoryTooltip
                                        : !policy.isEnabled
                                        ? 'Alert is disabled'
                                        : `Toggle ${label}`
                                    }
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-bold transition-all ${
                                      isEnabled && policy.isEnabled
                                        ? 'bg-[#092f63] text-white shadow-xs'
                                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                                    } ${
                                      isMandatory
                                        ? 'ring-1 ring-amber-400/80 cursor-not-allowed'
                                        : ''
                                    } ${!policy.isEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                  >
                                    <IconComponent className="w-3.5 h-3.5 shrink-0" />
                                    <span>{label}</span>
                                    {isMandatory && <Lock className="w-2.5 h-2.5 text-amber-300 ml-0.5" />}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Channel config expander */}
                            <button
                              type="button"
                              onClick={() => setExpandedChannelsPolicyId(isExpanded ? null : policy.id)}
                              className={`p-1.5 rounded-lg border text-slate-500 hover:text-[#092f63] transition-colors ${
                                isExpanded ? 'bg-slate-100 border-slate-300 text-[#092f63]' : 'border-slate-200 hover:bg-slate-50'
                              }`}
                              title={ns.channelSettings}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Channel Configuration Panel */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[12.5px] font-bold text-[#092f63] flex items-center gap-1.5">
                                <Radio className="w-3.5 h-3.5 text-blue-600" />
                                <span>Delivery Channels per Recipient</span>
                              </h4>
                              <span className="text-[11.5px] text-slate-500">
                                Configure which channels are dispatched for each target
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              {RECIPIENT_ORDER.map((recType) => {
                                const rec = policy.recipients.find((r) => r.recipientType === recType);
                                const label = pickLocalized(lang, RECIPIENT_LABELS[recType].en, RECIPIENT_LABELS[recType].bn);

                                return (
                                  <div
                                    key={recType}
                                    className={`p-3 rounded-xl border bg-white ${
                                      rec?.isEnabled ? 'border-slate-200' : 'border-slate-100 opacity-60'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                      <span className="text-[12.5px] font-extrabold text-[#092f63] flex items-center gap-1">
                                        <span>{label}</span>
                                        {rec?.isMandatory && <Lock className="w-2.5 h-2.5 text-amber-600" />}
                                      </span>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                                        rec?.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                      }`}>
                                        {rec?.isEnabled ? 'RECEIVING' : 'OFF'}
                                      </span>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                      {(['IN_APP', 'SMS', 'WHATSAPP', 'EMAIL'] as NotificationDeliveryChannel[]).map((ch) => {
                                        const chObj = rec?.channels.find((c) => c.channel === ch);
                                        const isChEnabled = chObj ? chObj.isEnabled : false;
                                        const isConfigured =
                                          ch === 'IN_APP'
                                            ? true
                                            : ch === 'SMS'
                                            ? channelsConfigured.SMS
                                            : ch === 'WHATSAPP'
                                            ? channelsConfigured.WHATSAPP
                                            : channelsConfigured.EMAIL;

                                        return (
                                          <label
                                            key={ch}
                                            className="flex items-center justify-between gap-2 text-[12px] text-slate-600 cursor-pointer hover:text-slate-900"
                                          >
                                            <span className="flex items-center gap-1.5">
                                              <span>{CHANNEL_LABELS[ch]}</span>
                                              {!isConfigured && (
                                                <span className="text-[9.5px] text-slate-400 font-semibold">(unconfigured)</span>
                                              )}
                                            </span>
                                            <input
                                              type="checkbox"
                                              checked={isChEnabled}
                                              disabled={!rec?.isEnabled}
                                              onChange={() => handleToggleChannel(policy.notificationType, recType, ch)}
                                              className="w-3.5 h-3.5 accent-[#092f63] rounded"
                                            />
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Floating Save Actions Bar */}
          {modifiedPolicies.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#092f63] text-white px-5 py-3 rounded-2xl shadow-2xl shadow-[#092f63]/40 border border-blue-900 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[13px] font-bold">
                  {ns.unsavedChanges} ({modifiedPolicies.length})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetPolicies}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-xl text-[12px] font-bold bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                  {ns.discardChanges}
                </button>

                <button
                  type="button"
                  onClick={handleSavePolicies}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-xl text-[12.5px] font-black bg-amber-400 hover:bg-amber-300 text-[#092f63] shadow-md transition-all flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? ns.saving : ns.saveChanges}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PERSONAL IN-APP & USER NOTIFICATION PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="flex flex-col gap-5">
          <div className="card p-4.5 bg-white border-slate-200">
            <h3 className="font-bold text-[14px] text-[#092f63] mb-1">
              Personal Staff Notification Preferences
            </h3>
            <p className="text-[12.5px] text-slate-600 mb-4">
              Control your own personal in-app and delivery alert preferences for coaching activity.
            </p>

            <div className="overflow-x-auto">
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
                  {preferences?.map((row) => (
                    <tr key={row.category} className="trow">
                      <td style={{ textAlign: 'left' }} className="font-semibold text-[#092f63]">
                        {(t.notificationCategory as Record<string, string>)[row.category] || row.category}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.inApp}
                          onChange={() => {
                            setPreferences((prev) =>
                              prev ? prev.map((p) => (p.category === row.category ? { ...p, inApp: !p.inApp } : p)) : null
                            );
                          }}
                        />
                      </td>
                      <td>
                        {channelsConfigured.SMS ? (
                          <input
                            type="checkbox"
                            checked={row.sms}
                            onChange={() => {
                              setPreferences((prev) =>
                                prev ? prev.map((p) => (p.category === row.category ? { ...p, sms: !p.sms } : p)) : null
                              );
                            }}
                          />
                        ) : (
                          <span className="text-[11px] text-[#94a3b8]">{ns.notConfigured}</span>
                        )}
                      </td>
                      <td>
                        {channelsConfigured.WHATSAPP ? (
                          <input
                            type="checkbox"
                            checked={row.whatsapp}
                            onChange={() => {
                              setPreferences((prev) =>
                                prev ? prev.map((p) => (p.category === row.category ? { ...p, whatsapp: !p.whatsapp } : p)) : null
                              );
                            }}
                          />
                        ) : (
                          <span className="text-[11px] text-[#94a3b8]">{ns.notConfigured}</span>
                        )}
                      </td>
                      <td>
                        {channelsConfigured.EMAIL ? (
                          <input
                            type="checkbox"
                            checked={row.email}
                            onChange={() => {
                              setPreferences((prev) =>
                                prev ? prev.map((p) => (p.category === row.category ? { ...p, email: !p.email } : p)) : null
                              );
                            }}
                          />
                        ) : (
                          <span className="text-[11px] text-[#94a3b8]">{ns.notConfigured}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (!preferences) return;
                  setSaving(true);
                  try {
                    const res = await fetch('/api/settings/notifications', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ preferences }),
                    });
                    const d = await res.json();
                    if (res.ok && d.success) {
                      showToast(ns.saved);
                      if (d.preferences) setPreferences(d.preferences);
                    }
                  } finally {
                    setSaving(false);
                  }
                }}
                className="btn-navy px-4 py-2 text-[13px] font-bold"
              >
                {saving ? ns.saving : ns.saveChanges}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
