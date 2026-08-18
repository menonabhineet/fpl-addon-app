import type { Metadata, Viewport } from 'next'
import { Inter, Oswald } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const oswald = Oswald({ subsets: ['latin'], variable: '--font-oswald' })

export const viewport: Viewport = {
  themeColor: '#38003c',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://pro-pundits-league.vercel.app'),
  title: 'Pro Pundits League - Fantasy Premier League Prediction Platform',
  description: 'Pro Pundits League is the companion fantasy prediction platform for Premier League managers. Predict match scores, build Survivor streaks, pick Fantastic Four players, and compete in private mini-leagues.',
  applicationName: 'Pro Pundits League',
  verification: {
    google: 'google3b5a8e3f54fbfe61',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pro Pundits League',
  },
  openGraph: {
    title: 'Pro Pundits League',
    description: 'The companion fantasy prediction platform for Fantasy Premier League football managers.',
    url: 'https://pro-pundits-league.vercel.app',
    siteName: 'Pro Pundits League',
    type: 'website',
    images: [{ url: '/icon.svg', width: 512, height: 512, alt: 'Pro Pundits League' }],
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning is required by next-themes on the html tag
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${oswald.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          scriptProps={{ async: true }}
        >
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}