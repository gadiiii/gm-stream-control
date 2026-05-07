"use client"

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react"
import { toast } from "sonner"

interface StreamData {
  live: boolean
  uptime_secs: number
  bitrate_kbps: number
  total_viewers: number
}

interface WebSocketContextType {
  isConnected: boolean
  streamData: StreamData | null
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  streamData: null,
})

export function useWebSocket() {
  return useContext(WebSocketContext)
}

interface WebSocketProviderProps {
  children: ReactNode
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [streamData, setStreamData] = useState<StreamData | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasShownConnectedToast = useRef(false)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
     		const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"
const ws = new WebSocket(`${wsUrl}/api/stream/ws`)
 

      ws.onopen = () => {
        setIsConnected(true)
        if (!hasShownConnectedToast.current) {
          toast.success("Connected to stream server")
          hasShownConnectedToast.current = true
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as StreamData
          setStreamData(data)
        } catch {
          // Invalid JSON, ignore
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        hasShownConnectedToast.current = false
        toast.error("Connection lost — reconnecting...")
        
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }

      wsRef.current = ws
    } catch {
      // Connection failed, retry
      reconnectTimeoutRef.current = setTimeout(() => {
        connect()
      }, 3000)
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return (
    <WebSocketContext.Provider value={{ isConnected, streamData }}>
      {children}
    </WebSocketContext.Provider>
  )
}
