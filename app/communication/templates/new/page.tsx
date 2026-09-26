'use client';

import PageHeader from '@/components/PageHeader';
import CommunicationTemplateForm from '@/components/CommunicationTemplateForm';
import CommunicationSubNav from '@/components/CommunicationSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function NewTemplatePage() {
  const { lang, currentUser } = useApp();
  const t = DICTIONARY[lang];
  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/communication/templates" backLabel={t.communication.templates} title={t.communication.newTemplate} subtitle={t.communication.subtitle} />
      <CommunicationSubNav />
      {canManage ? (
        <CommunicationTemplateForm />
      ) : (
        <div className="card p-6 text-[13.5px] text-rose-600">{t.common.accessDenied}</div>
      )}
    </div>
  );
}
