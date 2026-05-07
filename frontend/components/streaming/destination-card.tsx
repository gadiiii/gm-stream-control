"use client"

import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Youtube, Facebook, Instagram, Radio } from "lucide-react"

export type DestinationStatus = "connected" | "error" | "disabled"

interface DestinationCardProps {
  platform: "youtube" | "facebook" | "instagram" | "owncast"
  status: DestinationStatus
  viewers: number
  enabled: boolean
  onToggle: (enabled: boolean) => void
  className?: string
}

const platformConfig = {
  youtube: {
    name: "YouTube",
    icon: Youtube,
    color: "#FF0000",
  },
  facebook: {
    name: "Facebook",
    icon: Facebook,
    color: "#1877F2",
  },
  instagram: {
    name: "Instagram",
    icon: Instagram,
    color: "#E4405F",
  },
  owncast: {
    name: "Owncast",
    icon: Radio,
    color: "#7C3AED",
  },
}

const statusStyles = {
  connected: {
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    text: "Connected",
  },
  error: {
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
    text: "Error",
  },
  disabled: {
    badge: "bg-[#2A2A2A] text-[#666666] border-transparent rounded-full px-2.5 py-0.5",
    text: "Disabled",
  },
}

export function DestinationCard({
  platform,
  status,
  viewers,
  enabled,
  onToggle,
  className,
}: DestinationCardProps) {
  const config = platformConfig[platform]
  const statusConfig = statusStyles[status]
  const Icon = config.icon

  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-[8px] bg-surface border border-border",
      className
    )}>
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-[6px]"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <Icon className="w-5 h-5" style={{ color: config.color }} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">
            {config.name}
          </span>
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex px-2 py-0.5 text-xs border",
              status === "disabled" ? "rounded-full" : "rounded border",
              statusConfig.badge
            )}>
              {statusConfig.text}
            </span>
            {status === "connected" && (
              <span className="text-xs text-text-secondary font-mono">
                {viewers.toLocaleString()} viewers
              </span>
            )}
          </div>
        </div>
      </div>
      <Switch
        checked={enabled && status === "connected"}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-[#333333]"
      />
    </div>
  )
}
