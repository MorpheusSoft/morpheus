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

export async function getUsers() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/users/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch users")
  return res.json()
}

export async function createUser(data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/users/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) {
     const error = await res.json()
     throw new Error(error.detail || "Failed to create user")
  }
  revalidatePath("/dashboard/users")
  return res.json()
}

export async function updateUser(id: number, data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/users/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) {
     const error = await res.json()
     throw new Error(error.detail || "Failed to update user")
  }
  revalidatePath("/dashboard/users")
  return res.json()
}
