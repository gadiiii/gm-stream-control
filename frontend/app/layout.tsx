import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/components/streaming/auth-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stream Control Panel',
  description: 'Live streaming control panel for church media team',
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased min-h-screen">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
