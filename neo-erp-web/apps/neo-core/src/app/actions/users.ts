"use server"

import { revalidatePath } from "next/cache"
import { getServerApiUrl, getAuthHeaders } from "@/lib/server-api"

export async function getUsers() {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/users/`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error("Failed to fetch users")
  return res.json()
}

export async function createUser(data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/users/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) {
     const error = await res.json()
     let errorMessage = "Failed to create user";
     if (error.detail) {
        if (Array.isArray(error.detail)) {
            errorMessage = error.detail[0].msg;
        } else {
            errorMessage = error.detail;
        }
     }
     throw new Error(errorMessage)
  }
  revalidatePath("/dashboard/users")
  return res.json()
}

export async function updateUser(id: number, data: any) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/users/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) {
     const error = await res.json()
     let errorMessage = "Failed to update user";
     if (error.detail) {
        if (Array.isArray(error.detail)) {
            errorMessage = error.detail[0].msg;
        } else {
            errorMessage = error.detail;
        }
     }
     throw new Error(errorMessage)
  }
  revalidatePath("/dashboard/users")
  return res.json()
}

export async function generateUserPairingLink(userId: number) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/users/${userId}/pairing-link`, {
    method: "POST",
    headers,
  })
  if (!res.ok) {
     const error = await res.json()
     let errorMessage = "Failed to generate pairing link";
     if (error.detail) {
        if (Array.isArray(error.detail)) {
            errorMessage = error.detail[0].msg;
        } else {
            errorMessage = error.detail;
        }
     }
     throw new Error(errorMessage)
  }
  return res.json()
}

export async function changePasswordAction(payload: { current_password: string; new_password: string }) {
  const [headers, apiUrl] = await Promise.all([getAuthHeaders(), getServerApiUrl()])
  const res = await fetch(`${apiUrl}/users/change-password`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
     const error = await res.json().catch(() => ({ detail: "Error al cambiar la contraseña" }))
     let errorMessage = "Error al cambiar la contraseña"
     if (error.detail) {
        if (Array.isArray(error.detail)) {
            errorMessage = error.detail[0].msg
        } else {
            errorMessage = error.detail
        }
     }
     throw new Error(errorMessage)
  }
  return res.json()
}
