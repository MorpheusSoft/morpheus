"use server"

import { revalidatePath } from "next/cache"
import { getServerApiUrl, getAuthHeaders } from "@/lib/server-api"

export async function getCompanies() {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/companies/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch companies")
  return res.json()
}

export async function createCompany(data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/companies/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create company")
  revalidatePath("/dashboard/companies")
  return res.json()
}

export async function updateCompany(id: number, data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/companies/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update company")
  revalidatePath("/dashboard/companies")
  return res.json()
}
