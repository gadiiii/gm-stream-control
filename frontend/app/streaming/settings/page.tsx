"use client"

import { useState } from "react"
import { useAuth } from "@/components/streaming/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { 
  LogOut, 
  Save, 
  Server, 
  Bell, 
  Shield,
  RefreshCw,
  Loader2
} from "lucide-react"

interface Settings {
  serverUrl: string
  wsUrl: string
  thumbnailRefreshInterval: number
  autoReconnect: boolean
  notifyOnDisconnect: boolean
  notifyOnViewerMilestone: boolean
  requireConfirmStop: boolean
}

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    serverUrl: "http://localhost:8000",
    wsUrl: "ws://localhost:8000/api/stream/ws",
    thumbnailRefreshInterval: 10,
    autoReconnect: true,
    notifyOnDisconnect: true,
    notifyOnViewerMilestone: false,
    requireConfirmStop: true,
  })

  const handleSave = async () => {
    setIsSaving(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 800))
    setIsSaving(false)
  }

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-text-primary tracking-wide">
            SETTINGS
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Configure your streaming control panel
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px] gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Account Section */}
      <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Account</h2>
        </div>
        
        <div className="flex items-center justify-between py-3 border-b border-border">
          <div>
            <p className="text-sm font-medium text-text-primary">{user?.name}</p>
            <p className="text-sm font-mono text-text-secondary">{user?.email}</p>
          </div>
          <span className="inline-flex px-2.5 py-0.5 text-xs rounded-full bg-accent-muted text-accent uppercase">
            {user?.role}
          </span>
        </div>

        <Button
          variant="outline"
          onClick={logout}
          className="border-border text-text-secondary hover:text-red-400 hover:border-red-400/50 rounded-[6px] gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>

      {/* Server Configuration */}
      <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Server Configuration</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              API Server URL
            </label>
            <Input
              value={settings.serverUrl}
              onChange={(e) => updateSetting("serverUrl", e.target.value)}
              className="bg-elevated border-border text-text-primary font-mono text-sm rounded-[6px]"
              placeholder="http://localhost:8000"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              WebSocket URL
            </label>
            <Input
              value={settings.wsUrl}
              onChange={(e) => updateSetting("wsUrl", e.target.value)}
              className="bg-elevated border-border text-text-primary font-mono text-sm rounded-[6px]"
              placeholder="ws://localhost:8000/api/stream/ws"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Thumbnail Refresh Interval (seconds)
            </label>
            <Input
              type="number"
              min={5}
              max={60}
              value={settings.thumbnailRefreshInterval}
              onChange={(e) => updateSetting("thumbnailRefreshInterval", parseInt(e.target.value) || 10)}
              className="bg-elevated border-border text-text-primary font-mono text-sm rounded-[6px] w-24"
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-text-primary">Auto-reconnect</p>
              <p className="text-xs text-text-tertiary">
                Automatically reconnect to WebSocket on disconnect
              </p>
            </div>
            <Switch
              checked={settings.autoReconnect}
              onCheckedChange={(checked) => updateSetting("autoReconnect", checked)}
              className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-[#333333]"
            />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Notifications</h2>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-text-primary">Disconnect Alerts</p>
              <p className="text-xs text-text-tertiary">
                Notify when a destination disconnects
              </p>
            </div>
            <Switch
              checked={settings.notifyOnDisconnect}
              onCheckedChange={(checked) => updateSetting("notifyOnDisconnect", checked)}
              className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-[#333333]"
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-text-primary">Viewer Milestones</p>
              <p className="text-xs text-text-tertiary">
                Notify at 100, 500, 1000+ viewers
              </p>
            </div>
            <Switch
              checked={settings.notifyOnViewerMilestone}
              onCheckedChange={(checked) => updateSetting("notifyOnViewerMilestone", checked)}
              className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-[#333333]"
            />
          </div>
        </div>
      </div>

      {/* Stream Controls */}
      <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Stream Controls</h2>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-text-primary">Confirm Stop Stream</p>
            <p className="text-xs text-text-tertiary">
              Require confirmation before stopping stream
            </p>
          </div>
          <Switch
            checked={settings.requireConfirmStop}
            onCheckedChange={(checked) => updateSetting("requireConfirmStop", checked)}
            className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-[#333333]"
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-[8px] bg-surface border border-red-500/30 p-6 space-y-4">
        <h2 className="text-lg font-medium text-red-400">Danger Zone</h2>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Reset All Settings</p>
            <p className="text-xs text-text-tertiary">
              Restore all settings to default values
            </p>
          </div>
          <Button
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-[6px]"
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}
