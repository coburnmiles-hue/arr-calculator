import ARRCalculator from '@/components/ARRCalculator'

export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-900 dark:text-white">
          ARR Calculator
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
          Calculate and track your Annual Recurring Revenue metrics
        </p>
        <ARRCalculator />
      </div>
    </main>
  )
}
