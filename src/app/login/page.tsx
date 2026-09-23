'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Mail, KeyRound, ArrowRight, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function sendOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to send OTP'); return; }
      toast.success('OTP sent to your email!');
      setStep('otp');
      startResendCooldown();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Invalid OTP'); return; }
      toast.success('Signed in successfully!');
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = (next && next.startsWith('/')) ? next : '/dashboard';
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function startResendCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function resendOTP() {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to resend'); return; }
      toast.success('New OTP sent!');
      startResendCooldown();
    } catch {
      toast.error('Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-dvh overflow-y-auto bg-[#050505] flex items-center justify-center p-4 relative">
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{
          backgroundImage: 'linear-gradient(#FF9900 1px, transparent 1px), linear-gradient(90deg, #FF9900 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="w-full max-w-md relative animate-fadeIn">
        {/* Card */}
        <div className="bg-[#0a0a0a] border-2 border-[#FF9900] overflow-hidden"
          style={{ boxShadow: '6px 6px 0 0 #FF9900' }}>

          {/* Top bar */}
          <div className="h-1 bg-[#FF9900]" />

          {/* Header */}
          <div className="p-8 pt-7 border-b-2 border-[#2d2d2d] text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#111] border-2 border-[#2d2d2d] mb-4 overflow-hidden">
              <Image src="/logo.png" alt="AWSSBG" width={44} height={44} className="object-contain" />
            </div>
            <h1 className="text-xl font-bold text-[#f0f0f0] uppercase tracking-widest animate-glitch">
              Console
            </h1>
            <p className="text-[#FF9900] text-xs font-mono uppercase tracking-widest mt-1">
              AWS Student Builder Group at SRMIST
            </p>
          </div>

          {/* Form */}
          <div className="p-8">
            {step === 'email' ? (
              <form onSubmit={sendOTP} className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#f0f0f0] uppercase tracking-wide">
                    SIGN IN<span className="animate-blink text-[#FF9900]">_</span>
                  </h2>
                  <p className="text-[#666] text-sm mt-1">Enter your official email to continue</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Official Email</Label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@srmist.edu.in"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-9"
                      autoComplete="email"
                      required
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-[#555]">Use your registered SRM email only</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> SENDING OTP...</>
                    : <>SEND OTP <ArrowRight size={16} /></>
                  }
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyOTP} className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#f0f0f0] uppercase tracking-wide">
                    ENTER OTP<span className="animate-blink text-[#FF9900]">_</span>
                  </h2>
                  <p className="text-[#666] text-sm mt-1">
                    Sent to <span className="text-[#d0d0d0] font-bold">{email}</span>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otp">6-Digit Code</Label>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="pl-9 text-center text-2xl font-mono tracking-[0.5em]"
                      autoComplete="one-time-code"
                      required
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-[#555]">Expires in 5 minutes</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> VERIFYING...</>
                    : <>SIGN IN <ArrowRight size={16} /></>
                  }
                </Button>
                <div className="flex items-center justify-between text-sm font-mono">
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setOtp(''); }}
                    className="text-[#666] hover:text-[#f0f0f0] transition-colors"
                  >
                    ← BACK
                  </button>
                  <button
                    type="button"
                    onClick={resendOTP}
                    disabled={resendCooldown > 0 || loading}
                    className="text-[#FF9900] hover:text-orange-300 disabled:text-[#555] disabled:cursor-not-allowed transition-colors"
                  >
                    {resendCooldown > 0 ? `RESEND IN ${resendCooldown}s` : 'RESEND OTP'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[#444] text-xs mt-4 font-mono uppercase tracking-widest">
          Internal use only · AWS Student Builder Group at SRMIST
        </p>
      </div>
    </div>
  );
}
