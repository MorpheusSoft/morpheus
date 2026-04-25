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

export async function getFacilities() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/facilities/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch facilities")
  return res.json()
}

export async function createFacility(data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/facilities/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create facility")
  revalidatePath("/dashboard/facilities")
  return res.json()
}

export async function updateFacility(id: number, data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/facilities/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update facility")
  revalidatePath("/dashboard/facilities")
  return res.json()
}
