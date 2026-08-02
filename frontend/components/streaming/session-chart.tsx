"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export interface SessionSample {
  time: string
  viewers: number
  bitrate: number
}

interface SessionChartProps {
  title: string
  unit: string
  dataKey: "viewers" | "bitrate"
  data: SessionSample[]
}

export function SessionChart({ title, unit, dataKey, data }: SessionChartProps) {
  return (
    <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
      <h2 className="text-sm font-medium text-text-secondary">{title}</h2>
      {data.length < 2 ? (
        <div className="flex h-[240px] items-center justify-center text-sm text-text-tertiary">
          Not enough samples were recorded for this session
        </div>
      ) : (
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#555555"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#2A2A2A" }}
                minTickGap={40}
              />
              <YAxis
                stroke="#555555"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#2A2A2A" }}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "#1A1A1A",
                  border: "1px solid #2A2A2A",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#888888" }}
                formatter={(value: number) => [`${value.toLocaleString()} ${unit}`, title]}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke="#E8440A"
                strokeWidth={2}
                fill="#E8440A"
                fillOpacity={0.12}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
