"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function loginAction(prevState: any, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const callbackUrl = formData.get("callbackUrl") as string || "/dashboard"

  const res = await fetch("http://127.0.0.1:8000/api/v1/login/access-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      username: email,
      password: password,
    }),
  })

  if (!res.ok) {
    return { error: "Credenciales inválidas o acceso denegado." }
  }

  const data = await res.json()
  
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
