'use client';

import PageHeader from '@/components/PageHeader';
import MaterialForm from '@/components/MaterialForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function NewMaterialPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/materials" backLabel={t.materials.title} title={t.materials.createMaterial} subtitle={t.materials.subtitle} />
      <MaterialForm />
    </div>
  );
}
