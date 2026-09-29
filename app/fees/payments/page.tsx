'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import FilterSelect from '@/components/FilterSelect';
import { EmptyState, Pager } from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT, formatDhakaDate, localizeNumber } from '@/lib/i18n';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@/lib/validations/payment';

interface PaymentRow {
  id: string;
  receiptNumber: string;
  amount: string | number;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  transactionId: string | null;
  referenceNumber: string | null;
  student: { id: string; name: string; studentIdCode: string };
  guardian: { id: string; name: string; phone: string } | null;
  invoice: { id: string; invoiceNumber: string };
  collectedBy?: { id: string; name: string } | null;
}

interface BranchOption {
  id: string;
  name: string;
  banglaName: string | null;
}

interface CollectorOption {
  id: string;
  name: string;
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063B78] border-t-transparent" />
        </div>
      }
    >
      <PaymentsPageContent />
    </Suspense>
  );
}

function PaymentsPageContent() {
  const { lang, currentUser } = useApp();
  const dict = DICTIONARY[lang];
  const c = dict.common;
  const num = (x: number) => localizeNumber(lang, x);
  const canPickBranch = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const searchParams = useSearchParams();

  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [branchId, setBranchId] = useState(searchParams.get('branch') || '');
  const [collectorId, setCollectorId] = useState('');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [collectors, setCollectors] = useState<CollectorOption[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (canPickBranch) {
      fetch('/api/fees/options').then((r) => r.json()).then((d) => d.success && setBranches(d.branches || [])).catch(() => {});
    }
  }, [canPickBranch]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (branchId) sp.set('branch', branchId);
    fetch(`/api/fees/collectors?${sp}`).then((r) => r.json()).then((d) => d.success && setCollectors(d.collectors || [])).catch(() => {});
  }, [branchId]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (method) q.set('method', method);
      if (status) q.set('status', status);
      if (branchId) q.set('branch', branchId);
      if (collectorId) q.set('collector', collectorId);
      if (dateFrom) q.set('dateFrom', dateFrom);
      if (dateTo) q.set('dateTo', dateTo);
      q.set('page', String(page));
      q.set('pageSize', '20');
      const res = await fetch(`/api/fees/payments?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
        setPagination({ total: data.total, totalPages: data.totalPages });
      }
    } finally {
      setLoading(false);
    }
  }, [search, method, status, branchId, collectorId, dateFrom, dateTo, page]);

  useEffect(() => {
    const t = setTimeout(fetchList, 250);
    return () => clearTimeout(t);
  }, [fetchList]);

  const hasFilters = !!search || !!method || !!status || !!branchId || !!collectorId || !!dateFrom || !!dateTo;

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.paymentsTitle}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.fees.paymentsSubtitle}</p>
      </div>

      <FeesSubNav />

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] max-w-lg focus-within:border-[#063b78] focus-within:bg-white transition-colors">
          <Icon name="search" size={17} className="text-[#64748b]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={dict.fees.searchPayments}
            className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <FilterSelect
            label={dict.fees.method}
            value={method}
            anyLabel={dict.fees.allTypes}
            onChange={(v) => { setMethod(v); setPage(1); }}
            items={PAYMENT_METHODS.map((m) => ({ value: m, label: (dict.paymentMethod as Record<string, string>)[m] }))}
          />
          <FilterSelect
            label={c.status}
            value={status}
            anyLabel={dict.fees.allStatuses}
            onChange={(v) => { setStatus(v); setPage(1); }}
            items={PAYMENT_STATUSES.map((s) => ({ value: s, label: (dict.paymentStatus as Record<string, string>)[s] }))}
          />
          {canPickBranch && (
            <FilterSelect
              label={dict.fees.branch}
              value={branchId}
              anyLabel={dict.fees.allBranches}
              onChange={(v) => { setBranchId(v); setPage(1); }}
              items={branches.map((b) => ({ value: b.id, label: lang === 'bn' && b.banglaName ? b.banglaName : b.name }))}
            />
          )}
          <FilterSelect
            label={dict.fees.collectorFilter}
            value={collectorId}
            anyLabel={dict.fees.allCollectors}
            onChange={(v) => { setCollectorId(v); setPage(1); }}
            items={collectors.map((u) => ({ value: u.id, label: u.name }))}
          />
          <label className="flex flex-col gap-1 min-w-0">
            <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide truncate">{dict.fees.dateFrom}</span>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#dce5f0] bg-white px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 min-w-0">
            <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide truncate">{dict.fees.dateTo}</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#dce5f0] bg-white px-2 text-[13px]" />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : payments.length === 0 ? (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          {hasFilters ? (
            <EmptyState message={dict.fees.emptyPaymentsDesc} icon="search" />
          ) : (
            <div className="p-12 md:p-16 text-center flex flex-col items-center">
              <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
                <Icon name="banknote" size={32} />
              </div>
              <h2 className="text-xl font-bold text-[#063b78]">{dict.fees.emptyPaymentsTitle}</h2>
              <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">{dict.fees.emptyPaymentsDesc}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{dict.fees.receiptNumber}</th>
                  <th>{dict.fees.invoiceNumber}</th>
                  <th>{dict.fees.student}</th>
                  <th>{dict.fees.guardian}</th>
                  <th>{dict.fees.amount}</th>
                  <th>{dict.fees.method}</th>
                  <th>{dict.fees.transactionId}</th>
                  <th>{dict.fees.date}</th>
                  <th>{dict.fees.collectedBy}</th>
                  <th>{dict.fees.status}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="trow">
                    <td className="text-left"><Link href={`/fees/payments/${p.id}`} className="font-mono font-bold text-[#063b78] hover:underline">{p.receiptNumber}</Link></td>
                    <td className="font-mono">{p.invoice.invoiceNumber}</td>
                    <td className="text-left">
                      <div className="font-semibold text-[#092f63]">{p.student.name}</div>
                      <div className="text-[11px] text-[#8795ab]">{p.student.studentIdCode}</div>
                    </td>
                    <td className="text-left text-[#64748b]">{p.guardian?.name || c.none}</td>
                    <td className="font-mono font-bold">{formatBDT(p.amount, lang)}</td>
                    <td>{(dict.paymentMethod as Record<string, string>)[p.paymentMethod]}</td>
                    <td className="font-mono text-[11.5px] text-[#64748b]">{p.transactionId || p.referenceNumber || c.none}</td>
                    <td>{formatDhakaDate(p.paymentDate)}</td>
                    <td>{p.collectedBy?.name || c.none}</td>
                    <td><StatusBadge status={p.status} size="sm" dictKey="paymentStatus" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={setPage} labels={c} formatNumber={num} />
        </div>
      )}
    </div>
  );
}
