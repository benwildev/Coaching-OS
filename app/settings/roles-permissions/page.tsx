'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import {
  CONFIGURABLE_ROLES,
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_GROUP_ORDER,
  PERMISSION_SECTIONS,
  type ConfigurableRole,
  type PermissionCode,
  type PermissionDefinition,
  type PermissionSectionKey,
} from '@/lib/auth/permissions';

type RoleTab = 'OWNER' | ConfigurableRole;
type Grants = Record<ConfigurableRole, Set<PermissionCode>>;

const emptyGrants = (): Grants => ({ ADMIN: new Set(), STAFF: new Set(), TEACHER: new Set() });

const ROLE_LABEL: Record<RoleTab, { en: string; bn: string; hintEn: string; hintBn: string }> = {
  OWNER: { en: 'Owner', bn: 'মালিক', hintEn: 'Unrestricted', hintBn: 'সীমাহীন' },
  ADMIN: { en: 'Admin', bn: 'অ্যাডমিন', hintEn: 'Configurable', hintBn: 'কনফিগারযোগ্য' },
  STAFF: { en: 'Staff', bn: 'স্টাফ', hintEn: 'Configurable', hintBn: 'কনফিগারযোগ্য' },
  TEACHER: { en: 'Teacher', bn: 'শিক্ষক', hintEn: 'Configurable', hintBn: 'কনফিগারযোগ্য' },
};

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export default function RolesPermissionsPage() {
  const { lang, currentUser, showToast } = useApp();
  const isBn = lang === 'bn';
  const t = (en: string, bn: string) => (isBn ? bn : en);

  const [saved, setSaved] = useState<Grants>(emptyGrants);
  const [drafts, setDrafts] = useState<Grants>(emptyGrants);
  const [defaults, setDefaults] = useState<Grants>(emptyGrants);
  const [role, setRole] = useState<RoleTab>('ADMIN');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const isOwner = currentUser?.role === 'OWNER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/roles-permissions');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to load');
      const toGrants = (src: Record<ConfigurableRole, PermissionCode[]>): Grants => ({
        ADMIN: new Set(src.ADMIN),
        STAFF: new Set(src.STAFF),
        TEACHER: new Set(src.TEACHER),
      });
      setSaved(toGrants(data.roles));
      setDrafts(toGrants(data.roles));
      setDefaults(toGrants(data.defaults));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isOwner) load();
  }, [isOwner, load]);

  const editable = role !== 'OWNER';
  const draft = editable ? drafts[role as ConfigurableRole] : null;
  const dirtyRoles = useMemo(
    () => CONFIGURABLE_ROLES.filter((r) => !sameSet(saved[r], drafts[r])),
    [saved, drafts]
  );
  const isDirty = editable && dirtyRoles.includes(role as ConfigurableRole);

  // Catalog filtered by search (code, module, action, label, section — EN and BN).
  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (p: PermissionDefinition) => {
      if (!q) return true;
      const sec = PERMISSION_SECTIONS[p.section];
      const grp = PERMISSION_GROUPS[p.group];
      return [p.code, p.module, p.action, p.label, p.bn, sec.label, sec.bn, grp.label, grp.bn]
        .join(' ')
        .toLowerCase()
        .includes(q);
    };
    return PERMISSION_GROUP_ORDER.map((g) => {
      const sections = (Object.keys(PERMISSION_SECTIONS) as PermissionSectionKey[])
        .filter((s) => PERMISSION_SECTIONS[s].group === g)
        .map((s) => ({ key: s, perms: PERMISSION_CATALOG.filter((p) => p.section === s && match(p)) }))
        .filter((s) => s.perms.length > 0);
      return { group: g, sections };
    }).filter((g) => g.sections.length > 0);
  }, [search]);

  const toggle = (code: PermissionCode, on: boolean) => {
    if (!editable) return;
    const r = role as ConfigurableRole;
    setDrafts((prev) => {
      const next = new Set(prev[r]);
      if (on) next.add(code);
      else next.delete(code);
      return { ...prev, [r]: next };
    });
  };

  const toggleMany = (perms: PermissionDefinition[], on: boolean) => {
    if (!editable) return;
    const r = role as ConfigurableRole;
    setDrafts((prev) => {
      const next = new Set(prev[r]);
      for (const p of perms) {
        if (p.ownerLocked) continue;
        if (on) next.add(p.code);
        else next.delete(p.code);
      }
      return { ...prev, [r]: next };
    });
  };

  const apply = (r: ConfigurableRole, granted: PermissionCode[]) => {
    const g = new Set(granted);
    setSaved((prev) => ({ ...prev, [r]: g }));
    setDrafts((prev) => ({ ...prev, [r]: new Set(g) }));
  };

  const handleSave = async () => {
    if (!editable || !draft) return;
    const r = role as ConfigurableRole;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/roles-permissions/${r}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: [...draft] }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Save failed');
      apply(r, data.granted);
      showToast(t('Permissions saved', 'অনুমতি সংরক্ষিত হয়েছে'));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!editable) return;
    const r = role as ConfigurableRole;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/roles-permissions/${r}/reset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Reset failed');
      apply(r, data.granted);
      setConfirmReset(false);
      showToast(t('Restored default permissions', 'ডিফল্ট অনুমতি পুনরুদ্ধার হয়েছে'));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  // ----- Guards (the API enforces OWNER-only independently) -----
  if (!currentUser) {
    return <div className="p-8 text-center text-sm text-[#64748b]">{t('Loading…', 'লোড হচ্ছে…')}</div>;
  }
  if (!isOwner) {
    return (
      <div className="max-w-[640px] mx-auto card p-8 text-center">
        <div className="text-rose-600 font-bold">
          {t('Only the Owner can manage roles and permissions.', 'শুধু মালিক ভূমিকা ও অনুমতি পরিচালনা করতে পারবেন।')}
        </div>
      </div>
    );
  }

  const total = PERMISSION_CATALOG.length;
  const lockedCount = PERMISSION_CATALOG.filter((p) => p.ownerLocked).length;
  const grantable = total - lockedCount;
  const defaultsForRole = editable ? defaults[role as ConfigurableRole] : null;

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4 pb-24">
      <PageHeader
        eyebrow={t('Settings', 'সেটিংস')}
        title={t('Roles & Permissions', 'ভূমিকা ও অনুমতি')}
        subtitle={t(
          'Choose what Admin, Staff and Teacher can do. The Owner is always unrestricted.',
          'অ্যাডমিন, স্টাফ ও শিক্ষক কী করতে পারবেন তা ঠিক করুন। মালিক সবসময় সীমাহীন।'
        )}
        backHref="/settings"
        backLabel={t('Settings', 'সেটিংস')}
      />

      {/* Role selector */}
      <div className="card p-3 flex flex-wrap gap-2" role="tablist" aria-label={t('Role', 'ভূমিকা')}>
        {(['OWNER', ...CONFIGURABLE_ROLES] as RoleTab[]).map((r) => {
          const active = role === r;
          const dirty = r !== 'OWNER' && dirtyRoles.includes(r as ConfigurableRole);
          const info = ROLE_LABEL[r];
          return (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setRole(r)}
              className={`flex-1 min-w-[120px] sm:flex-none sm:min-w-[150px] rounded-xl px-4 py-2.5 text-left transition-colors border ${
                active ? 'bg-[#063b78] text-white border-[#063b78] shadow-xs' : 'bg-white text-[#092f63] border-[#dce5f0] hover:bg-[#eef3fa]'
              }`}
            >
              <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
                {r === 'OWNER' && <Icon name="lock" size={13} />}
                {isBn ? info.bn : info.en}
                {dirty && <span className="w-2 h-2 rounded-full bg-amber-400" title={t('Unsaved changes', 'অসংরক্ষিত পরিবর্তন')} />}
              </span>
              <span className={`block text-[11px] ${active ? 'text-[#c7d4e6]' : 'text-[#64748b]'}`}>
                {isBn ? info.hintBn : info.hintEn}
              </span>
            </button>
          );
        })}
      </div>

      {role === 'OWNER' ? (
        <div className="card p-6 flex items-start gap-4">
          <span className="w-11 h-11 rounded-xl bg-[#eef3fa] text-[#063b78] flex items-center justify-center shrink-0">
            <Icon name="lock" size={20} />
          </span>
          <div className="min-w-0">
            <div className="text-base font-black text-[#092f63]">
              {t('Owner — Unrestricted', 'মালিক — সীমাহীন')}
              <span className="ml-2 align-middle text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                {t('Locked', 'লক করা')}
              </span>
            </div>
            <p className="text-[13px] text-[#64748b] mt-1">
              {t(
                'The Owner always has every permission. It cannot be restricted, edited or reset.',
                'মালিকের সব অনুমতি সবসময় থাকে। এটি সীমিত, সম্পাদনা বা রিসেট করা যায় না।'
              )}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="card p-3 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1 min-w-0">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search permissions…', 'অনুমতি খুঁজুন…')}
                aria-label={t('Search permissions', 'অনুমতি খুঁজুন')}
                className="w-full h-10 rounded-xl border border-[#dce5f0] bg-white px-3 text-sm text-[#092f63] outline-none focus:border-[#063b78]"
              />
            </div>
            <div className="text-xs font-semibold text-[#64748b] shrink-0">
              {draft?.size ?? 0} / {grantable} {t('granted', 'দেওয়া হয়েছে')}
            </div>
          </div>

          {loading ? (
            <div className="card p-8 text-center text-sm text-[#64748b]">{t('Loading…', 'লোড হচ্ছে…')}</div>
          ) : tree.length === 0 ? (
            <div className="card p-8 text-center text-sm text-[#64748b]">{t('No matching permissions.', 'কোনো মিল পাওয়া যায়নি।')}</div>
          ) : (
            tree.map(({ group, sections }) => (
              <section key={group} className="flex flex-col gap-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-[#64748b] px-1">
                  {isBn ? PERMISSION_GROUPS[group].bn : PERMISSION_GROUPS[group].label}
                </h2>
                {sections.map(({ key, perms }) => {
                  const sec = PERMISSION_SECTIONS[key];
                  const grantablePerms = perms.filter((p) => !p.ownerLocked);
                  const allOn = grantablePerms.length > 0 && grantablePerms.every((p) => draft?.has(p.code));
                  return (
                    <div key={key} className="card p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="text-[14px] font-bold text-[#092f63] min-w-0 break-words">{isBn ? sec.bn : sec.label}</h3>
                        {grantablePerms.length > 1 && (
                          <button
                            type="button"
                            onClick={() => toggleMany(perms, !allOn)}
                            className="text-xs font-bold text-[#063b78] hover:underline shrink-0"
                          >
                            {allOn ? t('Clear all', 'সব বাদ দিন') : t('Select all', 'সব নির্বাচন')}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                        {perms.map((p) => {
                          const checked = !p.ownerLocked && !!draft?.has(p.code);
                          const isDefault = !!defaultsForRole?.has(p.code);
                          return (
                            <label
                              key={p.code}
                              className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 min-w-0 ${
                                p.ownerLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-[#f8fafc]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 w-4 h-4 shrink-0 accent-[#063b78]"
                                checked={checked}
                                disabled={p.ownerLocked}
                                onChange={(e) => toggle(p.code, e.target.checked)}
                              />
                              <span className="min-w-0 text-[13px] text-[#092f63] break-words">
                                {isBn ? p.bn : p.label}
                                {p.ownerLocked && (
                                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 align-middle">
                                    <Icon name="lock" size={10} />
                                    {t('Owner only', 'শুধু মালিক')}
                                  </span>
                                )}
                                {!p.ownerLocked && checked !== isDefault && (
                                  <span className="ml-1.5 text-[10px] font-bold text-amber-700 align-middle">
                                    {t('differs from default', 'ডিফল্ট থেকে ভিন্ন')}
                                  </span>
                                )}
                                <span className="block text-[11px] text-[#94a3b8] font-mono break-all">{p.code}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            ))
          )}

          {/* Action bar */}
          <div className="sticky bottom-[76px] md:bottom-3 z-30">
            <div>
              <div className="card p-3 flex flex-wrap items-center justify-end gap-2 shadow-lg">
                {isDirty && (
                  <span className="mr-auto text-xs font-bold text-amber-700">{t('Unsaved changes', 'অসংরক্ষিত পরিবর্তন')}</span>
                )}
                <button type="button" className="tb" disabled={saving} onClick={() => setConfirmReset(true)}>
                  {t('Reset to Defaults', 'ডিফল্টে ফিরুন')}
                </button>
                <button
                  type="button"
                  className="btn-navy disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={saving || !isDirty}
                  onClick={handleSave}
                >
                  {saving ? t('Saving…', 'সংরক্ষণ হচ্ছে…') : t('Save Changes', 'পরিবর্তন সংরক্ষণ')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {confirmReset && editable && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-[440px] w-full p-6 shadow-xl border border-[#dce5f0]">
            <h2 className="text-base font-bold text-[#092f63] mb-1">
              {t(`Reset ${ROLE_LABEL[role].en} to defaults?`, `${ROLE_LABEL[role].bn} ডিফল্টে ফিরিয়ে নেবেন?`)}
            </h2>
            <p className="text-xs text-[#64748b] mb-5">
              {t(
                'This replaces all saved permissions for this role with the original baseline. Other roles and the Owner are not affected.',
                'এই ভূমিকার সব সংরক্ষিত অনুমতি মূল ডিফল্ট দিয়ে প্রতিস্থাপিত হবে। অন্য ভূমিকা ও মালিক প্রভাবিত হবে না।'
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="tb" disabled={saving} onClick={() => setConfirmReset(false)}>
                {t('Cancel', 'বাতিল')}
              </button>
              <button type="button" className="btn-navy disabled:opacity-50" disabled={saving} onClick={handleReset}>
                {saving ? t('Resetting…', 'রিসেট হচ্ছে…') : t('Reset', 'রিসেট')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
