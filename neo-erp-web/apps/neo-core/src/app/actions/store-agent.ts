"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1"

async function getAuthHeaders() {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

export interface StoreAgentConfig {
  id: number
  facility_id: number
  sales_interval_minutes: number
  sales_batch_size: number
  heartbeat_interval_seconds: number
  products_enabled: boolean
  barcodes_enabled: boolean
  suppliers_enabled: boolean
  categories_enabled: boolean
  sales_enabled: boolean
  historical_enabled: boolean
  config_version: number
  updated_at: string
}

export interface FacilityAgentStatus {
  facility_id: number
  facility_code: string
  facility_name: string
  is_active: boolean
  is_online: boolean
  agent_version: string | null
  last_heartbeat: string | null
  sql_server_status: string | null
  sales_today_count: number
  sales_today_amount: number
  lag_minutes: number
  unmapped_barcodes_count: number
  active_alerts_count: number
  config: StoreAgentConfig
}

export interface StoreAgentCommand {
  id: number
  facility_id: number
  command_type: string
  parameters: Record<string, any> | null
  status: 'PENDING' | 'SENT' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  created_at: string
  sent_at: string | null
  completed_at: string | null
  result_details: Record<string, any> | null
  error_message: string | null
}

export async function getStoreFacilities(): Promise<FacilityAgentStatus[]> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/facilities`, {
      headers,
      cache: 'no-store'
    })
    if (!res.ok) {
      console.error("Failed to fetch store facilities:", res.status, await res.text())
      return []
    }
    return await res.json()
  } catch (error) {
    console.error("Error in getStoreFacilities action:", error)
    return []
  }
}

export async function getStoreAgentConfig(facilityId: number): Promise<StoreAgentConfig | null> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/config`, {
      headers,
      cache: 'no-store'
    })
    if (!res.ok) return null
    return await res.json()
  } catch (error) {
    console.error(`Error in getStoreAgentConfig (${facilityId}):`, error)
    return null
  }
}

export async function updateStoreAgentConfig(facilityId: number, data: Partial<StoreAgentConfig>) {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/config`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Error actualizando configuración" }))
      throw new Error(err.detail || "Error actualizando configuración")
    }
    revalidatePath("/dashboard/store-sync")
    return await res.json()
  } catch (error: any) {
    console.error(`Error in updateStoreAgentConfig (${facilityId}):`, error)
    throw new Error(error.message || "Error al actualizar la configuración")
  }
}

export async function createStoreAgentCommand(
  facilityId: number,
  commandType: 'FORCE_SYNC_SALES' | 'FORCE_SYNC_MASTERS' | 'SYNC_HISTORICAL' | 'RESTART_SERVICE',
  parameters: Record<string, any> = {}
): Promise<StoreAgentCommand> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/commands`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        command_type: commandType,
        parameters: parameters || {}
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Error encolando comando" }))
      throw new Error(err.detail || "Error encolando comando")
    }
    revalidatePath("/dashboard/store-sync")
    return await res.json()
  } catch (error: any) {
    console.error(`Error in createStoreAgentCommand (${facilityId}):`, error)
    throw new Error(error.message || "Error al encolar el comando remoto")
  }
}

export async function getStoreAgentCommands(facilityId: number, limit: number = 20): Promise<StoreAgentCommand[]> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/commands?limit=${limit}`, {
      headers,
      cache: 'no-store'
    })
    if (!res.ok) return []
    return await res.json()
  } catch (error) {
    console.error(`Error in getStoreAgentCommands (${facilityId}):`, error)
    return []
  }
}
