import type { Metadata, Viewport } from 'next';
import { DM_Sans, IBM_Plex_Sans_Arabic, Sora } from 'next/font/google';
import { PreferencesProvider } from '@/lib/i18n/PreferencesProvider';
import { AppProvider } from '@/lib/state/AppProvider';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GymMate — your AI gym coach',
  description:
    'GymMate builds a training program around your days, time and equipment, then guides you through every workout.',
};

export const viewport: Viewport = {
  themeColor: '#080d16',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The real values are set on the client as soon as preferences load; these
    // defaults keep the first paint dark and left-to-right rather than flashing.
    <html lang="en" dir="ltr" data-theme="dark" data-lang="en">
      <body className={`${sora.variable} ${dmSans.variable} ${arabic.variable}`}>
        <PreferencesProvider>
          <AppProvider>{children}</AppProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
