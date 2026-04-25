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

export async function getJobs() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/jobs/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch jobs")
  return res.json()
}

export async function updateJob(jobCode: string, data: any) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}/jobs/${jobCode}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update job")
  revalidatePath("/dashboard/jobs")
  return res.json()
}
