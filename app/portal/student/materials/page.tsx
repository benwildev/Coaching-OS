'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Icon from '@/components/Icon';
import FilterSelect from '@/components/FilterSelect';
import PageHeader, { EmptyState, Pager } from '@/components/PageHeader';
import { MATERIAL_TYPE_ICON } from '@/components/QuestionBadges';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';
import { MATERIAL_TYPES } from '@/lib/validations/study-material';

interface PortalMaterial {
  id: string;
  title: string;
  banglaTitle: string | null;
  description: string | null;
  banglaDescription: string | null;
  type: string;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  subject: { id: string; name: string; banglaName: string | null; code: string };
  subjectPaper: { name: string; banglaName: string | null } | null;
}

function PortalMaterialsContent() {
  const studentId = useSearchParams().get('studentId') || '';
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const pm = t.portalMaterials;
  const c = t.common;
  const num = (n: number) => localizeNumber(lang, n);

  const [materials, setMaterials] = useState<PortalMaterial[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; banglaName: string | null }>>([]);
  const [student, setStudent] = useState<{ name: string; banglaName: string | null; studentIdCode: string } | null>(null);
  const [loading, setLoading] = useState(!!studentId);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('');

  useEffect(() => {
    const h = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams({ studentId, page: String(page) });
    if (search) sp.set('search', search);
    if (subject) sp.set('subject', subject);
    if (type) sp.set('type', type);
    fetch(`/api/portal/student/materials?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) return setError(d.message || c.loadFailed);
        setMaterials(d.materials);
        setSubjects(d.subjects);
        setStudent(d.student);
        setPagination({ total: d.pagination.total, totalPages: d.pagination.totalPages });
      })
      .catch(() => !cancelled && setError(c.loadFailed))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId, page, search, subject, type, c.loadFailed]);

  const subtitle = student
    ? `${pickLocalized(lang, student.name, student.banglaName)} · ${student.studentIdCode}`
    : pm.subtitle;

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <PageHeader eyebrow={t.nav.materials} title={pm.title} subtitle={subtitle} />

      {!studentId ? (
        <div className="card"><EmptyState message={pm.noStudent} icon="user" /></div>
      ) : (
        <>
          <div className="card p-4 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3 items-end">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.materials.searchPlaceholder}
              aria-label={c.search}
              className="h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]"
            />
            <FilterSelect label={c.subject} value={subject} anyLabel={c.all} onChange={(v) => { setSubject(v); setPage(1); }}
              items={subjects.map((s) => ({ value: s.id, label: pickLocalized(lang, s.name, s.banglaName) }))} />
            <FilterSelect label={t.materials.type} value={type} anyLabel={c.all} onChange={(v) => { setType(v); setPage(1); }}
              items={MATERIAL_TYPES.map((v) => ({ value: v, label: (t.materialType as Record<string, string>)[v] }))} />
          </div>

          <div className="card overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
            ) : error ? (
              <div className="py-16 text-center text-[13px] text-rose-600">{error}</div>
            ) : materials.length === 0 ? (
              <EmptyState message={search || subject || type ? t.materials.noMatch : pm.empty} icon="book" />
            ) : (
              <>
                <ul className="divide-y divide-[#edf1f7]">
                  {materials.map((mat) => {
                    const desc = pickLocalized(lang, mat.description, mat.banglaDescription);
                    return (
                      <li key={mat.id} className="flex items-start gap-3 p-4">
                        <span className="w-10 h-10 shrink-0 rounded-xl bg-[#eef4fb] text-[#063b78] flex items-center justify-center">
                          <Icon name={MATERIAL_TYPE_ICON[mat.type] || 'file'} size={18} />
                        </span>
                        <div className="min-w-0 grow">
                          <div className="font-bold text-[#092f63]">{pickLocalized(lang, mat.title, mat.banglaTitle)}</div>
                          <div className="text-[12px] text-[#64748b]">
                            {[
                              pickLocalized(lang, mat.subject.name, mat.subject.banglaName),
                              mat.subjectPaper && pickLocalized(lang, mat.subjectPaper.name, mat.subjectPaper.banglaName),
                              (t.materialType as Record<string, string>)[mat.type] || mat.type,
                              mat.publishedAt && localizeNumber(lang, formatDhakaDate(mat.publishedAt)),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                          {desc && (
                            <p className={`text-[13px] text-[#092f63] mt-1.5 whitespace-pre-wrap ${mat.type === 'NOTE' ? '' : 'line-clamp-2'}`}>
                              {desc}
                            </p>
                          )}
                        </div>
                        {mat.fileUrl && (
                          <a href={mat.fileUrl} target="_blank" rel="noopener noreferrer" className="tb shrink-0">
                            <Icon name={mat.type === 'PDF' || mat.type === 'DOCUMENT' ? 'download' : 'globe'} size={15} />
                            {pm.open}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <Pager page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={setPage} labels={c} formatNumber={num} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function PortalMaterialsPage() {
  return (
    <Suspense fallback={null}>
      <PortalMaterialsContent />
    </Suspense>
  );
}
