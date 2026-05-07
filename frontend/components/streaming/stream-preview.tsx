"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Video, VideoOff } from "lucide-react"

interface StreamPreviewProps {
  isLive: boolean
  thumbnailUrl?: string
  refreshInterval?: number
  className?: string
}

export function StreamPreview({
  isLive,
  thumbnailUrl = "/api/stream/thumbnail",
  refreshInterval = 10000,
  className,
}: StreamPreviewProps) {
  const [imageKey, setImageKey] = useState(0)

  useEffect(() => {
    if (!isLive) return

    const interval = setInterval(() => {
      setImageKey((prev) => prev + 1)
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [isLive, refreshInterval])

  if (!isLive) {
    return (
      <div className={cn(
        "relative aspect-video rounded-[8px] bg-surface border border-border flex items-center justify-center",
        className
      )}>
        <div className="flex flex-col items-center gap-3 text-text-tertiary">
          <VideoOff className="w-12 h-12" />
          <span className="text-sm">Stream offline</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "relative aspect-video rounded-[8px] bg-surface border border-border overflow-hidden",
      className
    )}>
      {/* Placeholder for actual stream thumbnail */}
      <div className="absolute inset-0 flex items-center justify-center bg-elevated">
        <div className="flex flex-col items-center gap-3">
          <Video className="w-12 h-12 text-accent" />
          <span className="text-sm text-text-secondary">Live Preview</span>
          <span className="text-xs font-mono text-text-tertiary">
            Refreshing every {refreshInterval / 1000}s
          </span>
        </div>
      </div>
      {/* Actual image would load here */}
      {/* <img
        key={imageKey}
        src={`${thumbnailUrl}?t=${imageKey}`}
        alt="Stream preview"
        className="absolute inset-0 w-full h-full object-cover"
      /> */}
    </div>
  )
}
