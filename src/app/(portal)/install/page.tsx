'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Download, Smartphone, Monitor, Share, MoreVertical, PlusSquare, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsIOS(ios);
    setIsStandalone(standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  }

  if (isStandalone) {
    return (
      <div className="max-w-lg mx-auto space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Install App</h1>
          <p className="text-sm text-[#666] mt-1 font-mono">PWA status</p>
        </div>
        <Card className="border-green-500/40 bg-green-500/5">
          <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 size={48} className="text-green-400" />
            <div>
              <p className="text-lg font-bold text-green-300 uppercase tracking-wide">Already Installed</p>
              <p className="text-sm text-[#888] font-mono mt-1">You&apos;re running the app in standalone mode.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Install App</h1>
        <p className="text-sm text-[#666] mt-1 font-mono">Install the dashboard on your device for quick access</p>
      </div>

      {/* App preview card */}
      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-16 h-16 bg-[#1a1a1a] border-2 border-[#2d2d2d] flex items-center justify-center flex-shrink-0">
            <Image src="/icons/icon-192x192.png" alt="App icon" width={56} height={56} className="object-contain" />
          </div>
          <div>
            <p className="font-bold text-[#f0f0f0] uppercase tracking-wide">AWSSBG Dashboard</p>
            <p className="text-xs text-[#666] font-mono mt-0.5">internal-dashboard.awssbg-srmist.in</p>
            <p className="text-xs text-[#555] font-mono mt-1">AWS Student Builder Group · SRMIST</p>
          </div>
        </CardContent>
      </Card>

      {/* Android / Desktop install */}
      {!isIOS && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Monitor size={16} className="text-[#FF9900]" />
              <Smartphone size={16} className="text-[#FF9900]" />
              <span className="text-sm font-bold text-[#f0f0f0] uppercase tracking-wide">Android / Desktop</span>
            </div>
            {installed ? (
              <div className="flex items-center gap-2 text-green-400 font-mono text-sm">
                <CheckCircle2 size={16} /> App installed successfully!
              </div>
            ) : deferredPrompt ? (
              <Button className="w-full" onClick={handleInstall}>
                <Download size={16} /> Install Now
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#888] font-mono">Use the browser&apos;s install option:</p>
                <div className="space-y-2 text-xs font-mono text-[#aaa]">
                  <div className="flex items-start gap-2 p-3 bg-[#1a1a1a] border border-[#2d2d2d]">
                    <span className="text-[#FF9900] font-bold flex-shrink-0">Chrome</span>
                    <span>Tap the <MoreVertical size={12} className="inline" /> menu → &quot;Add to Home screen&quot; or &quot;Install app&quot;</span>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-[#1a1a1a] border border-[#2d2d2d]">
                    <span className="text-[#FF9900] font-bold flex-shrink-0">Edge</span>
                    <span>Tap the <MoreVertical size={12} className="inline" /> menu → &quot;Apps&quot; → &quot;Install this site as an app&quot;</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* iOS install */}
      {isIOS && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-[#FF9900]" />
              <span className="text-sm font-bold text-[#f0f0f0] uppercase tracking-wide">iPhone / iPad</span>
            </div>
            <p className="text-xs text-[#888] font-mono">Open this page in Safari, then:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-[#1a1a1a] border border-[#2d2d2d]">
                <span className="w-6 h-6 bg-[#FF9900] text-black text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <span className="text-xs font-mono text-[#aaa] flex items-center gap-1.5">Tap <Share size={12} className="text-[#FF9900]" /> <strong>Share</strong> at the bottom</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-[#1a1a1a] border border-[#2d2d2d]">
                <span className="w-6 h-6 bg-[#FF9900] text-black text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <span className="text-xs font-mono text-[#aaa] flex items-center gap-1.5">Scroll down → tap <PlusSquare size={12} className="text-[#FF9900]" /> <strong>Add to Home Screen</strong></span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-[#1a1a1a] border border-[#2d2d2d]">
                <span className="w-6 h-6 bg-[#FF9900] text-black text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                <span className="text-xs font-mono text-[#aaa]">Tap <strong>Add</strong> — done!</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Why install */}
      <Card className="bg-[#FF9900]/5 border-[#FF9900]/20">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-bold text-[#FF9900] uppercase tracking-wide">Why install?</p>
          <ul className="space-y-1 text-xs font-mono text-[#888]">
            <li>· Opens instantly, no browser bar</li>
            <li>· Works like a native app on your home screen</li>
            <li>· Faster navigation with cached assets</li>
            <li>· Fullscreen experience on mobile</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
