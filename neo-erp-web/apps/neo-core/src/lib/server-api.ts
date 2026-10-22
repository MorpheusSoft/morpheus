import { cookies, headers } from "next/headers"
import { extractHostname, isQaHost } from "./domain"

export async function getServerApiUrl(): Promise<string> {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL.replace(/\/+$/, "")
  }
  try {
    const h = await headers()
    const host = h.get("x-forwarded-host") || h.get("host") || ""
    if (isQaHost(extractHostname(host))) {
      return "http://127.0.0.1:8100/api/v1"
    }
  } catch {
    // Fuera de un request context con headers
  }
  return "http://127.0.0.1:8000/api/v1"
}

export async function getAuthHeaders() {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}
