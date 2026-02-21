'use client'

import { useState } from 'react'

interface Calculation {
  mrr: number
  arr: number
  customers: number
  arpu: number
  timestamp: Date
}

export default function ARRCalculator() {
  const [monthlyRevenue, setMonthlyRevenue] = useState<string>('')
  const [customerCount, setCustomerCount] = useState<string>('')
  const [calculation, setCalculation] = useState<Calculation | null>(null)

  const calculateARR = () => {
    const mrr = parseFloat(monthlyRevenue) || 0
    const customers = parseInt(customerCount) || 0
    const arr = mrr * 12
    const arpu = customers > 0 ? mrr / customers : 0

    const result: Calculation = {
      mrr,
      arr,
      customers,
      arpu,
      timestamp: new Date()
    }

    setCalculation(result)
    
    // TODO: Save to Neon database
    saveCalculation(result)
  }

  const saveCalculation = async (calc: Calculation) => {
    try {
      const response = await fetch('/api/calculations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calc),
      })
      
      if (!response.ok) {
        console.error('Failed to save calculation')
      }
    } catch (error) {
      console.error('Error saving calculation:', error)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="space-y-6">
        {/* Input Section */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="mrr" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Monthly Recurring Revenue (MRR)
            </label>
            <input
              id="mrr"
              type="number"
              value={monthlyRevenue}
              onChange={(e) => setMonthlyRevenue(e.target.value)}
              placeholder="5000"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="customers" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Number of Customers
            </label>
            <input
              id="customers"
              type="number"
              value={customerCount}
              onChange={(e) => setCustomerCount(e.target.value)}
              placeholder="50"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        <button
          onClick={calculateARR}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-md transition-colors"
        >
          Calculate ARR
        </button>

        {/* Results Section */}
        {calculation && (
          <div className="mt-6 space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white border-b pb-2">
              Results
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Annual Recurring Revenue</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(calculation.arr)}
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Monthly Recurring Revenue</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(calculation.mrr)}
                </p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Average Revenue Per User</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {formatCurrency(calculation.arpu)}
                </p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Customers</p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                  {calculation.customers.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
