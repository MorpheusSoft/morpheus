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

export async function getCurrencies() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/currencies/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch currencies")
  return res.json()
}

export async function createCurrency(data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/currencies/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create currency")
  revalidatePath("/dashboard/currencies")
  return res.json()
}

export async function updateCurrency(id: number, data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/currencies/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update currency")
  revalidatePath("/dashboard/currencies")
  return res.json()
}

export async function deleteCurrency(id: number) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/currencies/${id}`, {
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
