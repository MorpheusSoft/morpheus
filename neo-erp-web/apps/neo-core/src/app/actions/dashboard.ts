"use server"

import { cookies } from "next/headers"

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1"

async function getAuthHeaders() {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

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
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/dashboard/core-stats`, {
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
