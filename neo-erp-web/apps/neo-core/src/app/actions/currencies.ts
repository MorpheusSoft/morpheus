"use server"

import { revalidatePath } from "next/cache"
import { getServerApiUrl, getAuthHeaders } from "@/lib/server-api"

export async function getCurrencies() {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/currencies/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch currencies")
  return res.json()
}

export async function createCurrency(data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/currencies/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create currency")
  revalidatePath("/dashboard/currencies")
  return res.json()
}

export async function updateCurrency(id: number, data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/currencies/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update currency")
  revalidatePath("/dashboard/currencies")
  return res.json()
}

export async function deleteCurrency(id: number) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/currencies/${id}`, {
    method: "DELETE",
    headers,
  })
  if (!res.ok) {
     const error = await res.json()
     throw new Error(error.detail || "Failed to delete currency")
  }
  revalidatePath("/dashboard/currencies")
  return res.json()
}
