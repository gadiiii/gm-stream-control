"use client"

import { useState } from "react"
import { Menu, Radio } from "lucide-react"
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          />
        )}

        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            className="rounded-[6px] p-2 text-text-secondary hover:bg-elevated hover:text-text-primary"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-accent">
              <Radio className="h-3.5 w-3.5 text-accent-foreground" />
            </div>
            <span className="font-display text-lg tracking-wide text-text-primary">
              STREAM CTRL
            </span>
          </div>
        </header>

        <main className="lg:pl-64">
          <div className="p-4 sm:p-6">
            {children}
          </div>
        </main>
        <Toaster position="bottom-right" />
      </div>
    </WebSocketProvider>
  )
}
