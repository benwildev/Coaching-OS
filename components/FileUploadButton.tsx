'use client';

import { useRef, useState } from 'react';

export type UploadScope = 'logo' | 'favicon' | 'photo' | 'thumbnail' | 'material' | 'homework' | 'homeworkSubmission';

const DEFAULT_ACCEPT: Record<UploadScope, string> = {
  logo: 'image/png,image/jpeg,image/webp,image/gif',
  favicon: 'image/png,image/jpeg,image/webp,image/gif',
  photo: 'image/png,image/jpeg,image/webp,image/gif',
  thumbnail: 'image/png,image/jpeg,image/webp,image/gif',
  material: 'image/png,image/jpeg,image/webp,image/gif,.pdf,.doc,.docx,.ppt,.pptx,video/mp4,video/webm',
  homework: 'image/png,image/jpeg,image/webp,image/gif,.pdf,.doc,.docx,.ppt,.pptx',
  homeworkSubmission: 'image/png,image/jpeg,image/webp,image/gif,.pdf,.doc,.docx',
};

/**
 * Small reusable widget backing every upload point in the app. Sits next to
 * (not instead of) the existing URL field it fills, so it composes with
 * both react-hook-form `register`/`setValue` and plain useState forms
 * without restructuring their field wiring.
 */
export default function FileUploadButton({
  scope,
  onUploaded,
  lang = 'en',
  accept,
  className = '',
  disabled = false,
}: {
  scope: UploadScope;
  onUploaded: (url: string) => void;
  lang?: 'en' | 'bn';
  accept?: string;
  className?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('scope', scope);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || (lang === 'bn' ? 'আপলোড ব্যর্থ হয়েছে' : 'Upload failed'));
      }
      onUploaded(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'bn' ? 'আপলোড ব্যর্থ হয়েছে' : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className={`inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#063b78] border border-[#dce5f0] rounded-lg px-3 py-1.5 bg-white hover:border-[#063b78] disabled:opacity-50 ${className}`}
      >
        {uploading ? (lang === 'bn' ? 'আপলোড হচ্ছে…' : 'Uploading…') : lang === 'bn' ? 'ফাইল আপলোড করুন' : 'Upload file'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? DEFAULT_ACCEPT[scope]}
        onChange={handleChange}
        className="hidden"
      />
      {error && <span className="text-[11.5px] text-rose-600">{error}</span>}
    </div>
  );
}
