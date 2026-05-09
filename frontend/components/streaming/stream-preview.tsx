"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { VideoOff } from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const HLS_BASE = API_URL.replace(/:8000$/, ":8080").replace(/:(\d+)$/, ":8080")

interface StreamPreviewProps {
  isLive: boolean
  streamName?: string
  className?: string
}

export function StreamPreview({
  isLive,
  streamName = "gracia",
  className,
}: StreamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!isLive || !videoRef.current) return

    const hlsUrl = `${HLS_BASE}/hls/${streamName}.m3u8`
    let hls: import("hls.js").default | null = null

    import("hls.js").then(({ default: Hls }) => {
      if (!videoRef.current) return
      if (Hls.isSupported()) {
        hls = new Hls({ liveSyncDurationCount: 3 })
        hls.loadSource(hlsUrl)
        hls.attachMedia(videoRef.current)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => {})
        })
      } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        videoRef.current.src = hlsUrl
        videoRef.current.play().catch(() => {})
      }
    })

    return () => {
      hls?.destroy()
    }
  }, [isLive, streamName])

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
      "relative aspect-video rounded-[8px] bg-black overflow-hidden",
      className
    )}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        muted
        playsInline
        controls={false}
      />
    </div>
  )
}
