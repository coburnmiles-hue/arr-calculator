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
          <h1 className="text-5xl sm:text-6xl font-bold text-center mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
            Processing ARR Calculator
          </h1>
          <p className="text-center text-gray-600 dark:text-gray-400 text-lg">
            Analyze merchant statements and calculate your revenue opportunities
          </p>
        </div>

        <ProcessingCalculator />
      </div>
    </main>
  )
}
