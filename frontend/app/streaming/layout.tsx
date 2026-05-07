"use client"

import { Sidebar } from "@/components/streaming/sidebar"
import { WebSocketProvider } from "@/components/streaming/websocket-provider"
import { Toaster } from "@/components/ui/sonner"

export default function StreamingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TODO: Re-enable auth check for production
  // const { user, isLoading } = useAuth()

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
