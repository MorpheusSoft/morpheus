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

export async function getCompanies() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/companies/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch companies")
  return res.json()
}

export async function createCompany(data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/companies/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create company")
  revalidatePath("/dashboard/companies")
  return res.json()
}

export async function updateCompany(id: number, data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/companies/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update company")
  revalidatePath("/dashboard/companies")
  return res.json()
}
