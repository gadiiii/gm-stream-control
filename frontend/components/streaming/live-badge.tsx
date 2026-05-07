"use client"

import { cn } from "@/lib/utils"

interface LiveBadgeProps {
  isLive: boolean
  className?: string
}

export function LiveBadge({ isLive, className }: LiveBadgeProps) {
  if (!isLive) {
    return (
      <div className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A] border border-border",
        className
      )}>
        <span className="font-mono text-sm text-text-tertiary uppercase tracking-wide">
          OFFLINE
        </span>
      </div>
    )
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-2 px-3 py-1.5 bg-accent-muted border border-accent/30",
      className
    )}>
      <div className="w-2 h-2 rounded-full bg-accent animate-pulse-live" />
      <span className="font-mono text-sm text-accent uppercase tracking-wide">
        LIVE
      </span>
    </div>
  )
}
