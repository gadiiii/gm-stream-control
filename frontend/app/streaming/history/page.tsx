"use client"

import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { api, type ApiStreamHistory } from "@/lib/api"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface StreamSession {
  id: string
  title: string
  date: string
  startedAt: string
  endedAt: string
  duration: string
  status: string
  peakViewers: number
  totalViewers: number
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ""
  return new Date(value).toISOString().split("T")[0]
}

function formatTime(value: string | null | undefined): string {
  if (!value) return ""
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDuration(value: number | string | null | undefined): string {
  const seconds = Math.max(0, Math.floor(toNumber(value)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}H ${minutes}M`
}

function mapSession(stream: ApiStreamHistory): StreamSession {
  return {
    id: stream.id,
    title: stream.title || "Untitled stream",
    date: formatDate(stream.started_at),
    startedAt: formatTime(stream.started_at),
    endedAt: formatTime(stream.ended_at),
    duration: formatDuration(stream.duration_secs),
    status: stream.status || "unknown",
    peakViewers: stream.peak_viewers ?? 0,
    totalViewers: stream.total_viewers ?? 0,
  }
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<StreamSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await api.getAnalyticsHistory()
        setSessions(data.map(mapSession))
      } catch (error) {
        console.error("Failed to load stream history", error)
        toast.error("Failed to load stream history. Check your connection.")
        setSessions([])
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [])

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase()

    return sessions.filter((session) => {
      const matchesStatus = status === "all" || session.status === status
      const matchesSearch =
        !query ||
        session.title.toLowerCase().includes(query) ||
        session.date.includes(query) ||
        session.status.toLowerCase().includes(query)

      return matchesStatus && matchesSearch
    })
  }, [search, sessions, status])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Stream History</h1>
          <p className="text-sm text-text-secondary mt-1">
            Search and review past stream sessions
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, date, or status"
            className="pl-9 bg-surface border-border text-text-primary"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[160px] bg-surface border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-elevated border-border">
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-[8px] bg-surface border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-text-secondary font-medium">Title</TableHead>
              <TableHead className="text-text-secondary font-medium">Date</TableHead>
              <TableHead className="text-text-secondary font-medium">Start</TableHead>
              <TableHead className="text-text-secondary font-medium">End</TableHead>
              <TableHead className="text-text-secondary font-medium">Duration</TableHead>
              <TableHead className="text-text-secondary font-medium">Status</TableHead>
              <TableHead className="text-text-secondary font-medium text-right">
                Peak
              </TableHead>
              <TableHead className="text-text-secondary font-medium text-right">
                Total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index} className="border-border">
                  <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filteredSessions.length > 0 ? (
              filteredSessions.map((session) => (
                <TableRow key={session.id} className="border-border hover:bg-elevated/50">
                  <TableCell className="text-text-primary font-medium">
                    {session.title}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-text-secondary">
                    {session.date}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-text-secondary">
                    {session.startedAt}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-text-secondary">
                    {session.endedAt || "--"}
                  </TableCell>
                  <TableCell className="font-display text-lg text-text-primary tracking-wide">
                    {session.duration}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-[#2A2A2A] text-text-secondary">
                      {session.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-display text-lg text-text-primary tracking-wide">
                    {session.peakViewers.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-display text-lg text-text-primary tracking-wide">
                    {session.totalViewers.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="py-12 text-center text-text-secondary">
                  No stream sessions found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
