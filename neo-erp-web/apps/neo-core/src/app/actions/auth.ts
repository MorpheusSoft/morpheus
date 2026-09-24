"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

async function requestBackendToken(username: string, password: string) {
  // URLs de conexión en orden de prioridad:
  // 1. INTERNAL_API_URL si está definida explícitamente en el entorno
  // 2. Conexión directa interna en localhost si corre en el mismo servidor (0ms latencia, sin loopback SSL)
  // 3. NEXT_PUBLIC_API_URL como fallback público
  const candidates: string[] = []

  if (process.env.INTERNAL_API_URL) {
    candidates.push(process.env.INTERNAL_API_URL.replace(/\/+$/, ""))
  }
  candidates.push("http://127.0.0.1:8000/api/v1")

  if (process.env.NEXT_PUBLIC_API_URL) {
    const pub = process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "")
    if (!candidates.includes(pub)) {
      candidates.push(pub)
    }
  }

  let lastError: string | null = null

  for (const base of candidates) {
    try {
      const endpoint = `${base}/login/access-token`
      console.log(`[AUTH] Verificando credenciales contra: ${endpoint}`)
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username,
          password,
        }),
        signal: AbortSignal.timeout(8000), // Timeout estricto de 8s para evitar colgar al cliente
      })

      if (res.ok) {
        const data = await res.json()
        return { ok: true, data }
      }

      // Si el backend responde con error de autenticación (400, 401, 403, 422)
      if ([400, 401, 403, 422].includes(res.status)) {
        const errJson = await res.json().catch(() => null)
        const msg = errJson?.detail || "Credenciales incorrectas. Verifique su correo y contraseña."
        return { ok: false, error: msg }
      }

      const bodyText = await res.text().catch(() => "")
      lastError = `HTTP ${res.status}: ${bodyText.substring(0, 80)}`
    } catch (err: any) {
      console.warn(`[AUTH] Intento fallido con ${base}:`, err?.message || err)
      lastError = err?.message || "Tiempo de espera agotado"
    }
  }

  return {
    ok: false,
    error: `No se pudo conectar con el servicio de autenticación (${lastError || "Servidor no disponible"}).`,
  }
}

export async function loginAction(prevState: any, formData: FormData) {
  let callbackUrl = "/dashboard"
  try {
    const email = (formData.get("email") as string || "").trim()
    const password = (formData.get("password") as string || "").trim()
    callbackUrl = (formData.get("callbackUrl") as string) || "/dashboard"

    if (!email || !password) {
      return { error: "Por favor ingrese su correo y contraseña." }
    }

    const authResult = await requestBackendToken(email, password)
    if (!authResult.ok || !authResult.data) {
      return { error: authResult.error || "Error de inicio de sesión." }
    }

    const data = authResult.data
    const cookieStore = await cookies()
    const isProd = process.env.NODE_ENV === "production"

    cookieStore.set("access_token", data.access_token, {
      httpOnly: false,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      domain: isProd ? ".morpheussoft.net" : undefined,
      maxAge: 60 * 30, // 30 mins
    })

  } catch (err: any) {
    console.error("LOGIN ACTION ERROR:", err)
    return { error: `Error al procesar acceso: ${err.message}` }
  }

  redirect(callbackUrl)
}

export async function logoutAction() {
  const cookieStore = await cookies()
  const isProd = process.env.NODE_ENV === "production"
  cookieStore.set("access_token", "", {
    maxAge: 0,
    domain: isProd ? ".morpheussoft.net" : undefined,
    path: "/"
  })
  redirect("/login")
}
