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
      if (!res.ok) {
        toast.error(data.error || 'Failed to send OTP');
        return;
      }
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
      if (!res.ok) {
        toast.error(data.error || 'Invalid OTP');
        return;
      }
      toast.success('Signed in successfully!');
      window.location.href = '/dashboard';
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Card */}
        <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-800 p-8 text-center border-b border-slate-700">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700 mb-4 overflow-hidden">
              <Image src="/logo.png" alt="AWSSBG" width={48} height={48} className="object-contain" />
            </div>
            <h1 className="text-xl font-bold text-white">Internal Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">@AWSSBG · SRMIST</p>
          </div>

          {/* Form */}
          <div className="p-8">
            {step === 'email' ? (
              <form onSubmit={sendOTP} className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">Welcome back</h2>
                  <p className="text-slate-400 text-sm mt-1">Enter your official email to sign in</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Official Email Address</Label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@srmist.edu.in"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-9"
                      required
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-slate-500">Use your registered SRM email only</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> Sending OTP...</>
                  ) : (
                    <>Send OTP <ArrowRight size={16} /></>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyOTP} className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">Enter OTP</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    We sent a 6-digit code to <span className="font-medium text-slate-300">{email}</span>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otp">One-Time Password</Label>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="pl-9 text-center text-xl font-mono tracking-widest"
                      required
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-slate-500">OTP expires in 5 minutes</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                  ) : (
                    <>Sign In <ArrowRight size={16} /></>
                  )}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setOtp(''); }}
                    className="text-slate-400 hover:text-slate-300"
                  >
                    ← Change email
                  </button>
                  <button
                    type="button"
                    onClick={resendOTP}
                    disabled={resendCooldown > 0 || loading}
                    className="text-orange-500 hover:text-orange-400 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Internal use only · AWS Student Builder Group · SRMIST
        </p>
      </div>
    </div>
  );
}
