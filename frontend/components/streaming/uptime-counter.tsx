"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface UptimeCounterProps {
  startTime: Date | null
  className?: string
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

export function UptimeCounter({ startTime, className }: UptimeCounterProps) {
  const [uptime, setUptime] = useState(0)

  useEffect(() => {
    if (!startTime) {
      setUptime(0)
      return
    }

    const updateUptime = () => {
      const diff = Math.floor((Date.now() - startTime.getTime()) / 1000)
      setUptime(Math.max(0, diff))
    }

    updateUptime()
    const interval = setInterval(updateUptime, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-sm text-text-secondary">Stream Uptime</span>
      <span className="font-display text-5xl text-text-primary tracking-wider">
        {formatUptime(uptime)}
      </span>
    </div>
  )
}
