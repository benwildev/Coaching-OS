'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { FEE_TYPES, FEE_FREQUENCIES } from '@/lib/validations/fee';

interface Options {
  branches: Array<{ id: string; name: string; banglaName?: string | null }>;
  sessions: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string; banglaName?: string | null }>;
  courses: Array<{ id: string; name: string; banglaName?: string | null }>;
}

export default function NewFeeStructurePage() {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [options, setOptions] = useState<Options | null>(null);
  const [name, setName] = useState('');
  const [banglaName, setBanglaName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [feeType, setFeeType] = useState<string>('MONTHLY');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<string>('MONTHLY');
  const [dueDay, setDueDay] = useState('10');
  const [lateFee, setLateFee] = useState('0');
  const [branchId, setBranchId] = useState('');
  const [academicSessionId, setAcademicSessionId] = useState('');
  const [academicClassId, setAcademicClassId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadOptions = useCallback(async () => {
    const res = await fetch('/api/fees/options');
    if (res.ok) setOptions(await res.json());
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/fees/structures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          banglaName: banglaName || undefined,
          code: code || undefined,
          description: description || undefined,
          feeType,
          amount: Number(amount),
          frequency,
          dueDay: Number(dueDay),
          lateFee: Number(lateFee || 0),
          branchId: branchId || undefined,
          academicSessionId: academicSessionId || undefined,
          academicClassId: academicClassId || undefined,
          courseId: courseId || undefined,
          isActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create fee structure');
        return;
      }
      showToast('Fee structure created');
      router.push('/fees/structures');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-6">
      <Link href="/fees/structures" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline w-fit">
        <Icon name="chevleft" size={16} />
        <span>{dict.fees.tabStructures}</span>
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.createStructure}</h1>
      </div>

      <form onSubmit={submit} className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-3 py-2">{error}</div>}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="fld">
            <label>{dict.fees.name}</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="fld">
            <label>{dict.fees.banglaName}</label>
            <input value={banglaName} onChange={(e) => setBanglaName(e.target.value)} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="fld">
            <label>{dict.fees.feeType}</label>
            <select value={feeType} onChange={(e) => setFeeType(e.target.value)}>
              {FEE_TYPES.map((t) => (
                <option key={t} value={t}>{(dict.feeType as any)[t]}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.fees.code}</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="fld">
            <label>{dict.fees.amount}</label>
            <input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="fld">
            <label>{dict.fees.frequency}</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {FEE_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{(dict.feeFrequency as any)[f]}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.fees.dueDay}</label>
            <input type="number" min="1" max="28" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
          </div>
        </div>

        <div className="fld">
          <label>{dict.fees.lateFee}</label>
          <input type="number" min="0" step="0.01" value={lateFee} onChange={(e) => setLateFee(e.target.value)} className="max-w-[220px]" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="fld">
            <label>{dict.fees.branch}</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">{dict.fees.allBranches}</option>
              {options?.branches.map((b) => (
                <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.fees.session}</label>
            <select value={academicSessionId} onChange={(e) => setAcademicSessionId(e.target.value)}>
              <option value="">—</option>
              {options?.sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="fld">
            <label>{dict.fees.class}</label>
            <select value={academicClassId} onChange={(e) => setAcademicClassId(e.target.value)}>
              <option value="">—</option>
              {options?.classes.map((c) => (
                <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.fees.course}</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">—</option>
              {options?.courses.map((c) => (
                <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="fld">
          <label>{dict.fees.description}</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/fees/structures" className="tb">{dict.actions.cancel}</Link>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? '…' : dict.fees.save}
          </button>
        </div>
      </form>
    </div>
  );
}
