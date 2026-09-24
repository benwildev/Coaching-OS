'use client';

import { use, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import MaterialForm, { type MaterialFormInitial } from '@/components/MaterialForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function EditMaterialPage({ params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = use(params);
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const [material, setMaterial] = useState<(MaterialFormInitial & { canModify: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/materials/${materialId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setMaterial(d.material) : setError(d.message || d.error)))
      .catch(() => setError(t.common.loadFailed));
  }, [materialId, t.common.loadFailed]);

  const blocked = material && (!material.canModify || material.status === 'ARCHIVED');

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader backHref={`/materials/${materialId}`} backLabel={t.common.back} title={t.materials.editMaterial} />
      {error && <div className="card p-6 text-rose-600 text-[13.5px]">{error}</div>}
      {!material && !error && <div className="card p-10 text-center text-[#64748b] text-[13px]">{t.common.loading}</div>}
      {blocked && <div className="card p-6 text-[13.5px] text-[#092f63]">{t.materials.readOnly}</div>}
      {material && !blocked && <MaterialForm initial={material} />}
    </div>
  );
}
