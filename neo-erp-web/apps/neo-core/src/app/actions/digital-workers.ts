"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

const API_URL = "http://127.0.0.1:8000/api/v1"

async function getAuthHeaders() {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

export async function getDigitalWorkers() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/digital-workers/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch digital workers")
  return res.json()
}

export async function getDigitalSkills() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/digital-workers/skills`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch skills catalog")
  return res.json()
}

export async function getDigitalWorker(id: number) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/digital-workers/${id}`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch digital worker")
  return res.json()
}

export async function updateDigitalWorker(id: number, data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/digital-workers/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update digital worker")
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function toggleDigitalSkill(workerId: number, skillId: number, isEnabled: boolean, parameters?: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/digital-workers/${workerId}/skills/${skillId}/toggle`, {
    method: "POST",
    headers,
    body: JSON.stringify({ is_enabled: isEnabled, parameters }),
  })
  if (!res.ok) throw new Error("Failed to toggle skill")
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function runDigitalWorkerNow(workerId: number) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/digital-workers/${workerId}/run`, {
    method: "POST",
    headers,
  })
  if (!res.ok) throw new Error("Failed to execute digital worker cycle")
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function getDigitalWorkerActions(workerId: number, limit: number = 30) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/digital-workers/${workerId}/actions?limit=${limit}`, {
    headers,
    cache: 'no-store'
  })
  if (!res.ok) throw new Error("Failed to fetch digital worker action logs")
  return res.json()
}

export async function generatePairingPin(workerId: number) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/digital-workers/${workerId}/generate-pin`, {
    method: "POST",
    headers,
  })
  if (!res.ok) throw new Error("Failed to generate pairing PIN")
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function simulateWhatsApp(phoneNumber: string, message: string) {
  const res = await fetch(`${API_URL}/whatsapp/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number: phoneNumber, message }),
    cache: 'no-store'
  })
  if (!res.ok) throw new Error("Failed to simulate WhatsApp message")
  return res.json()
}
