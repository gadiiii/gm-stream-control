"use client"

import { useState } from "react"
import { Copy, Check, Radio } from "lucide-react"
import { cn } from "@/lib/utils"

const RTMP_URL = process.env.NEXT_PUBLIC_RTMP_URL || "rtmp://192.168.4.50/live"

interface ObsStatusProps {
  isConnected: boolean
  streamName?: string | null
}

export function ObsStatus({ isConnected, streamName }: ObsStatusProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(RTMP_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-[8px] bg-surface border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-secondary">Encoder</h2>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isConnected ? "bg-emerald-400 motion-safe:animate-pulse" : "bg-text-tertiary"
            )}
          />
          <span
            className={cn(
              "text-xs font-medium",
              isConnected ? "text-emerald-400" : "text-text-tertiary"
            )}
          >
            {isConnected ? "Publishing" : "Not connected"}
          </span>
        </div>
      </div>

      {isConnected ? (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono">{streamName || "live"}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-tertiary">
            Point OBS at this server, then click Start Streaming.
          </p>
          <button
            onClick={copy}
            className="flex w-full items-center justify-between gap-2 rounded-[6px] border border-border bg-elevated px-3 py-2 text-left transition-colors hover:border-text-tertiary"
          >
            <span className="truncate font-mono text-xs text-text-primary">{RTMP_URL}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
            )}
          </button>
        </div>
      )}
    </div>
  )
}
