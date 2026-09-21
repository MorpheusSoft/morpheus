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
  is_sync_paused?: boolean
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
  last_synced_sale_time: string | null
  last_stellar_sale_time: string | null
  sales_today_count: number
  sales_today_amount: number
  lag_minutes: number
  unmapped_barcodes_count: number
  active_alerts_count: number
  config: StoreAgentConfig
  last_product_sync?: string | null
  last_barcode_sync?: string | null
  last_supplier_product_sync?: string | null
  baseline_inventory_done?: boolean
  last_movement_sync?: string | null
  latest_available_version?: string
  has_update_available?: boolean
  is_sync_paused?: boolean
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
  commandType: 'FORCE_SYNC_SALES' | 'FORCE_SYNC_MASTERS' | 'SYNC_HISTORICAL' | 'SYNC_BASELINE' | 'RESTART_SERVICE' | 'UPDATE_SOFTWARE' | 'PAUSE_SYNC' | 'RESUME_SYNC',
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

export async function pauseAllStores(): Promise<{ status: string; message: string }> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/all/pause`, {
      method: "POST",
      headers,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Error pausando sedes" }))
      throw new Error(err.detail || "Error pausando sedes")
    }
    revalidatePath("/dashboard/store-sync")
    return await res.json()
  } catch (error: any) {
    console.error("Error in pauseAllStores:", error)
    throw new Error(error.message || "Error al pausar todas las sedes")
  }
}

export async function resumeAllStores(): Promise<{ status: string; message: string }> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/all/resume`, {
      method: "POST",
      headers,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Error reanudando sedes" }))
      throw new Error(err.detail || "Error reanudando sedes")
    }
    revalidatePath("/dashboard/store-sync")
    return await res.json()
  } catch (error: any) {
    console.error("Error in resumeAllStores:", error)
    throw new Error(error.message || "Error al reanudar todas las sedes")
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

export interface LocationOption {
  id: number
  name: string
  code: string
  usage?: string | null
}

export interface WarehouseOption {
  id: number
  name: string
  code: string
  locations: LocationOption[]
}

export interface StoreDepositMapping {
  id: number
  facility_id: number
  external_deposit_code: string
  external_deposit_name: string | null
  warehouse_id: number
  warehouse_name: string | null
  warehouse_code: string | null
  location_id: number
  location_name: string | null
  location_code: string | null
  affects_inventory: boolean
  is_active: boolean
  auto_discovered: boolean
  created_at: string | null
  updated_at: string | null
}

export interface FacilityDepositMappingResponse {
  facility_id: number
  facility_name: string
  mappings: StoreDepositMapping[]
  available_warehouses: WarehouseOption[]
}

export async function getStoreDepositMappings(facilityId: number): Promise<FacilityDepositMappingResponse | null> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/deposits`, {
      headers,
      cache: 'no-store'
    })
    if (!res.ok) return null
    return await res.json()
  } catch (error) {
    console.error(`Error in getStoreDepositMappings (${facilityId}):`, error)
    return null
  }
}

export async function saveStoreDepositMapping(
  facilityId: number,
  data: {
    external_deposit_code: string
    external_deposit_name?: string
    warehouse_id: number
    location_id: number
    affects_inventory?: boolean
    is_active?: boolean
  }
) {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/deposits`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Error guardando mapeo' }))
      throw new Error(err.detail || 'Error guardando mapeo de depósito')
    }
    revalidatePath('/dashboard/store-sync')
    return await res.json()
  } catch (error: any) {
    console.error(`Error in saveStoreDepositMapping (${facilityId}):`, error)
    throw new Error(error.message || 'Error al guardar el mapeo')
  }
}

export async function updateStoreDepositMapping(
  facilityId: number,
  mappingId: number,
  data: {
    external_deposit_name?: string
    warehouse_id?: number
    location_id?: number
    affects_inventory?: boolean
    is_active?: boolean
  }
) {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/deposits/${mappingId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Error actualizando mapeo' }))
      throw new Error(err.detail || 'Error actualizando mapeo de depósito')
    }
    revalidatePath('/dashboard/store-sync')
    return await res.json()
  } catch (error: any) {
    console.error(`Error in updateStoreDepositMapping (${facilityId}, ${mappingId}):`, error)
    throw new Error(error.message || 'Error al actualizar el mapeo')
  }
}

export async function deleteStoreDepositMapping(facilityId: number, mappingId: number) {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/deposits/${mappingId}`, {
      method: 'DELETE',
      headers
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Error eliminando mapeo' }))
      throw new Error(err.detail || 'Error eliminando mapeo de depósito')
    }
    revalidatePath('/dashboard/store-sync')
    return await res.json()
  } catch (error: any) {
    console.error(`Error in deleteStoreDepositMapping (${facilityId}, ${mappingId}):`, error)
    throw new Error(error.message || 'Error al eliminar el mapeo')
  }
}

