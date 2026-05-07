const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const jsonHeaders = { "Content-Type": "application/json" }

const parseJson = async (response: Response) => {
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return response.json()
}

export const mapDestination = (d: any) => ({
  id: d.id,
  platform: d.name,
  rtmpUrl: d.rtmp_url,
  streamKey: d.stream_key,
  title: d.name,
  enabled: d.enabled,
  platformType: d.platform_type,
})

export const api = {
  // Destinations
  getDestinations: () =>
    fetch(`${API_URL}/api/destinations`).then(parseJson),
  createDestination: (data: any) =>
    fetch(`${API_URL}/api/destinations`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then(parseJson),
  updateDestination: (id: string, data: any) =>
    fetch(`${API_URL}/api/destinations/${id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then(parseJson),
  deleteDestination: (id: string) =>
    fetch(`${API_URL}/api/destinations/${id}`, { method: "DELETE" }),

  // Stream control
  getStreamStatus: () =>
    fetch(`${API_URL}/api/stream/status`).then(parseJson),
  startStream: () =>
    fetch(`${API_URL}/api/stream/start`, { method: "POST" }).then(parseJson),
  stopStream: () =>
    fetch(`${API_URL}/api/stream/stop`, { method: "POST" }).then(parseJson),

  // Analytics
  getAnalyticsLive: () =>
    fetch(`${API_URL}/api/analytics/live`).then(parseJson),
  getAnalyticsHistory: () =>
    fetch(`${API_URL}/api/analytics/history`).then(parseJson),

  // Team
  getTeam: () => fetch(`${API_URL}/api/team`).then(parseJson),
  inviteTeamMember: (data: any) =>
    fetch(`${API_URL}/api/team/invite`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then(parseJson),
  updateTeamMemberRole: (id: string, role: string) =>
    fetch(`${API_URL}/api/team/${id}/role`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ role }),
    }).then(parseJson),
  deleteTeamMember: (id: string) =>
    fetch(`${API_URL}/api/team/${id}`, { method: "DELETE" }),
}
