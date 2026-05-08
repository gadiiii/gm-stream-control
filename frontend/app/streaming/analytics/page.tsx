"use client"

import { useEffect, useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, Clock, Monitor } from "lucide-react"
import { toast } from "sonner"
import { api, type ApiStreamHistory } from "@/lib/api"

interface ViewerDataPoint {
  date: string
  viewers: number
}

interface StreamHistoryRow {
  id: string
  date: string
  startTime: string
  duration: string
  durationSecs: number
  status: string
  peakViewers: number
  totalViews: number
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDuration(secondsValue: number | string | null | undefined): string {
  const seconds = Math.max(0, Math.floor(toNumber(secondsValue)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function mapStreamHistory(stream: ApiStreamHistory): StreamHistoryRow {
  const startedAt = stream.started_at ? new Date(stream.started_at) : null
  const durationSecs = toNumber(stream.duration_secs)

  return {
    id: stream.id,
    date: startedAt ? startedAt.toISOString().split("T")[0] : "",
    startTime: startedAt
      ? startedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "",
    duration: formatDuration(durationSecs),
    durationSecs,
    status: stream.status ?? "",
    peakViewers: stream.peak_viewers ?? 0,
    totalViews: stream.total_viewers ?? 0,
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-[8px] bg-surface border border-border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-[6px] bg-elevated">
          <Icon className="w-4 h-4 text-text-secondary" />
        </div>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className="font-display text-4xl text-text-primary tracking-wider">
        {value}
      </span>
    </div>
  )
}

interface TooltipEntry {
  color: string
  dataKey: string
  value: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload) return null

  return (
    <div className="bg-elevated border border-border-strong rounded-[6px] p-3">
      <p className="font-mono text-xs text-text-secondary mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-text-secondary capitalize">{entry.dataKey}:</span>
          <span className="font-display text-text-primary">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("7d")
  const [streamHistory, setStreamHistory] = useState<StreamHistoryRow[]>([])
  const [viewerData, setViewerData] = useState<ViewerDataPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await api.getAnalyticsHistory()
        const rows = data.map(mapStreamHistory)
        setStreamHistory(rows)
        setViewerData(
          rows
            .filter((r) => r.date)
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((r) => ({ date: r.date, viewers: r.peakViewers }))
        )
      } catch (error) {
        console.error("Failed to load analytics history", error)
        toast.error("Failed to load analytics. Check your connection.")
        setStreamHistory([])
        setViewerData([])
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [])

  const peakViewers = Math.max(0, ...streamHistory.map((s) => s.peakViewers))
  const totalDuration = streamHistory.reduce((acc, s) => acc + Math.floor(s.durationSecs / 60), 0)
  const totalHours = Math.floor(totalDuration / 60)
  const totalMins = totalDuration % 60
  const platformsUsed = 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
          <p className="text-sm text-text-secondary mt-1">
            Stream performance and viewer insights
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[140px] bg-surface border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-elevated border-border">
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Peak Viewers" value={peakViewers.toString()} icon={Users} />
        <StatCard
          label="Total Duration"
          value={`${totalHours}h ${totalMins}m`}
          icon={Clock}
        />
        <StatCard
          label="Platforms Used"
          value={platformsUsed.toString()}
          icon={Monitor}
        />
      </div>

      {/* Viewer Chart */}
      <div className="rounded-[8px] bg-surface border border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-text-primary">Peak Viewers Per Stream</h2>
          <span className="text-xs text-text-secondary">Per-platform breakdown available in Phase 4</span>
        </div>
        <div className="h-[350px]">
          {viewerData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-text-secondary text-sm">
              No stream data yet — viewer trends will appear here after your first stream
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={viewerData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#555555"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: "#2A2A2A" }}
                />
                <YAxis
                  stroke="#555555"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: "#2A2A2A" }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="viewers"
                  stroke="#E8440A"
                  strokeWidth={2}
                  dot={{ fill: "#E8440A", r: 4 }}
                  activeDot={{ r: 6, fill: "#E8440A" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Stream History Table */}
      <div className="rounded-[8px] bg-surface border border-border">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Stream History</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-text-secondary">Date</TableHead>
              <TableHead className="text-text-secondary">Start Time</TableHead>
              <TableHead className="text-text-secondary">Duration</TableHead>
              <TableHead className="text-text-secondary">Status</TableHead>
              <TableHead className="text-text-secondary text-right">
                Peak Viewers
              </TableHead>
              <TableHead className="text-text-secondary text-right">
                Total Views
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index} className="border-border">
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : streamHistory.length > 0 ? (
              streamHistory.map((stream) => (
                <TableRow key={stream.id} className="border-border">
                  <TableCell className="font-mono text-sm text-text-primary">
                    {stream.date}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-text-secondary">
                    {stream.startTime}
                  </TableCell>
                  <TableCell className="font-display text-lg text-text-primary tracking-wide">
                    {stream.duration}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-[#2A2A2A] text-text-secondary">
                      {stream.status || "unknown"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-display text-lg text-text-primary tracking-wide">
                    {stream.peakViewers.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-display text-lg text-text-primary tracking-wide">
                    {stream.totalViews.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="border-border">
                <TableCell colSpan={6} className="py-12 text-center text-text-secondary">
                  No stream history yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
