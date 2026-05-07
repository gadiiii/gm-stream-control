"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Play, Square, AlertTriangle } from "lucide-react"

interface StreamControlsProps {
  isLive: boolean
  onStartStream: () => void
  onStopStream: () => void
  onEmergencyStop: () => void
  isLoading?: boolean
  className?: string
}

export function StreamControls({
  isLive,
  onStartStream,
  onStopStream,
  onEmergencyStop,
  isLoading,
  className,
}: StreamControlsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {!isLive ? (
        <Button
          onClick={onStartStream}
          disabled={isLoading}
          className="bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px] gap-2"
        >
          <Play className="w-4 h-4" />
          Start Stream
        </Button>
      ) : (
        <Button
          onClick={onStopStream}
          disabled={isLoading}
          variant="secondary"
          className="rounded-[6px] gap-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border"
        >
          <Square className="w-4 h-4" />
          Stop Stream
        </Button>
      )}
      
      <Button
        onClick={onEmergencyStop}
        disabled={isLoading || !isLive}
        variant="destructive"
        className="rounded-[6px] gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
      >
        <AlertTriangle className="w-4 h-4" />
        Emergency Stop
      </Button>
    </div>
  )
}
