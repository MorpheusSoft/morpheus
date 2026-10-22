"use server"

import { revalidatePath } from "next/cache"
import { getServerApiUrl, getAuthHeaders } from "@/lib/server-api"

export async function getJobs() {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/jobs/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch jobs")
  return res.json()
}

export async function updateJob(jobCode: string, data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/jobs/${jobCode}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to update job")
  revalidatePath("/dashboard/jobs")
  return res.json()
}

export async function runJobNow(jobCode: string) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/jobs/${jobCode}/run`, {
    method: "POST",
    headers,
  })
  if (!res.ok) throw new Error("Failed to execute job")
  revalidatePath("/dashboard/jobs")
  return res.json()
}
