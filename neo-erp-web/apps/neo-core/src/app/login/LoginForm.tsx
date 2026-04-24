"use client"

import { useActionState } from "react"
import { loginAction } from "../actions/auth"

export default function LoginForm() {
  const [state, action, isPending] = useActionState(loginAction, null)

  return (
    <form action={action} className="flex flex-col space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">Correo Electrónico</label>
        <input
          name="email"
          type="email"
          required
          placeholder="admin@morpheus.com"
          className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-white transition-all placeholder:text-gray-600"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">Contraseña</label>
        <input
          name="password"
          type="password"
          required
          placeholder="••••••••"
          className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-white transition-all placeholder:text-gray-600"
        />
      </div>

      {state?.error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 text-sm text-center">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Validando...
          </div>
        ) : "Acceder al Sistema"}
      </button>
    </form>
  )
}
