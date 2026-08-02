"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface StreamDropAlertProps {
  open: boolean
  onDismiss: () => void
}

export function StreamDropAlert({ open, onDismiss }: StreamDropAlertProps) {
  if (!open) return null

  return (
    <div
      role="alertdialog"
      aria-label="Stream dropped"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-red-950/90 backdrop-blur-sm motion-safe:animate-[pulse_1.2s_ease-in-out_infinite]"
    >
      <div className="mx-4 max-w-md space-y-5 rounded-[8px] border-2 border-red-500 bg-red-950 p-8 text-center">
        <AlertTriangle className="mx-auto h-14 w-14 text-red-400" />
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">Stream dropped</h2>
          <p className="text-sm text-red-200">
            The encoder stopped sending video. Check that OBS is still running and
            your network connection is up.
          </p>
        </div>
        <Button
          onClick={onDismiss}
          className="w-full rounded-[6px] bg-white text-red-950 hover:bg-red-100"
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}
