'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT } from '@/lib/i18n';
import { FEE_TYPES, FEE_FREQUENCIES } from '@/lib/validations/fee';
import EnglishInput from '@/components/EnglishInput';
import BanglaInput from '@/components/BanglaInput';
import { hasBangla, hasEnglish } from '@/lib/format';

interface FeeStructureItem {
  id: string;
  name: string;
  banglaName?: string | null;
  code?: string | null;
  feeType: string;
  amount: string | number;
  frequency: string;
  isActive: boolean;
  branch?: { id: string; name: string } | null;
  academicSession?: { id: string; name: string } | null;
  course?: { id: string; name: string; banglaName?: string | null } | null;
  _count: { feeAssignments: number };
}

export default function FeeStructuresPage() {
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [search, setSearch] = useState('');
  const [feeType, setFeeType] = useState('all');
  const [isActive, setIsActive] = useState('all');
  const [structures, setStructures] = useState<FeeStructureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FeeStructureItem | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (feeType !== 'all') q.set('feeType', feeType);
      if (isActive !== 'all') q.set('isActive', isActive);
      q.set('pageSize', '100');
      const res = await fetch(`/api/fees/structures?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStructures(data.structures || []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, feeType, isActive]);

  useEffect(() => {
    const t = setTimeout(fetchList, 250);
    return () => clearTimeout(t);
  }, [fetchList]);

  async function toggleActive(s: FeeStructureItem) {
    const res = await fetch(`/api/fees/structures/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    if (res.ok) {
      showToast(!s.isActive ? 'Fee structure activated' : 'Fee structure deactivated');
      fetchList();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to update status');
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.structuresTitle}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.fees.structuresSubtitle}</p>
        </div>
        <Link href="/fees/structures/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors">
          <Icon name="plus" size={17} />
          <span>{dict.fees.createStructure}</span>
        </Link>
      </div>

      <FeesSubNav />

      {/* Informative Guidance Banner */}
      <div className="p-4 md:p-5 rounded-2xl bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white border border-blue-100 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#063b78] text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5 sm:mt-0">
            <Icon name="wallet" size={20} />
          </div>
          <div>
            <h3 className="font-extrabold text-[#092f63] text-[15px]">{dict.fees.structureNoticeTitle}</h3>
            <p className="text-[13px] text-[#64748b] max-w-2xl mt-0.5 leading-relaxed">
              {dict.fees.structureNoticeDesc}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
          <Link
            href="/fees/invoices/new"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-blue-200 px-3.5 py-2 text-[12.5px] font-bold text-[#063b78] hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-2xs"
          >
            <Icon name="receipt" size={14} />
            <span>{dict.fees.createInvoice}</span>
          </Link>
        </div>
      </div>

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] max-w-lg focus-within:border-[#063b78] focus-within:bg-white transition-colors">
          <Icon name="search" size={17} className="text-[#64748b]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={dict.fees.search} className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <select value={feeType} onChange={(e) => setFeeType(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="all">{dict.fees.allTypes}</option>
            {FEE_TYPES.map((t) => (
              <option key={t} value={t}>{(dict.feeType as any)[t]}</option>
            ))}
          </select>
          <select value={isActive} onChange={(e) => setIsActive(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="all">{dict.fees.allStatuses}</option>
            <option value="true">{dict.fees.active}</option>
            <option value="false">{dict.fees.inactive}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : structures.length === 0 ? (
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
            <Icon name="wallet" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.fees.emptyStructuresTitle}</h2>
          <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">{dict.fees.emptyStructuresDesc}</p>
          <Link href="/fees/structures/new" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors">
            <Icon name="plus" size={17} />
            <span>{dict.fees.createStructure}</span>
          </Link>
        </div>
      ) : (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{dict.fees.name}</th>
                  <th>{dict.fees.feeType}</th>
                  <th>{dict.fees.amount}</th>
                  <th>{dict.fees.frequency}</th>
                  <th>{dict.fees.assignedCount}</th>
                  <th>{dict.fees.status}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {structures.map((s) => (
                  <tr key={s.id} className="trow">
                    <td className="text-left">
                      <div className="font-bold text-[#092f63]">{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</div>
                      <div className="text-[11px] text-[#8795ab]">
                        {[s.branch?.name, s.academicSession?.name, s.course?.name].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td>{(dict.feeType as any)[s.feeType] || s.feeType}</td>
                    <td className="font-mono font-bold text-[#092f63]">{formatBDT(s.amount, lang)}</td>
                    <td>{(dict.feeFrequency as any)[s.frequency] || s.frequency}</td>
                    <td>
                      <span className="font-medium text-[#092f63]">{s._count.feeAssignments}</span>
                      <span className="text-[11px] text-[#8795ab] ml-1">{lang === 'bn' ? 'শিক্ষার্থী' : 'students'}</span>
                    </td>
                    <td><StatusBadge status={s.isActive ? 'ACTIVE' : 'INACTIVE'} size="sm" /></td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/fees/invoices/new?structureId=${s.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-[#063b78] hover:bg-blue-100 font-bold text-[12px] border border-blue-200 transition-colors"
                          title={dict.fees.createInvoiceForStructure}
                        >
                          <Icon name="receipt" size={13} />
                          <span>{dict.fees.createInvoiceForStructure}</span>
                        </Link>
                        <button className="tb" onClick={() => setEditing(s)}>{dict.actions.edit}</button>
                        <button className="tb" onClick={() => toggleActive(s)}>
                          {s.isActive ? dict.fees.inactive : dict.fees.active}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <EditStructureModal
          structure={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            fetchList();
          }}
        />
      )}
    </div>
  );
}

function EditStructureModal({
  structure,
  onClose,
  onSaved,
}: {
  structure: FeeStructureItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const [name, setName] = useState(structure.name);
  const [banglaName, setBanglaName] = useState(structure.banglaName || '');
  const [amount, setAmount] = useState(String(structure.amount));
  const [feeType, setFeeType] = useState(structure.feeType);
  const [frequency, setFrequency] = useState(structure.frequency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (hasBangla(name)) {
      setError(lang === 'bn' ? 'ফি কাঠামোর নাম ইংরেজিতে লিখুন' : 'Fee structure name must be in English');
      return;
    }
    if (banglaName && hasEnglish(banglaName)) {
      setError(lang === 'bn' ? 'ফি কাঠামোর বাংলা নাম শুধুমাত্র বাংলায় লিখুন' : 'Fee structure Bangla name must not contain English characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/fees/structures/${structure.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          banglaName: banglaName || undefined,
          amount: Number(amount),
          feeType,
          frequency,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      showToast('Fee structure updated');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg rounded-2xl bg-white p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#063b78]">{dict.fees.editStructure}</h2>
          <button className="ibtn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-3 py-2">{error}</div>}
        <div className="fld">
          <label>{dict.fees.name} *</label>
          <EnglishInput required value={name} onChange={(val) => setName(val)} placeholder={dict.fees.namePlaceholder} />
        </div>
        <div className="fld">
          <label>
            {dict.fees.banglaName} <span className="text-[11.5px] font-normal text-[#64748b]">({lang === 'bn' ? 'ঐচ্ছিক' : 'Optional'})</span>
          </label>
          <BanglaInput value={banglaName} onChange={(val) => setBanglaName(val)} placeholder={dict.fees.banglaNamePlaceholder} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="fld">
            <label>{dict.fees.feeType}</label>
            <select value={feeType} onChange={(e) => setFeeType(e.target.value)}>
              {FEE_TYPES.map((t) => (
                <option key={t} value={t}>{(dict.feeType as any)[t]}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.fees.frequency}</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {FEE_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{(dict.feeFrequency as any)[f]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="fld">
          <label>{dict.fees.amount}</label>
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="tb" onClick={onClose}>{dict.actions.cancel}</button>
          <button className="primary" disabled={saving} onClick={save}>
            {saving ? '…' : dict.actions.save}
          </button>
        </div>
      </div>
    </div>
  );
}
