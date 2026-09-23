'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { DATA } from '@/lib/data';
import { useApp } from '@/lib/store';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { showToast } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');

  const sendOtp = () => {
    if (phone.replace(/\D/g, '').length < 11) { setErr('Enter a valid mobile number.'); return; }
    setErr('');
    setOtpSent(true);
    showToast('Demo OTP sent: 123456');
  };
  const verify = () => {
    if (otp !== '123456') { setErr('Incorrect code. Try 123456 for this demo.'); return; }
    showToast('Signed in');
    router.push('/');
  };
  const passwordLogin = () => {
    if (!email || pass.length < 4) { setErr('Enter your email and password.'); return; }
    showToast('Signed in');
    router.push('/');
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm card p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <span className="w-10 h-10 rounded-xl bg-[#ffd500] text-[#00296b] flex items-center justify-center font-extrabold dsp">A</span>
          <div>
            <div className="dsp font-bold text-[#00296b]">{DATA.org.short}</div>
            <div className="text-[11px] text-[#55637a]">{DATA.org.campus}</div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-5">
          <button className="chip" aria-pressed={mode === 'otp'} onClick={() => { setMode('otp'); setErr(''); }}>Mobile + OTP</button>
          <button className="chip" aria-pressed={mode === 'password'} onClick={() => { setMode('password'); setErr(''); }}>Email + password</button>
        </div>

        {mode === 'otp' ? (
          <div className="flex flex-col gap-3">
            {!otpSent ? (
              <>
                <div className="fld">
                  <label>Mobile number</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
                </div>
                {err && <div className="err"><Icon name="alert" size={14} />{err}</div>}
                <button className="primary justify-center" onClick={sendOtp}>Send code</button>
              </>
            ) : (
              <>
                <div className="fld">
                  <label>Enter the 6-digit code</label>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" maxLength={6} />
                </div>
                {err && <div className="err"><Icon name="alert" size={14} />{err}</div>}
                <button className="primary justify-center" onClick={verify}>Verify & sign in</button>
                <button className="text-[12.5px] text-[#55637a] hover:underline" onClick={() => setOtpSent(false)}>Change number</button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="fld">
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@alokito.example" />
            </div>
            <div className="fld">
              <label>Password</label>
              <div className="relative">
                <input value={pass} onChange={(e) => setPass(e.target.value)} type={show ? 'text' : 'password'} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55637a]" onClick={() => setShow(!show)}>
                  <Icon name={show ? 'eyeoff' : 'eye'} size={16} />
                </button>
              </div>
            </div>
            {err && <div className="err"><Icon name="alert" size={14} />{err}</div>}
            <button className="primary justify-center" onClick={passwordLogin}>Sign in</button>
            <button className="text-[12.5px] text-[#55637a] hover:underline" onClick={() => showToast('Password reset link sent (demo)')}>Forgot password?</button>
          </div>
        )}

        <div className="text-[11px] text-[#8795ab] mt-5 text-center">Demo only — any 6-digit code works if you type 123456.</div>
      </div>
    </div>
  );
}
