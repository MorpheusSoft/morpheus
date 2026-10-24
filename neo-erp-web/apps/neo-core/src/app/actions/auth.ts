"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { resolveDomain, sanitizeCallbackUrl, extractHostname, isQaHost } from "@/lib/domain"

async function requestBackendToken(username: string, password: string, reqHost?: string) {
  const hostname = extractHostname(reqHost || "")
  const candidates: string[] = []

  // Si estamos en entorno QA (*.qa.morpheussoft.net), SIEMPRE conectar exclusivamente al backend de QA (8100)
  if (isQaHost(hostname)) {
    if (process.env.INTERNAL_API_URL) {
      candidates.push(process.env.INTERNAL_API_URL.replace(/\/+$/, ""))
    }
    candidates.push("http://127.0.0.1:8100/api/v1")
    candidates.push("https://api.qa.morpheussoft.net/api/v1")
  } else {
    // Producción Catania / Morpheus / Desarrollo
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
    const rawCallbackUrl = (formData.get("callbackUrl") as string) || "/dashboard"

    const headerList = await headers()
    const host = headerList.get("x-forwarded-host") || headerList.get("host") || ""
    const domainConfig = resolveDomain(host)
    callbackUrl = sanitizeCallbackUrl(rawCallbackUrl, host)

    if (!email || !password) {
      return { error: "Por favor ingrese su correo y contraseña." }
    }

    const authResult = await requestBackendToken(email, password, host)
    if (!authResult.ok || !authResult.data) {
      return { error: authResult.error || "Error de inicio de sesión." }
    }

    const data = authResult.data
    const cookieStore = await cookies()
    const isHttps = domainConfig.protocol === "https"

    cookieStore.set("access_token", data.access_token, {
      httpOnly: false,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      domain: domainConfig.cookieDomain,
      maxAge: 60 * 30, // 30 mins
    })

  } catch (err: any) {
    console.error("LOGIN ACTION ERROR:", err)
    return { error: `Error al procesar acceso: ${err.message}` }
  }

  redirect(callbackUrl)
}

export async function logoutAction() {
  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || ""
  const domainConfig = resolveDomain(host)
  const cookieStore = await cookies()
  const isHttps = domainConfig.protocol === "https"

  if (domainConfig.cookieDomain) {
    cookieStore.set("access_token", "", {
      httpOnly: false,
      secure: isHttps,
      sameSite: "lax",
      maxAge: 0,
      expires: new Date(0),
      domain: domainConfig.cookieDomain,
      path: "/"
    })
  } else {
    cookieStore.set("access_token", "", {
      httpOnly: false,
      secure: isHttps,
      sameSite: "lax",
      maxAge: 0,
      expires: new Date(0),
      path: "/"
    })
  }
  redirect("/login?logout=1")
}
