'use client'

import { useRouter } from 'next/navigation'
import ProcessingCalculator from '@/components/ProcessingCalculator'

export default function Home() {
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    document.cookie = 'authToken=; Max-Age=0; Path=/;'
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200 dark:bg-blue-900 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-200 dark:bg-indigo-900 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Logout Button */}
        <div className="flex justify-end mb-6">
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-all duration-200"
          >
            Sign Out
          </button>
        </div>

        {/* Header */}
        <div className="mb-12">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-sky-500 via-indigo-600 to-emerald-400 flex items-center justify-center text-white font-extrabold text-lg shadow-2xl transform -rotate-6">
                KI
              </div>

              <div className="text-left">
                <h1 className="flex items-baseline gap-4">
                  <span className="text-6xl sm:text-7xl md:text-8xl font-extrabold title-glow animated-gradient bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-300 bg-clip-text text-transparent">
                    ARR
                  </span>
                  <span className="text-2xl sm:text-3xl font-semibold text-gray-700 dark:text-gray-300 mt-2">Calculator</span>
                </h1>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">&nbsp;</p>
              </div>
            </div>
          </div>
        </div>

        <ProcessingCalculator />
      </div>
    </main>
  )
}
