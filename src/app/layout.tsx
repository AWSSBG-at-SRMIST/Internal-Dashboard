import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'Internal Dashboard | @AWSSBG-at-SRMIST',
  description: 'Internal operations dashboard for AWS Student Builder Group at SRMIST',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/icons/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AWSSBG',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FF9900',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            classNames: {
              toast: '!rounded-none !border-2 !border-[#2d2d2d] !bg-[#0f0f0f] !text-[#f0f0f0] !font-mono !shadow-[4px_4px_0_0_#1a1a1a]',
              title: '!font-bold !uppercase !tracking-wide !text-xs',
              description: '!text-[#888] !text-xs',
              success: '!border-[#FF9900]',
              error: '!border-red-500',
              warning: '!border-yellow-500',
              info: '!border-blue-500',
            },
          }}
        />
        <ServiceWorkerRegistrar />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
