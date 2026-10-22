"use server"

import { revalidatePath } from "next/cache"
import { getServerApiUrl, getAuthHeaders } from "@/lib/server-api"

export async function getRoles() {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/roles/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch roles")
  return res.json()
}

export async function createRole(data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/roles/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create role")
  revalidatePath("/dashboard/roles")
  return res.json()
}

export async function updateRole(id: number, data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/roles/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update role")
  revalidatePath("/dashboard/roles")
  return res.json()
}
