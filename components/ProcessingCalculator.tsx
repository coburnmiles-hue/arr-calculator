'use client'

import { useState } from 'react'

interface CardBreakdownData {
  volume: number
  rate: number
  perTransactionFee: number
}

interface ExtractedData {
  totalVolume: number
  totalInterchange: number
  totalFees: number
  perTransactionRate: number
  currentProcessingMethod: string
  cardBreakdown: {
    visa: CardBreakdownData
    mastercard: CardBreakdownData
    amex: CardBreakdownData
    discover: CardBreakdownData
  }
}

export default function ProcessingCalculator() {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [selectedPricingModel, setSelectedPricingModel] = useState<string>('interchange_plus')
  
  // Tiered pricing inputs
  const [tieredCheckCardRate, setTieredCheckCardRate] = useState<string>('')
  const [tieredQualifiedRate, setTieredQualifiedRate] = useState<string>('')
  const [tieredMidQualifiedRate, setTieredMidQualifiedRate] = useState<string>('')
  const [tieredNonQualifiedRate, setTieredNonQualifiedRate] = useState<string>('')
  const [tieredPerTransactionFee, setTieredPerTransactionFee] = useState<string>('')
  
  // Flat pricing inputs
  const [flatRate, setFlatRate] = useState<string>('')
  const [flatPerTransactionFee, setFlatPerTransactionFee] = useState<string>('')
  
  // Dual pricing input
  const [dualPricingRate, setDualPricingRate] = useState<string>('')
  
  // Interchange Plus inputs
  const [interchangePlusMarkup, setInterchangePlusMarkup] = useState<string>('')
  const [interchangePlusPerTransactionFee, setInterchangePlusPerTransactionFee] = useState<string>('')

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  // Estimate interchange costs based on typical card mix
  const estimateInterchangeCosts = (totalVolume: number, estimatedTransactions: number) => {
    // Card mix breakdown:
    // 60% basic debit: 1.19% + $0.12 per transaction
    // 15% basic credit: 2.35% + $0.10 per transaction
    // 15% consumer credit: 2.5% + $0.08 per transaction
    // 10% rewards credit: 2.8% + $0.12 per transaction
    
    const basicDebitVolume = totalVolume * 0.60
    const basicCreditVolume = totalVolume * 0.15
    const consumerCreditVolume = totalVolume * 0.15
    const rewardsCreditVolume = totalVolume * 0.10
    
    const basicDebitTransactions = estimatedTransactions * 0.60
    const basicCreditTransactions = estimatedTransactions * 0.15
    const consumerCreditTransactions = estimatedTransactions * 0.15
    const rewardsCreditTransactions = estimatedTransactions * 0.10
    
    const basicDebitCost = (basicDebitVolume * 0.0119) + (basicDebitTransactions * 0.12)
    const basicCreditCost = (basicCreditVolume * 0.0235) + (basicCreditTransactions * 0.10)
    const consumerCreditCost = (consumerCreditVolume * 0.025) + (consumerCreditTransactions * 0.08)
    const rewardsCreditCost = (rewardsCreditVolume * 0.028) + (rewardsCreditTransactions * 0.12)
    
    const totalInterchangeCost = basicDebitCost + basicCreditCost + consumerCreditCost + rewardsCreditCost
    
    return {
      totalInterchangeCost,
      breakdown: {
        basicDebit: basicDebitCost,
        basicCredit: basicCreditCost,
        consumerCredit: consumerCreditCost,
        rewardsCredit: rewardsCreditCost
      }
    }
  }

  // Calculate projected costs based on new pricing model
  const calculateNewCosts = () => {
    if (!extractedData) return null

    const { totalVolume, totalInterchange, cardBreakdown } = extractedData
    
    // Estimate number of transactions (using average transaction size from volume)
    // Assume average ticket of $45 for restaurant (industry standard)
    const estimatedTransactions = Math.round(totalVolume / 45)
    
    // Calculate estimated interchange costs
    const interchangeEstimate = estimateInterchangeCosts(totalVolume, estimatedTransactions)

    switch (selectedPricingModel) {
      case 'interchange_plus': {
        const markup = parseFloat(interchangePlusMarkup) || 0
        const perTxnFee = parseFloat(interchangePlusPerTransactionFee) || 0
        
        // New cost = interchange + (markup % of volume) + (per-txn fee × transactions)
        const markupCost = totalVolume * (markup / 100)
        const transactionFeeCost = perTxnFee * estimatedTransactions
        const totalNewCost = totalInterchange + markupCost + transactionFeeCost
        
        return {
          totalCost: totalNewCost,
          effectiveRate: (totalNewCost / totalVolume) * 100,
          estimatedInterchange: interchangeEstimate.totalInterchangeCost,
          profit: markupCost + transactionFeeCost,
          breakdown: {
            interchange: totalInterchange,
            markup: markupCost,
            transactionFees: transactionFeeCost
          }
        }
      }

      case 'flat': {
        const rate = parseFloat(flatRate) || 0
        const perTxnFee = parseFloat(flatPerTransactionFee) || 0
        
        const rateCost = totalVolume * (rate / 100)
        const transactionFeeCost = perTxnFee * estimatedTransactions
        const totalNewCost = rateCost + transactionFeeCost
        
        return {
          totalCost: totalNewCost,
          effectiveRate: (totalNewCost / totalVolume) * 100,
          estimatedInterchange: interchangeEstimate.totalInterchangeCost,
          profit: totalNewCost - interchangeEstimate.totalInterchangeCost,
          breakdown: {
            rateCost: rateCost,
            transactionFees: transactionFeeCost
          }
        }
      }

      case 'dual_pricing': {
        const rate = parseFloat(dualPricingRate) || 0
        const totalNewCost = totalVolume * (rate / 100)
        
        return {
          totalCost: totalNewCost,
          effectiveRate: rate,
          estimatedInterchange: interchangeEstimate.totalInterchangeCost,
          profit: totalNewCost - interchangeEstimate.totalInterchangeCost,
          breakdown: {
            cardRate: totalNewCost
          }
        }
      }

      case 'tiered': {
        const checkCardRate = parseFloat(tieredCheckCardRate) || 0
        const qualifiedRate = parseFloat(tieredQualifiedRate) || 0
        const midQualifiedRate = parseFloat(tieredMidQualifiedRate) || 0
        const nonQualifiedRate = parseFloat(tieredNonQualifiedRate) || 0
        const perTxnFee = parseFloat(tieredPerTransactionFee) || 0
        
        // Categorize cards into tiers (typical restaurant mix)
        const visaMcVolume = cardBreakdown.visa.volume + cardBreakdown.mastercard.volume
        
        // Check Card: 40% of Visa/MC (debit cards)
        const checkCardVolume = visaMcVolume * 0.40
        // Qualified: 30% of Visa/MC (basic credit)
        const qualifiedVolume = visaMcVolume * 0.30
        // Mid-Qualified: 20% of Visa/MC (rewards credit)
        const midQualifiedVolume = visaMcVolume * 0.20
        // Non-Qualified: 10% of Visa/MC + all Amex and Discover
        const nonQualifiedVolume = visaMcVolume * 0.10 + cardBreakdown.amex.volume + cardBreakdown.discover.volume
        
        const checkCardCost = checkCardVolume * (checkCardRate / 100)
        const qualifiedCost = qualifiedVolume * (qualifiedRate / 100)
        const midQualifiedCost = midQualifiedVolume * (midQualifiedRate / 100)
        const nonQualifiedCost = nonQualifiedVolume * (nonQualifiedRate / 100)
        const transactionFeeCost = perTxnFee * estimatedTransactions
        
        const totalNewCost = checkCardCost + qualifiedCost + midQualifiedCost + nonQualifiedCost + transactionFeeCost
        
        return {
          totalCost: totalNewCost,
          effectiveRate: (totalNewCost / totalVolume) * 100,
          estimatedInterchange: interchangeEstimate.totalInterchangeCost,
          profit: totalNewCost - interchangeEstimate.totalInterchangeCost,
          breakdown: {
            checkCard: checkCardCost,
            qualified: qualifiedCost,
            midQualified: midQualifiedCost,
            nonQualified: nonQualifiedCost,
            transactionFees: transactionFeeCost
          },
          tierVolumes: {
            checkCardVolume,
            qualifiedVolume,
            midQualifiedVolume,
            nonQualifiedVolume
          }
        }
      }

      default:
        return null
    }
  }

  // Calculate weighted average processing rate from card-specific rates
  const calculateProcessingRate = () => {
    if (!extractedData) return 0
    
    const { cardBreakdown, totalVolume } = extractedData
    const weightedRate = (
      (cardBreakdown.visa.rate * cardBreakdown.visa.volume) +
      (cardBreakdown.mastercard.rate * cardBreakdown.mastercard.volume) +
      (cardBreakdown.amex.rate * cardBreakdown.amex.volume) +
      (cardBreakdown.discover.rate * cardBreakdown.discover.volume)
    ) / totalVolume
    
    return weightedRate * 100
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
          
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Volume</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {formatCurrency(extractedData.totalVolume)}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Current Processing Method</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {extractedData.currentProcessingMethod}
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Processing Spent</p>
              <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                {formatCurrency(extractedData.totalFees)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                this month
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">True Effective Rate</p>
              <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                {((extractedData.totalFees / extractedData.totalVolume) * 100).toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formatCurrency(extractedData.totalFees)} total fees
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Processing Rate</p>
              <p className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
                {calculateProcessingRate().toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                weighted average of card rates
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Per Transaction Rate</p>
              <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(extractedData.perTransactionRate)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                per transaction
              </p>
            </div>
          </div>

          {/* Card Breakdown */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Card Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(extractedData.cardBreakdown).map(([card, data]) => (
                <div key={card} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 dark:text-gray-400 uppercase mb-2 font-semibold">{card}</p>
                  <div className="space-y-1">
                    <div>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(data.volume)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {((data.volume / extractedData.totalVolume) * 100).toFixed(1)}% of volume
                      </p>
                    </div>
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Rate</p>
                      <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                        {(data.rate * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Per Transaction</p>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(data.perTransactionFee)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Rate Analysis */}
      {extractedData && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            New Rate Analysis
          </h2>
          
          <div className="mb-6">
            <label htmlFor="pricing-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Pricing Model
            </label>
            <select
              id="pricing-model"
              value={selectedPricingModel}
              onChange={(e) => setSelectedPricingModel(e.target.value)}
              className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="interchange_plus">Interchange Plus</option>
              <option value="flat">Flat</option>
              <option value="tiered">Tiered</option>
              <option value="dual_pricing">Dual Pricing</option>
            </select>
          </div>

          {/* Interchange Plus Inputs */}
          {selectedPricingModel === 'interchange_plus' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Enter Your Rates</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Markup Percentage (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 0.25"
                    value={interchangePlusMarkup}
                    onChange={(e) => setInterchangePlusMarkup(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Per Transaction Fee ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 0.10"
                    value={interchangePlusPerTransactionFee}
                    onChange={(e) => setInterchangePlusPerTransactionFee(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Flat Rate Inputs */}
          {selectedPricingModel === 'flat' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Enter Your Rates</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Flat Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 2.50"
                    value={flatRate}
                    onChange={(e) => setFlatRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Per Transaction Fee ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 0.10"
                    value={flatPerTransactionFee}
                    onChange={(e) => setFlatPerTransactionFee(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Dual Pricing Input */}
          {selectedPricingModel === 'dual_pricing' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Enter Your Rate</h3>
              <div className="max-w-md">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Card Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g., 3.50"
                  value={dualPricingRate}
                  onChange={(e) => setDualPricingRate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This is the discount rate charged for card payments (cash discount model)
                </p>
              </div>
            </div>
          )}

          {/* Tiered Pricing Inputs */}
          {selectedPricingModel === 'tiered' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Enter Your Rates</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Cards will be automatically categorized into tiers based on typical restaurant processing patterns
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Check Card Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 1.50"
                    value={tieredCheckCardRate}
                    onChange={(e) => setTieredCheckCardRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Qualified Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 2.00"
                    value={tieredQualifiedRate}
                    onChange={(e) => setTieredQualifiedRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mid-Qualified Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 2.50"
                    value={tieredMidQualifiedRate}
                    onChange={(e) => setTieredMidQualifiedRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Non-Qualified Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 3.50"
                    value={tieredNonQualifiedRate}
                    onChange={(e) => setTieredNonQualifiedRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Per Transaction Fee ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 0.10"
                    value={tieredPerTransactionFee}
                    onChange={(e) => setTieredPerTransactionFee(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Projected Results */}
          {(() => {
            const newCosts = calculateNewCosts()
            if (!newCosts) return null
            
            const currentCost = extractedData.totalFees
            const monthlySavings = currentCost - newCosts.totalCost
            const annualSavings = monthlySavings * 12
            const monthlyProfit = newCosts.profit
            const annualProfit = monthlyProfit * 12
            
            return (
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                  Projected Analysis
                </h3>
                
                {/* Main Metrics */}
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">New Monthly Cost</p>
                    <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(newCosts.totalCost)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {newCosts.effectiveRate.toFixed(2)}% effective rate
                    </p>
                  </div>
                  
                  <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Estimated Interchange</p>
                    <p className="text-2xl font-semibold text-orange-600 dark:text-orange-400">
                      {formatCurrency(newCosts.estimatedInterchange)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      paid to banks/card companies
                    </p>
                  </div>
                  
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Monthly Profit</p>
                    <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(monthlyProfit)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      your monthly earnings
                    </p>
                  </div>
                  
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Annual Profit (ARR)</p>
                    <p className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
                      {formatCurrency(annualProfit)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      annual recurring revenue
                    </p>
                  </div>
                </div>
                
                {/* Merchant Savings Info */}
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Merchant Savings</h4>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Current Monthly Cost</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(currentCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Monthly Savings</p>
                      <p className={`text-lg font-semibold ${monthlySavings >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {monthlySavings >= 0 ? '+' : ''}{formatCurrency(monthlySavings)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Annual Savings</p>
                      <p className={`text-lg font-semibold ${annualSavings >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {annualSavings >= 0 ? '+' : ''}{formatCurrency(annualSavings)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Profit Calculation Breakdown */}
                <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border-2 border-green-200 dark:border-green-700">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">💰 Your Profit Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 dark:text-gray-300">Merchant Pays You:</span>
                      <span className="font-semibold text-gray-900 dark:text-white text-lg">{formatCurrency(newCosts.totalCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-orange-700 dark:text-orange-400">
                      <span>You Pay Interchange:</span>
                      <span className="font-semibold text-lg">- {formatCurrency(newCosts.estimatedInterchange)}</span>
                    </div>
                    <div className="pt-2 mt-2 border-t-2 border-green-300 dark:border-green-600 flex justify-between items-center">
                      <span className="font-semibold text-green-700 dark:text-green-300">Your Monthly Profit:</span>
                      <span className="font-bold text-green-600 dark:text-green-400 text-2xl">{formatCurrency(monthlyProfit)}</span>
                    </div>
                    <div className="flex justify-between items-center text-purple-700 dark:text-purple-400">
                      <span className="font-semibold">Annual Profit (ARR):</span>
                      <span className="font-bold text-xl">{formatCurrency(annualProfit)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-3 italic">
                    *Interchange estimate based on typical restaurant card mix: 60% debit (1.19% + $0.12), 15% basic credit (2.35% + $0.10), 15% consumer credit (2.5% + $0.08), 10% rewards (2.8% + $0.12)
                  </p>
                </div>

                {/* Cost Breakdown */}
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Cost Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    {selectedPricingModel === 'interchange_plus' && newCosts.breakdown && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Interchange:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.interchange ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Markup ({interchangePlusMarkup}%):</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.markup ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Transaction Fees:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.transactionFees ?? 0)}</span>
                        </div>
                      </>
                    )}
                    
                    {selectedPricingModel === 'flat' && newCosts.breakdown && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Rate Cost ({flatRate}%):</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.rateCost ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Transaction Fees:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.transactionFees ?? 0)}</span>
                        </div>
                      </>
                    )}
                    
                    {selectedPricingModel === 'dual_pricing' && newCosts.breakdown && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Card Rate ({dualPricingRate}%):</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.cardRate ?? 0)}</span>
                      </div>
                    )}
                    
                    {selectedPricingModel === 'tiered' && newCosts.breakdown && newCosts.tierVolumes && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Check Card ({formatCurrency(newCosts.tierVolumes.checkCardVolume ?? 0)} @ {tieredCheckCardRate}%):
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.checkCard ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Qualified ({formatCurrency(newCosts.tierVolumes.qualifiedVolume ?? 0)} @ {tieredQualifiedRate}%):
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.qualified ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Mid-Qualified ({formatCurrency(newCosts.tierVolumes.midQualifiedVolume ?? 0)} @ {tieredMidQualifiedRate}%):
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.midQualified ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Non-Qualified ({formatCurrency(newCosts.tierVolumes.nonQualifiedVolume ?? 0)} @ {tieredNonQualifiedRate}%):
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.nonQualified ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Transaction Fees:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(newCosts.breakdown.transactionFees ?? 0)}</span>
                        </div>
                      </>
                    )}
                    
                    <div className="pt-2 border-t border-gray-300 dark:border-gray-600 flex justify-between font-semibold">
                      <span className="text-gray-900 dark:text-white">Total New Cost:</span>
                      <span className="text-gray-900 dark:text-white">{formatCurrency(newCosts.totalCost)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
