"use client"

import { useState } from "react"
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
import { Users, Clock, Monitor } from "lucide-react"

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

// Mock stream history data
const streamHistory = [
  {
    id: "1",
    date: "2024-01-14",
    startTime: "10:00 AM",
    duration: "2h 45m",
    platforms: ["YouTube", "Facebook", "Instagram"],
    peakViewers: 378,
    totalViews: 2847,
  },
  {
    id: "2",
    date: "2024-01-07",
    startTime: "10:00 AM",
    duration: "2h 30m",
    platforms: ["YouTube", "Facebook"],
    peakViewers: 312,
    totalViews: 2156,
  },
  {
    id: "3",
    date: "2023-12-31",
    startTime: "11:00 PM",
    duration: "1h 15m",
    platforms: ["YouTube", "Facebook", "Instagram", "Owncast"],
    peakViewers: 524,
    totalViews: 3892,
  },
  {
    id: "4",
    date: "2023-12-24",
    startTime: "6:00 PM",
    duration: "3h 00m",
    platforms: ["YouTube", "Facebook"],
    peakViewers: 445,
    totalViews: 3245,
  },
  {
    id: "5",
    date: "2023-12-17",
    startTime: "10:00 AM",
    duration: "2h 20m",
    platforms: ["YouTube"],
    peakViewers: 287,
    totalViews: 1876,
  },
]

const platformColors = {
  youtube: "#E8440A",
  facebook: "#888888",
  instagram: "#555555",
  owncast: "#3D3D3D",
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null

  return (
    <div className="bg-elevated border border-border-strong rounded-[6px] p-3">
      <p className="font-mono text-xs text-text-secondary mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
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

  // Calculate stats from mock data
  const peakViewers = Math.max(
    ...viewerData.map(
      (d) => d.youtube + d.facebook + d.instagram + d.owncast
    )
  )
  const totalDuration = streamHistory.reduce((acc, stream) => {
    const [hours, mins] = stream.duration.split("h ")
    return acc + parseInt(hours) * 60 + parseInt(mins)
  }, 0)
  const totalHours = Math.floor(totalDuration / 60)
  const totalMins = totalDuration % 60
  const platformsUsed = new Set(streamHistory.flatMap((s) => s.platforms)).size

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
              <TableHead className="text-text-secondary">Platforms</TableHead>
              <TableHead className="text-text-secondary text-right">
                Peak Viewers
              </TableHead>
              <TableHead className="text-text-secondary text-right">
                Total Views
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {streamHistory.map((stream) => (
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
                  <div className="flex flex-wrap gap-1.5">
                    {stream.platforms.map((platform) => (
                      <span
                        key={platform}
                        className="inline-flex px-2 py-0.5 text-xs rounded-full bg-[#2A2A2A] text-text-secondary"
                      >
                        {platform}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right font-display text-lg text-text-primary tracking-wide">
                  {stream.peakViewers.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-display text-lg text-text-primary tracking-wide">
                  {stream.totalViews.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
