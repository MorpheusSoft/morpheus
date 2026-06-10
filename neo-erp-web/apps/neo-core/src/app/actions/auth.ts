"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function loginAction(prevState: any, formData: FormData) {
  try {
    console.log("LOGIN ACTION TRIGGERED WITH:", formData.get("email"))
    const email = (formData.get("email") as string).trim()
    const password = (formData.get("password") as string).trim()
    const callbackUrl = formData.get("callbackUrl") as string || "/dashboard"

    let apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.qa.morpheussoft.net/api/v1"
    if (apiUrl.endsWith("/")) apiUrl = apiUrl.slice(0, -1)
    
    console.log(`Fetching from: ${apiUrl}/login/access-token`)
    const res = await fetch(`${apiUrl}/login/access-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        username: email,
        password: password,
      }),
    })

    console.log(`Fetch returned status: ${res.status}`)

    if (!res.ok) {
      const errorText = await res.text()
      console.log("Fetch failed with body:", errorText)
      return { error: `HTTP ${res.status}: ${errorText.substring(0, 50)}` }
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
  } catch (err: any) {
    console.error("LOGIN ACTION ERROR:", err)
    return { error: `EXCEPTION: ${err.message}` }
  }
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
