import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist_Mono } from 'next/font/google'
import './globals.css'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'HUCK — Ultimate Frisbee Game',
  description: 'A fast top-down Ultimate frisbee game. Throw, cut, lay out, and score before the stall count hits ten.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: `${basePath}/icon-light-32x32.png`, media: '(prefers-color-scheme: light)' },
      { url: `${basePath}/icon-dark-32x32.png`, media: '(prefers-color-scheme: dark)' },
      { url: `${basePath}/icon.svg`, type: 'image/svg+xml' },
    ],
    apple: `${basePath}/apple-icon.png`,
  },
}

export const viewport: Viewport = {
  themeColor: '#0f2417',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
