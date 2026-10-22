"use server"

import { getServerApiUrl, getAuthHeaders } from "@/lib/server-api"

export interface CoreStats {
  users: {
    total: number
    active: number
    superusers: number
  }
  facilities: {
    total: number
    active: number
  }
  companies: {
    total: number
    names: string[]
    primary: string
  }
  jobs: {
    total: number
    active: number
  }
  roles: {
    total: number
    active: number
  }
  digital_workers: {
    total: number
    active: number
  }
  nodes: {
    name: string
    active: boolean
    port: number | null
    description: string
  }[]
}

export async function getCoreStats(): Promise<CoreStats | null> {
  try {
    const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
    const res = await fetch(`${apiUrl}/dashboard/core-stats`, {
      headers,
      cache: 'no-store'
    })
    
    if (!res.ok) {
      console.error("Failed to fetch core stats:", res.status, await res.text())
      return null
    }
    
    return await res.json()
  } catch (error) {
    console.error("Error in getCoreStats action:", error)
    return null
  }
}
