"use server"

import { revalidatePath } from "next/cache"
import { getServerApiUrl, getAuthHeaders } from "@/lib/server-api"

export async function getDigitalWorkers() {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch digital workers")
  return res.json()
}

export async function getDigitalSkills() {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/skills`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch skills catalog")
  return res.json()
}

export async function getDigitalWorker(id: number) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${id}`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch digital worker")
  return res.json()
}

export async function updateDigitalWorker(id: number, data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update digital worker")
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function toggleDigitalSkill(workerId: number, skillId: number, isEnabled: boolean, parameters?: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${workerId}/skills/${skillId}/toggle`, {
    method: "POST",
    headers,
    body: JSON.stringify({ is_enabled: isEnabled, parameters }),
  })
  if (!res.ok) throw new Error("Failed to toggle skill")
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function runDigitalWorkerNow(workerId: number) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${workerId}/run`, {
    method: "POST",
    headers,
  })
  if (!res.ok) throw new Error("Failed to execute digital worker cycle")
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function getDigitalWorkerActions(workerId: number, limit: number = 30) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${workerId}/actions?limit=${limit}`, {
    headers,
    cache: 'no-store'
  })
  if (!res.ok) throw new Error("Failed to fetch digital worker action logs")
  return res.json()
}

export async function generatePairingPin(workerId: number) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${workerId}/generate-pin`, {
    method: "POST",
    headers,
  })
  if (!res.ok) throw new Error("Failed to generate pairing PIN")
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function simulateWhatsApp(phoneNumber: string, message: string) {
  const apiUrl = await getServerApiUrl()
  const res = await fetch(`${apiUrl}/whatsapp/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number: phoneNumber, message }),
    cache: 'no-store'
  })
  if (!res.ok) throw new Error("Failed to simulate WhatsApp message")
  return res.json()
}

export async function simulateTelegram(chatId: number, text: string, agentCode: string = "DANTE_IT") {
  const apiUrl = await getServerApiUrl()
  const res = await fetch(`${apiUrl}/telegram/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, agent_code: agentCode }),
    cache: 'no-store'
  })
  if (!res.ok) throw new Error("Failed to simulate Telegram message")
  return res.json()
}

export async function getWorkerTelegramConfig(workerId: number) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${workerId}/channel-config/telegram`, {
    headers,
    cache: 'no-store'
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Error al obtener la configuración de Telegram")
  }
  return res.json()
}

export async function saveWorkerTelegramConfig(
  workerId: number,
  payload: {
    token: string
    bot_username?: string
    enabled?: boolean
    auto_register_webhook?: boolean
    custom_webhook_url?: string
  }
) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${workerId}/channel-config/telegram`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Error al guardar el token y registrar webhook en Telegram")
  }
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}

export async function testWorkerTelegramToken(workerId: number, token: string) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${workerId}/channel-config/telegram/test`, {
    method: "POST",
    headers,
    body: JSON.stringify({ token })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Error probando token con Telegram")
  }
  return res.json()
}

export async function deleteWorkerTelegramWebhook(workerId: number) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/digital-workers/${workerId}/channel-config/telegram/delete-webhook`, {
    method: "POST",
    headers
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Error al desvincular webhook de Telegram")
  }
  revalidatePath("/dashboard/digital-workers")
  return res.json()
}
