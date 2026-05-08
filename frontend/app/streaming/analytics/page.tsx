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
  Legend,
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

// Mock data for viewer count over time
const viewerData = [
  { time: "10:00", youtube: 145, facebook: 89, instagram: 34, owncast: 12 },
  { time: "10:15", youtube: 178, facebook: 102, instagram: 45, owncast: 18 },
  { time: "10:30", youtube: 210, facebook: 118, instagram: 52, owncast: 22 },
  { time: "10:45", youtube: 245, facebook: 134, instagram: 61, owncast: 28 },
  { time: "11:00", youtube: 298, facebook: 156, instagram: 78, owncast: 35 },
  { time: "11:15", youtube: 342, facebook: 178, instagram: 89, owncast: 42 },
  { time: "11:30", youtube: 378, facebook: 195, instagram: 95, owncast: 48 },
  { time: "11:45", youtube: 356, facebook: 182, instagram: 88, owncast: 45 },
  { time: "12:00", youtube: 312, facebook: 165, instagram: 72, owncast: 38 },
  { time: "12:15", youtube: 278, facebook: 142, instagram: 58, owncast: 32 },
  { time: "12:30", youtube: 234, facebook: 118, instagram: 45, owncast: 25 },
  { time: "12:45", youtube: 189, facebook: 95, instagram: 38, owncast: 18 },
]

const platformColors = {
  youtube: "#E8440A",
  facebook: "#888888",
  instagram: "#555555",
  owncast: "#3D3D3D",
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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await api.getAnalyticsHistory()
        setStreamHistory(data.map(mapStreamHistory))
      } catch (error) {
        console.error("Failed to load analytics history", error)
        toast.error("Failed to load analytics. Check your connection.")
        setStreamHistory([])
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [])

  // Calculate stats from mock data
  const peakViewers = Math.max(
    0,
    ...streamHistory.map((stream) => stream.peakViewers)
  )
  const totalDuration = streamHistory.reduce((acc, stream) => {
    return acc + Math.floor(stream.durationSecs / 60)
  }, 0)
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
        <h2 className="text-lg font-medium text-text-primary mb-6">
          Viewers Over Time
        </h2>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={viewerData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#2A2A2A"
                vertical={false}
              />
              <XAxis
                dataKey="time"
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
              <Legend
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => (
                  <span className="text-text-secondary capitalize text-sm">
                    {value}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="youtube"
                stroke={platformColors.youtube}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: platformColors.youtube }}
              />
              <Line
                type="monotone"
                dataKey="facebook"
                stroke={platformColors.facebook}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: platformColors.facebook }}
              />
              <Line
                type="monotone"
                dataKey="instagram"
                stroke={platformColors.instagram}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: platformColors.instagram }}
              />
              <Line
                type="monotone"
                dataKey="owncast"
                stroke={platformColors.owncast}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: platformColors.owncast }}
              />
            </LineChart>
          </ResponsiveContainer>
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
