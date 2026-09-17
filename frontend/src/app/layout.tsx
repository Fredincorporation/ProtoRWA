import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';

import { Providers } from '@/components/providers';
import '@/styles/globals.css';

/**
 * The exact families in the design system, self-hosted by next/font so there is
 * no render-blocking third-party request and no layout shift.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

/**
 * Root layout.
 *
 * Fonts are loaded with `next/font` rather than a Google Fonts <link> so they
 * are self-hosted (no render-blocking third-party request) while still being the
 * exact families in the design system: Space Grotesk / Inter / JetBrains Mono.
 */

export const metadata: Metadata = {
  title: {
    default: 'ProtoRWA - Tokenized Physical Hardware',
    template: '%s | ProtoRWA',
  },
  description:
    'Fund physical hardware production without capital dilution. Escrow-backed claims, milestone-gated releases, and a secondary market for hardware RWAs.',
  applicationName: 'ProtoRWA',
  keywords: [
    'RWA',
    'real world assets',
    'hardware tokenization',
    'milestone escrow',
    'secondary market',
  ],
  openGraph: {
    title: 'ProtoRWA - Tokenized Physical Hardware',
    description:
      'Escrow-backed claims on physical hardware, released milestone by milestone.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f141c',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Material Symbols, as used by the source designs. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background text-on-surface">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
