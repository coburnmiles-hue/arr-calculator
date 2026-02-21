'use client'

import { useState } from 'react'

interface CardData {
  volume: number
  interchange: number
  percentage: number
}

interface ExtractedData {
  restaurantName: string
  monthlyVolume: number
  totalInterchange: number
  cardBreakdown: {
    visa: CardData
    mastercard:CardData
    amex: CardData
    discover: CardData
  }
}

interface PricingModel {
  name: string
  type: 'interchange_plus' | 'flat' | 'tiered' | 'dual_pricing'
}

const PRICING_MODELS: PricingModel[] = [
  { name: 'Interchange Plus', type: 'interchange_plus' },
  { name: 'Flat Rate', type: 'flat' },
  { name: 'Tiered Pricing', type: 'tiered' },
  { name: 'Dual Pricing', type: 'dual_pricing' },
]

export default function ProcessingCalculator() {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('interchange_plus')
  
  // Interchange Plus rates
  const [icPlusRate, setIcPlusRate] = useState<string>('0.30')
  const [icPlusTransaction, setIcPlusTransaction] = useState<string>('0.10')
  
  // Flat Rate
  const [flatRate, setFlatRate] = useState<string>('2.9')
  const [flatTransaction, setFlatTransaction] = useState<string>('0.30')
  
  // Tiered Rates
  const [qualifiedRate, setQualifiedRate] = useState<string>('1.5')
  const [midQualifiedRate, setMidQualifiedRate] = useState<string>('2.5')
  const [nonQualifiedRate, setNonQualifiedRate] = useState<string>('3.5')
  
  // Dual Pricing
  const [cashDiscountRate, setCashDiscountRate] = useState<string>('3.5')
  const [cardRate, setCardRate] = useState<string>('0.0')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileArray = Array.from(e.target.files)
      console.log('Files selected:', fileArray.length)
      setFiles(fileArray)
    }
  }

  const analyzeStatement = async () => {
    if (files.length === 0) return

    setLoading(true)
    const formData = new FormData()
    files.forEach((file, index) => {
      formData.append(`files`, file)
    })

    try {
      const response = await fetch('/api/analyze-statement', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      if (result.data) {
        setExtractedData(result.data)
      }
    } catch (error) {
      console.error('Error analyzing statement:', error)
      alert('Failed to analyze statement. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const calculateProfit = () => {
    if (!extractedData) return { monthlyProfit: 0, arr: 0 }

    const volume = extractedData.monthlyVolume
    const currentInterchange = extractedData.totalInterchange
    let myRevenue = 0

    switch (selectedModel) {
      case 'interchange_plus':
        // My revenue = (volume * rate%) + (transactions * fee) + interchange
        // For simplicity, assume 100 transactions per $10k volume
        const estimatedTransactions = volume / 100
        myRevenue = currentInterchange + (volume * parseFloat(icPlusRate) / 100) + (estimatedTransactions * parseFloat(icPlusTransaction))
        break

      case 'flat':
        // My revenue = volume * flat_rate%
        myRevenue = (volume * parseFloat(flatRate) / 100) + (volume / 100 * parseFloat(flatTransaction))
        break

      case 'tiered':
        // Simplified: assume 60% qualified, 30% mid, 10% non-qualified
        myRevenue = (volume * 0.6 * parseFloat(qualifiedRate) / 100) +
                    (volume * 0.3 * parseFloat(midQualifiedRate) / 100) +
                    (volume * 0.1 * parseFloat(nonQualifiedRate) / 100)
        break

      case 'dual_pricing':
        // Assume 80% card, 20% cash
        // Cash customers get discount, card customers pay full price
        myRevenue = volume * 0.8 * parseFloat(cardRate) / 100
        break
    }

    const monthlyProfit = myRevenue - currentInterchange
    const arr = monthlyProfit * 12

    return { monthlyProfit, arr, myRevenue }
  }

  const { monthlyProfit, arr, myRevenue } = calculateProfit()

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Upload Processing Statement
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Upload multiple pages of your processing statement
        </p>
        <div className="space-y-3">
          <input
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-200"
          />
          {files.length > 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {files.length} file{files.length !== 1 ? 's' : ''} selected
            </div>
          )}
          <button
            onClick={analyzeStatement}
            disabled={files.length === 0 || loading}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
          >
            {loading ? 'Analyzing...' : 'Analyze Statement'}
          </button>
        </div>
      </div>

      {/* Extracted Data Display */}
      {extractedData && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Statement Analysis
          </h2>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Restaurant</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {extractedData.restaurantName}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Monthly Volume</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(extractedData.monthlyVolume)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Current Interchange</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(extractedData.totalInterchange)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Effective Rate</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {((extractedData.totalInterchange / extractedData.monthlyVolume) * 100).toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Card Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(extractedData.cardBreakdown).map(([card, data]) => (
              <div key={card} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">{card}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {data.percentage.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">{formatCurrency(data.volume)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing Model Selection */}
      {extractedData && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Select Pricing Model
          </h2>
          <div className="grid md:grid-cols-4 gap-3 mb-6">
            {PRICING_MODELS.map((model) => (
              <button
                key={model.type}
                onClick={() => setSelectedModel(model.type)}
                className={`px-4 py-3 rounded-md font-semibold transition-colors ${
                  selectedModel === model.type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {model.name}
              </button>
            ))}
          </div>

          {/* Rate Inputs Based on Selected Model */}
          <div className="space-y-4">
            {selectedModel === 'interchange_plus' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Markup Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={icPlusRate}
                    onChange={(e) => setIcPlusRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Transaction Fee ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={icPlusTransaction}
                    onChange={(e) => setIcPlusTransaction(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            )}

            {selectedModel === 'flat' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Flat Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={flatRate}
                    onChange={(e) => setFlatRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Transaction Fee ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={flatTransaction}
                    onChange={(e) => setFlatTransaction(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            )}

            {selectedModel === 'tiered' && (
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Qualified Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={qualifiedRate}
                    onChange={(e) => setQualifiedRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mid-Qualified (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={midQualifiedRate}
                    onChange={(e) => setMidQualifiedRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Non-Qualified (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={nonQualifiedRate}
                    onChange={(e) => setNonQualifiedRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            )}

            {selectedModel === 'dual_pricing' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Card Price Markup (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cardRate}
                    onChange={(e) => setCardRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cash Discount (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cashDiscountRate}
                    onChange={(e) => setCashDiscountRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ARR Results */}
      {extractedData && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Profit Analysis
          </h2>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">My Revenue</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(myRevenue || 0)}
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Interchange Cost</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(extractedData.totalInterchange)}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Monthly Profit</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(monthlyProfit)}
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Annual Recurring Revenue</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCurrency(arr)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
