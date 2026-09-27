'use client';

import React, { useState, useRef, useEffect } from 'react';
import { hasEnglish, stripEnglish } from '@/lib/format';

export interface BanglaInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: string;
  onChange: (value: string, e?: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  as?: 'input' | 'textarea';
  rows?: number;
  showWarning?: boolean;
  warningMessage?: string;
}

export default function BanglaInput({
  value = '',
  onChange,
  as = 'input',
  rows = 3,
  showWarning = true,
  warningMessage = 'বাংলায় লিখুন · English letters not allowed (শুধুমাত্র বাংলা বর্ণ গ্রহণযোগ্য)',
  className = '',
  placeholder,
  disabled,
  required,
  id,
  name,
  autoFocus,
  ...props
}: BanglaInputProps) {
  const [warn, setWarn] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerWarning = () => {
    if (!showWarning) return;
    setWarn(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setWarn(false);
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleBeforeInput = (e: any) => {
    const data = e.data || '';
    if (hasEnglish(data)) {
      e.preventDefault();
      triggerWarning();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const raw = e.target.value;
    if (hasEnglish(raw)) {
      triggerWarning();
      const cleaned = stripEnglish(raw);
      onChange(cleaned, e);
    } else {
      onChange(raw, e);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (hasEnglish(pasted)) {
      e.preventDefault();
      triggerWarning();
      const cleaned = stripEnglish(pasted);
      const target = e.currentTarget;
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const current = value || '';
      const nextVal = current.substring(0, start) + cleaned + current.substring(end);
      onChange(nextVal);
    }
  };

  const combinedClass = `transition-all ${className} ${
    warn ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/20' : ''
  }`;

  return (
    <div className="relative w-full">
      {as === 'textarea' ? (
        <textarea
          rows={rows}
          value={value}
          onChange={handleChange}
          onBeforeInput={handleBeforeInput}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          id={id}
          name={name}
          autoFocus={autoFocus}
          className={combinedClass}
          {...(props as any)}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onBeforeInput={handleBeforeInput}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          id={id}
          name={name}
          autoFocus={autoFocus}
          className={combinedClass}
          {...props}
        />
      )}

      {warn && (
        <div className="absolute left-0 -bottom-6 z-20 flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md shadow-xs animate-in fade-in duration-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
          <span>{warningMessage}</span>
        </div>
      )}
    </div>
  );
}
