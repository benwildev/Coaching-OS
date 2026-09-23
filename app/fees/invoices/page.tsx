'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT, formatDhakaDate } from '@/lib/i18n';
import { INVOICE_STATUSES } from '@/lib/validations/invoice';

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: string | number;
  paidAmount: string | number;
  dueAmount: string | number;
  status: string;
  student: { id: string; name: string; studentIdCode: string; phone?: string | null };
  branch?: { id: string; name: string } | null;
}

export default function InvoicesPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (status !== 'all') q.set('status', status);
      q.set('pageSize', '100');
      const res = await fetch(`/api/fees/invoices?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(fetchList, 250);
    return () => clearTimeout(t);
  }, [fetchList]);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.invoicesTitle}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.fees.invoicesSubtitle}</p>
        </div>
        <Link href="/fees/invoices/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors">
          <Icon name="plus" size={17} />
          <span>{dict.fees.createInvoice}</span>
        </Link>
      </div>

      <FeesSubNav />

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] max-w-lg focus-within:border-[#063b78] focus-within:bg-white transition-colors">
          <Icon name="search" size={17} className="text-[#64748b]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={dict.fees.searchInvoices} className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="chip" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>{dict.fees.allStatuses}</button>
          {INVOICE_STATUSES.map((s) => (
            <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{(dict.invoiceStatus as any)[s]}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
            <Icon name="file" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.fees.emptyInvoicesTitle}</h2>
          <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">{dict.fees.emptyInvoicesDesc}</p>
        </div>
      ) : (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{dict.fees.invoiceNumber}</th>
                  <th>{dict.fees.student}</th>
                  <th>{dict.fees.date}</th>
                  <th>{dict.fees.dueDate}</th>
                  <th>{dict.fees.total}</th>
                  <th>{dict.fees.paid}</th>
                  <th>{dict.fees.due}</th>
                  <th>{dict.fees.status}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="trow">
                    <td className="text-left">
                      <Link href={`/fees/invoices/${inv.id}`} className="font-mono font-bold text-[#063b78] hover:underline">{inv.invoiceNumber}</Link>
                    </td>
                    <td className="text-left">
                      <div className="font-semibold text-[#092f63]">{inv.student.name}</div>
                      <div className="text-[11px] text-[#8795ab]">{inv.student.studentIdCode}</div>
                    </td>
                    <td>{formatDhakaDate(inv.invoiceDate)}</td>
                    <td>{inv.dueDate ? formatDhakaDate(inv.dueDate) : '—'}</td>
                    <td className="font-mono">{formatBDT(inv.totalAmount, lang)}</td>
                    <td className="font-mono text-emerald-700">{formatBDT(inv.paidAmount, lang)}</td>
                    <td className="font-mono text-rose-700">{formatBDT(inv.dueAmount, lang)}</td>
                    <td><StatusBadge status={inv.status} size="sm" dictKey="invoiceStatus" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
