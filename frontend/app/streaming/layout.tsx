"use client"

import { useAuth } from "@/components/streaming/auth-provider"
import { Sidebar } from "@/components/streaming/sidebar"
import { WebSocketProvider } from "@/components/streaming/websocket-provider"
import { Toaster } from "@/components/ui/sonner"

export default function StreamingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-[#0A0A0A]">
        <Sidebar />
        <main className="pl-64">
          <div className="p-6">
            {children}
          </div>
        </main>
        <Toaster position="bottom-right" />
      </div>
    </WebSocketProvider>
  )
}
