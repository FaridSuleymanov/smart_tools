import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MAGI + SYBIL v2.0',
  description: 'Neon Genesis Evangelion × Psycho-Pass — Multi-Agent Decision Engine',
  manifest: '/manifest.json',
  icons: { icon: '/icon.png', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-white antialiased scanlines hex-bg min-h-screen">
        {children}
      </body>
    </html>
  );
}
