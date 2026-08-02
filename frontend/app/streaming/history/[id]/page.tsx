"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Users, Clock, Activity, Calendar } from "lucide-react"
import { toast } from "sonner"
import { api, type ApiStreamAnalytics, type ApiStreamHistory } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionChart, type SessionSample } from "@/components/streaming/session-chart"

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDuration(value: number | string | null | undefined): string {
  const seconds = Math.max(0, Math.floor(toNumber(value)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function formatClock(value: string | null | undefined): string {
  if (!value) return "--"
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-[8px] bg-surface border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-text-tertiary" />
        <span className="text-xs text-text-secondary">{label}</span>
      </div>
      <span className="font-display text-2xl text-text-primary tracking-wide tabular-nums">
        {value}
      </span>
    </div>
  )
}

export default function StreamSessionPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [stream, setStream] = useState<ApiStreamHistory | null>(null)
  const [samples, setSamples] = useState<ApiStreamAnalytics[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    const load = async () => {
      try {
        const [history, analytics] = await Promise.all([
          api.getAnalyticsHistory(),
          api.getStreamAnalytics(id),
        ])
        setStream(history.find((s) => s.id === id) ?? null)
        setSamples(analytics)
      } catch (error) {
        console.error("Failed to load session", error)
        toast.error("Failed to load this session. Check your connection.")
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [id])

  const data = useMemo<SessionSample[]>(
    () =>
      samples
        .slice()
        .sort((a, b) => (a.recorded_at ?? "").localeCompare(b.recorded_at ?? ""))
        .map((sample) => ({
          time: formatClock(sample.recorded_at),
          viewers: toNumber(sample.viewer_count),
          bitrate: toNumber(sample.bitrate_kbps),
        })),
    [samples]
  )

  const avgBitrate = data.length
    ? Math.round(data.reduce((sum, d) => sum + d.bitrate, 0) / data.length)
    : 0

  return (
    <div className="space-y-6">
      <Link
        href="/streaming/history"
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to history
      </Link>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-9 w-72" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[320px]" />
        </div>
      ) : !stream ? (
        <div className="rounded-[8px] bg-surface border border-border p-12 text-center">
          <p className="text-text-secondary">That stream session no longer exists.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">
                {stream.title || "Untitled stream"}
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                {formatClock(stream.started_at)} — {formatClock(stream.ended_at)}
              </p>
            </div>
            <span className="inline-flex px-2.5 py-0.5 text-xs rounded-full bg-[#2A2A2A] text-text-secondary">
              {stream.status || "unknown"}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Date"
              value={
                stream.started_at
                  ? new Date(stream.started_at).toISOString().split("T")[0]
                  : "--"
              }
              icon={Calendar}
            />
            <SummaryCard
              label="Duration"
              value={formatDuration(stream.duration_secs)}
              icon={Clock}
            />
            <SummaryCard
              label="Peak Viewers"
              value={(stream.peak_viewers ?? 0).toLocaleString()}
              icon={Users}
            />
            <SummaryCard
              label="Avg Bitrate"
              value={`${avgBitrate.toLocaleString()}`}
              icon={Activity}
            />
          </div>

          <SessionChart title="Viewers" unit="viewers" dataKey="viewers" data={data} />
          <SessionChart title="Bitrate" unit="kbps" dataKey="bitrate" data={data} />
        </>
      )}
    </div>
  )
}
