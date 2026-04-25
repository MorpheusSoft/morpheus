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

export async function getRoles() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/roles/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch roles")
  return res.json()
}

export async function createRole(data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/roles/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create role")
  revalidatePath("/dashboard/roles")
  return res.json()
}

export async function updateRole(id: number, data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/roles/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update role")
  revalidatePath("/dashboard/roles")
  return res.json()
}
