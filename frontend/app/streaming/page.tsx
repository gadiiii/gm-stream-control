"use client"

import Link from "next/link"
import { useState, useCallback, useEffect, useRef } from "react"
import { Clock, Users, Activity } from "lucide-react"
import { toast } from "sonner"
import { api, mapDestination } from "@/lib/api"
import { LiveBadge } from "@/components/streaming/live-badge"
import { StreamPreview } from "@/components/streaming/stream-preview"
import { StatCard } from "@/components/streaming/stat-card"
import { StreamControls } from "@/components/streaming/stream-controls"
import { DestinationCard, type DestinationStatus } from "@/components/streaming/destination-card"
import { ThumbnailManager } from "@/components/streaming/thumbnail-manager"
import { GoLiveDialog } from "@/components/streaming/go-live-dialog"
import { StreamDropAlert } from "@/components/streaming/stream-drop-alert"
import { BitrateChart } from "@/components/streaming/bitrate-chart"
import { ObsStatus } from "@/components/streaming/obs-status"
import { StreamHealth } from "@/components/streaming/stream-health"
import { useWebSocket } from "@/components/streaming/websocket-provider"

type Platform = "youtube" | "facebook" | "instagram" | "owncast"

interface Destination {
  id: string
  platform: Platform
  status: DestinationStatus
  viewers: number
  enabled: boolean
}

const toPlatform = (value: string): Platform | null => {
  const platform = value.toLowerCase()
  if (
    platform === "youtube" ||
    platform === "facebook" ||
    platform === "instagram" ||
    platform === "owncast"
  ) {
    return platform
  }

  return null
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
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(false)
  const [showGoLiveDialog, setShowGoLiveDialog] = useState(false)
  const [showDropAlert, setShowDropAlert] = useState(false)

  const isLive = streamData?.live ?? false
  const wasLive = useRef(false)
  const stoppingIntentionally = useRef(false)

  const stats = {
    uptime: streamData ? formatUptime(streamData.uptime_secs) : "00:00:00",
    viewers: streamData?.total_viewers ?? 0,
    bitrate: streamData ? streamData.bitrate_kbps.toLocaleString() : "0",
  }

  // A live → offline transition that we didn't ask for means the encoder dropped.
  useEffect(() => {
    if (wasLive.current && !isLive) {
      if (stoppingIntentionally.current) {
        stoppingIntentionally.current = false
      } else {
        setShowDropAlert(true)
      }
    }
    wasLive.current = isLive
  }, [isLive])

  useEffect(() => {
    const loadDestinations = async () => {
      try {
        const data = await api.getDestinations()
        const mapped = data
          .map(mapDestination)
          .map((destination) => {
            const platform = toPlatform(destination.platformType || destination.platform)
            if (!platform) return null

            return {
              id: destination.id,
              platform,
              status: "disabled" as DestinationStatus,
              viewers: 0,
              enabled: destination.enabled,
            }
          })
          .filter((destination): destination is Destination => destination !== null)

        setDestinations(mapped)
      } catch (error) {
        console.error("Failed to load destinations", error)
        toast.error("Failed to load destinations. Check your connection.")
        setDestinations([])
      }
    }

    loadDestinations()
  }, [])

  const handleStartStream = useCallback(async (title: string) => {
    setIsLoading(true)
    setShowGoLiveDialog(false)

    try {
      await api.startStream(title || undefined)

      setDestinations((prev) =>
        prev.map((d) => ({
          ...d,
          status: d.enabled ? "connected" : "disabled",
          viewers: 0,
        }))
      )
      toast.success(title ? `Stream started — ${title}` : "Stream started")
    } catch (error) {
      console.error("Failed to start stream", error)
      toast.error("Failed to start stream. Check your connection.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleStopStream = useCallback(async () => {
    setIsLoading(true)
    stoppingIntentionally.current = true

    try {
      await api.stopStream()

      setDestinations((prev) =>
        prev.map((d) => ({
          ...d,
          status: "disabled",
          viewers: 0,
        }))
      )
      toast.success("Stream stopped")
    } catch (error) {
      console.error("Failed to stop stream", error)
      stoppingIntentionally.current = false
      toast.error("Failed to stop stream. Check your connection.")
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
    stoppingIntentionally.current = true

    try {
      await api.stopStream()

      setDestinations((prev) =>
        prev.map((d) => ({
          ...d,
          status: "disabled",
          viewers: 0,
        }))
      )
      toast.warning("Emergency stop activated")
    } catch (error) {
      console.error("Failed to emergency stop", error)
      stoppingIntentionally.current = false
      toast.error("Failed to stop stream. Check your connection.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const totalViewers = stats.viewers || destinations.reduce((sum, d) => sum + d.viewers, 0)
  const enabledDestinations = destinations.filter((d) => d.enabled).map((d) => d.platform)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <StreamDropAlert open={showDropAlert} onDismiss={() => setShowDropAlert(false)} />

      <GoLiveDialog
        open={showGoLiveDialog}
        onOpenChange={setShowGoLiveDialog}
        onConfirm={handleStartStream}
        enabledDestinations={enabledDestinations}
        isLoading={isLoading}
      />

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
          <h1 className="font-display text-2xl sm:text-3xl text-text-primary tracking-wide">
            DASHBOARD
          </h1>
          <LiveBadge isLive={isLive} />
        </div>
        <StreamControls
          isLive={isLive}
          isLoading={isLoading}
          onStartStream={() => setShowGoLiveDialog(true)}
          onStopStream={handleStopStream}
          onEmergencyStop={handleEmergencyStop}
        />
      </div>

      <StreamHealth isLive={isLive} bitrate={streamData?.bitrate_kbps ?? 0} />

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

          <BitrateChart isLive={isLive} />
        </div>

        {/* Right column - Encoder and destinations */}
        <div className="space-y-6">
          <ObsStatus isConnected={isLive} streamName={streamData?.stream_name} />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-secondary">
                Destinations
              </h2>
              <Link
                href="/streaming/destinations"
                className="text-xs font-medium text-accent hover:underline"
              >
                Manage
              </Link>
            </div>
            <div className="space-y-3">
              {destinations.map((destination) => (
                <DestinationCard
                  key={destination.platform}
                  platform={destination.platform}
                  status={destination.status}
                  viewers={destination.viewers}
                  enabled={destination.enabled}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
