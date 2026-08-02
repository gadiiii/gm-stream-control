"use client"

import { useEffect, useState } from "react"
import { api, type BitrateSample } from "@/lib/api"

interface BitrateChartProps {
  isLive: boolean
}

const WIDTH = 600
const HEIGHT = 120

export function BitrateChart({ isLive }: BitrateChartProps) {
  const [samples, setSamples] = useState<BitrateSample[]>([])

  useEffect(() => {
    if (!isLive) {
      setSamples([])
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        const data = await api.getBitrateHistory()
        if (!cancelled) setSamples(data)
      } catch {
        // Transient failures are fine — the next tick retries.
      }
    }

    load()
    const interval = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isLive])

  const peak = Math.max(1, ...samples.map((s) => s.bitrate_kbps))
  const current = samples.at(-1)?.bitrate_kbps ?? 0
  const average = samples.length
    ? Math.round(samples.reduce((sum, s) => sum + s.bitrate_kbps, 0) / samples.length)
    : 0

  const points = samples.map((sample, index) => {
    const x = samples.length > 1 ? (index / (samples.length - 1)) * WIDTH : 0
    const y = HEIGHT - (sample.bitrate_kbps / peak) * HEIGHT
    return [x, y] as const
  })

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const area = points.length
    ? `0,${HEIGHT} ${line} ${points.at(-1)![0].toFixed(1)},${HEIGHT}`
    : ""

  return (
    <div className="rounded-[8px] bg-surface border border-border p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Bitrate</h2>
        <div className="flex gap-4 text-xs font-mono tabular-nums text-text-tertiary">
          <span>
            now <span className="text-text-primary">{current.toLocaleString()}</span>
          </span>
          <span>
            avg <span className="text-text-primary">{average.toLocaleString()}</span>
          </span>
          <span>
            peak <span className="text-text-primary">{peak.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {samples.length < 2 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-text-tertiary">
          {isLive ? "Collecting samples…" : "No data — start streaming to see bitrate"}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-[120px] w-full"
        >
          <polygon points={area} fill="#E8440A" fillOpacity="0.12" />
          <polyline
            points={line}
            fill="none"
            stroke="#E8440A"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          <circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r="3" fill="#E8440A" />
        </svg>
      )}
    </div>
  )
}
