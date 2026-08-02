"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"

/** Readings kept for the rolling baseline — at one per WebSocket tick (~5s), ~2min. */
const WINDOW = 24
/** Below this the encoder is almost certainly misconfigured for HD video. */
const LOW_BITRATE_KBPS = 1000
/** A drop past this fraction of the recent baseline reads as a real degradation. */
const DROP_RATIO = 0.5
/** Ignore the ratio check until the baseline is high enough to be meaningful. */
const MIN_BASELINE_KBPS = 500

type Severity = "critical" | "warning"

interface Health {
  severity: Severity
  title: string
  detail: string
}

interface StreamHealthProps {
  isLive: boolean
  bitrate: number
}

export function StreamHealth({ isLive, bitrate }: StreamHealthProps) {
  const readings = useRef<number[]>([])
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    if (!isLive) {
      readings.current = []
      setHealth(null)
      return
    }

    const window = readings.current
    const baseline = window.length
      ? window.reduce((sum, v) => sum + v, 0) / window.length
      : 0

    let next: Health | null = null

    if (bitrate === 0) {
      next = {
        severity: "critical",
        title: "No video data arriving",
        detail:
          "The stream is open but the encoder has stopped sending. Check OBS is still streaming.",
      }
    } else if (
      window.length >= 4 &&
      baseline >= MIN_BASELINE_KBPS &&
      bitrate < baseline * DROP_RATIO
    ) {
      next = {
        severity: "warning",
        title: "Bitrate dropped sharply",
        detail: `Now ${bitrate.toLocaleString()} kbps against a recent average of ${Math.round(
          baseline
        ).toLocaleString()}. Viewers may see buffering.`,
      }
    } else if (bitrate < LOW_BITRATE_KBPS) {
      next = {
        severity: "warning",
        title: "Low bitrate",
        detail: `${bitrate.toLocaleString()} kbps is below what HD video needs. Check the encoder settings and upload bandwidth.`,
      }
    }

    setHealth(next)

    // Append after evaluating so the current reading isn't diluting its own baseline.
    window.push(bitrate)
    if (window.length > WINDOW) window.shift()
  }, [isLive, bitrate])

  if (!health) return null

  const isCritical = health.severity === "critical"
  const Icon = isCritical ? WifiOff : AlertTriangle

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-[8px] border p-4",
        isCritical
          ? "border-red-500/40 bg-red-500/10"
          : "border-amber-500/40 bg-amber-500/10"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          isCritical ? "text-red-400" : "text-amber-400"
        )}
      />
      <div className="space-y-0.5">
        <p
          className={cn(
            "text-sm font-medium",
            isCritical ? "text-red-300" : "text-amber-300"
          )}
        >
          {health.title}
        </p>
        <p className={cn("text-xs", isCritical ? "text-red-200/80" : "text-amber-200/80")}>
          {health.detail}
        </p>
      </div>
    </div>
  )
}
