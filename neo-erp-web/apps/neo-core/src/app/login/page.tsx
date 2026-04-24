import LoginForm from "./LoginForm"

export const metadata = {
  title: "Login | Morpheus ERP"
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden font-sans">
      {/* Background ambient elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none mix-blend-screen" />

      <div className="w-full max-w-[420px] p-6 relative z-10">
        <div className="bg-gray-900/60 backdrop-blur-2xl border border-gray-800/80 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
          {/* Subtle inner border glow */}
          <div className="absolute inset-0 border border-white/5 rounded-3xl pointer-events-none"></div>

          <div className="mb-10 text-center relative z-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 mb-6 drop-shadow-xl">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-100 to-purple-200 tracking-tight mb-2">MORPHEUS</h1>
            <p className="text-gray-400 text-sm">Autenticación Segura</p>
          </div>
          
          <div className="relative z-10">
            <LoginForm />
          </div>
        </div>
        
        {/* Footer info */}
        <div className="mt-8 text-center text-gray-500 text-xs">
          <p>&copy; {new Date().getFullYear()} Morpheus Systems. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  )
}
