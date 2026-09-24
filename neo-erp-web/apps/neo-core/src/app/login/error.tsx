"use client"

import { useEffect } from "react"

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Login Page Error:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-6 text-white font-sans">
      <div className="w-full max-w-[420px] bg-gray-900/80 backdrop-blur-2xl border border-gray-800 rounded-3xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-6 text-amber-400">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2 text-white">Sesión temporalmente interrumpida</h2>
        <p className="text-gray-400 text-sm mb-6">
          Se ha actualizado una versión del sistema o se agotó el tiempo de espera. Por favor, reintente iniciar sesión.
        </p>
        <button
          onClick={() => {
            window.location.href = "/login"
          }}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg transition-all"
        >
          Volver a Cargar Login
        </button>
      </div>
    </div>
  )
}
