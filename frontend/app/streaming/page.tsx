"use client"

import { useState, useCallback } from "react"
import { Clock, Users, Activity } from "lucide-react"
import { toast } from "sonner"
import { LiveBadge } from "@/components/streaming/live-badge"
import { StreamPreview } from "@/components/streaming/stream-preview"
import { StatCard } from "@/components/streaming/stat-card"
import { StreamControls } from "@/components/streaming/stream-controls"
import { DestinationCard, type DestinationStatus } from "@/components/streaming/destination-card"
import { ThumbnailManager } from "@/components/streaming/thumbnail-manager"
import { useWebSocket } from "@/components/streaming/websocket-provider"

interface Destination {
  platform: "youtube" | "facebook" | "instagram" | "owncast"
  status: DestinationStatus
  viewers: number
  enabled: boolean
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

export default function StreamingDashboard() {
  const { streamData } = useWebSocket()
  const [isLoading, setIsLoading] = useState(false)
  const [destinations, setDestinations] = useState<Destination[]>([
    { platform: "youtube", status: "disabled", viewers: 0, enabled: true },
    { platform: "facebook", status: "disabled", viewers: 0, enabled: true },
    { platform: "instagram", status: "disabled", viewers: 0, enabled: false },
    { platform: "owncast", status: "disabled", viewers: 0, enabled: true },
  ])
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(false)

  // Use WebSocket data if available, otherwise use local state
  const isLive = streamData?.live ?? false
  const stats = {
    uptime: streamData ? formatUptime(streamData.uptime_secs) : "00:00:00",
    viewers: streamData?.total_viewers ?? 0,
    bitrate: streamData ? streamData.bitrate_kbps.toLocaleString() : "0",
  }

  const handleStartStream = useCallback(async () => {
    setIsLoading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    
    try {
      const response = await fetch(`${apiUrl}/api/stream/start`, { method: "POST" })
      if (!response.ok) throw new Error("Failed to start stream")
      
      // Update destinations to connected if enabled
      setDestinations((prev) =>
        prev.map((d) => ({
          ...d,
          status: d.enabled ? "connected" : "disabled",
          viewers: d.enabled ? Math.floor(Math.random() * 500) + 100 : 0,
        }))
      )
      toast.success("Stream started")
    } catch {
      toast.error("Failed to start stream")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleStopStream = useCallback(async () => {
    setIsLoading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    
    try {
      const response = await fetch(`${apiUrl}/api/stream/stop`, { method: "POST" })
      if (!response.ok) throw new Error("Failed to stop stream")
      
      setDestinations((prev) =>
        prev.map((d) => ({
          ...d,
          status: "disabled",
          viewers: 0,
        }))
      )
      toast.info("Stream stopped")
    } catch {
      toast.error("Failed to stop stream")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleEmergencyStop = useCallback(() => {
    setShowEmergencyDialog(true)
  }, [])

  const confirmEmergencyStop = useCallback(async () => {
    setShowEmergencyDialog(false)
    setIsLoading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    
    try {
      const response = await fetch(`${apiUrl}/api/stream/emergency-stop`, { method: "POST" })
      if (!response.ok) throw new Error("Failed to emergency stop")
      
      setDestinations((prev) =>
        prev.map((d) => ({
          ...d,
          status: "disabled",
          viewers: 0,
        }))
      )
      toast.warning("Emergency stop activated")
    } catch {
      toast.error("Failed to emergency stop")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleToggleDestination = useCallback(
    async (platform: Destination["platform"], enabled: boolean) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const destination = destinations.find((d) => d.platform === platform)
      if (!destination) return

      try {
        const response = await fetch(`${apiUrl}/api/destinations/${platform}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        })
        
        if (!response.ok) throw new Error("Failed to update destination")

        setDestinations((prev) =>
          prev.map((d) =>
            d.platform === platform
              ? {
                  ...d,
                  enabled,
                  status: isLive
                    ? enabled
                      ? "connected"
                      : "disabled"
                    : "disabled",
                  viewers: isLive && enabled ? Math.floor(Math.random() * 500) + 100 : 0,
                }
              : d
          )
        )
        toast.success("Destination updated")
      } catch {
        toast.error("Failed to update destination")
      }
    },
    [isLive, destinations]
  )

  const totalViewers = stats.viewers || destinations.reduce((sum, d) => sum + d.viewers, 0)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Emergency Stop Confirmation Dialog */}
      {showEmergencyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-[8px] p-6 max-w-md w-full mx-4 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">
              Stop all outputs?
            </h2>
            <p className="text-sm text-text-secondary">
              Active streams will end immediately. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowEmergencyDialog(false)}
                className="px-4 py-2 rounded-[6px] text-sm font-medium text-text-secondary bg-secondary hover:bg-secondary/80 border border-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmEmergencyStop}
                className="px-4 py-2 rounded-[6px] text-sm font-medium text-white bg-destructive hover:bg-destructive/90 transition-colors"
              >
                Stop All Outputs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-3xl text-text-primary tracking-wide">
            DASHBOARD
          </h1>
          <LiveBadge isLive={isLive} />
        </div>
        <StreamControls
          isLive={isLive}
          isLoading={isLoading}
          onStartStream={handleStartStream}
          onStopStream={handleStopStream}
          onEmergencyStop={handleEmergencyStop}
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Preview and stats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stream Preview */}
          <div className="rounded-[8px] bg-surface border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-text-secondary">
                Live Preview
              </h2>
              {isLive && (
                <span className="text-xs font-mono text-text-tertiary">
                  Refreshing every 10s
                </span>
              )}
            </div>
            <StreamPreview isLive={isLive} />
          </div>

          {/* Thumbnail Manager - only visible when live */}
          {isLive && <ThumbnailManager />}

          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Stream Uptime"
              value={stats.uptime}
              icon={Clock}
            />
            <StatCard
              label="Total Viewers"
              value={totalViewers.toLocaleString()}
              icon={Users}
            />
            <StatCard
              label="Bitrate (kbps)"
              value={stats.bitrate}
              icon={Activity}
            />
          </div>
        </div>

        {/* Right column - Destinations */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-text-secondary">
            Destinations
          </h2>
          <div className="space-y-3">
            {destinations.map((destination) => (
              <DestinationCard
                key={destination.platform}
                platform={destination.platform}
                status={destination.status}
                viewers={destination.viewers}
                enabled={destination.enabled}
                onToggle={(enabled) =>
                  handleToggleDestination(destination.platform, enabled)
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
