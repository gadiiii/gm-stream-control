"use client"

import { useState } from "react"
import { useAuth } from "@/components/streaming/auth-provider"
import { Button } from "@/components/ui/button"
import { Check, Copy, Gamepad2, LogOut, Server, Shield } from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"
const RTMP_URL = process.env.NEXT_PUBLIC_RTMP_URL || "rtmp://192.168.4.50/live"

const COMPANION_ENDPOINTS = [
  {
    label: "Poll for button feedback (live, bitrate, viewers)",
    method: "GET",
    path: "/api/companion/status",
    body: null,
  },
  {
    label: "Go live",
    method: "POST",
    path: "/api/companion/action",
    body: '{"action":"start_stream","title":"Sunday Service"}',
  },
  {
    label: "Stop stream",
    method: "POST",
    path: "/api/companion/action",
    body: '{"action":"stop_stream"}',
  },
  {
    label: "Toggle a destination on or off",
    method: "POST",
    path: "/api/companion/action",
    body: '{"action":"toggle_destination","destination_id":"<uuid>"}',
  },
]

function CopyableValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <button
        onClick={copy}
        className="flex w-full items-center justify-between gap-2 rounded-[6px] border border-border bg-elevated px-3 py-2 text-left transition-colors hover:border-text-tertiary"
      >
        <span className="truncate font-mono text-xs text-text-primary">{value}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        )}
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const { user, logout } = useAuth()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl text-text-primary tracking-wide">SETTINGS</h1>
        <p className="text-sm text-text-secondary mt-1">
          Account and connection details for this panel
        </p>
      </div>

      {/* Account */}
      <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Account</h2>
        </div>

        <div className="flex items-center justify-between gap-3 py-3 border-b border-border">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{user?.name}</p>
            <p className="text-sm font-mono text-text-secondary truncate">{user?.email}</p>
          </div>
          <span className="shrink-0 inline-flex px-2.5 py-0.5 text-xs rounded-full bg-accent-muted text-accent uppercase">
            {user?.role}
          </span>
        </div>

        <Button
          variant="outline"
          onClick={logout}
          className="border-border text-text-secondary hover:text-red-400 hover:border-red-400/50 rounded-[6px] gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>

      {/* Connection */}
      <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Connection</h2>
        </div>

        <p className="text-xs text-text-tertiary">
          Where this panel is pointed. To change any of these, edit the .env files on the
          server and restart the services — they&apos;re baked in at build time.
        </p>

        <div className="space-y-3">
          <CopyableValue label="RTMP ingest (point OBS here)" value={RTMP_URL} />
          <CopyableValue label="API server" value={API_URL} />
          <CopyableValue label="WebSocket" value={WS_URL} />
        </div>
      </div>

      {/* Bitfocus Companion */}
      <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Gamepad2 className="w-5 h-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Bitfocus Companion</h2>
        </div>

        <p className="text-xs text-text-tertiary">
          Add these as Generic HTTP actions in Companion. Every request needs the header{" "}
          <code className="font-mono text-text-secondary">X-Companion-Key</code> set to the
          value of <code className="font-mono text-text-secondary">COMPANION_API_KEY</code>{" "}
          in the backend&apos;s .env file.
        </p>

        <div className="space-y-3">
          {COMPANION_ENDPOINTS.map((endpoint) => (
            <div
              key={endpoint.label}
              className="rounded-[6px] border border-border bg-elevated p-3 space-y-2"
            >
              <p className="text-xs text-text-secondary">{endpoint.label}</p>
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent-muted text-accent">
                  {endpoint.method}
                </span>
                <code className="whitespace-nowrap font-mono text-xs text-text-primary">
                  {API_URL}
                  {endpoint.path}
                </code>
              </div>
              {endpoint.body && (
                <code className="block overflow-x-auto whitespace-nowrap font-mono text-xs text-text-tertiary">
                  {endpoint.body}
                </code>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-text-tertiary">
          To have the panel press Companion buttons when you go live, set{" "}
          <code className="font-mono text-text-secondary">COMPANION_URL</code>,{" "}
          <code className="font-mono text-text-secondary">COMPANION_BUTTON_GOLIVE</code>, and{" "}
          <code className="font-mono text-text-secondary">COMPANION_BUTTON_STOP</code> (as{" "}
          <span className="font-mono">page/row/column</span>) in the backend .env.
        </p>
      </div>
    </div>
  )
}
