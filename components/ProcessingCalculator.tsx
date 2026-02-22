'use client'

import { useState, useEffect } from 'react'

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
  cardBreakdown: Record<string, CardBreakdownData>
  statementFormat?: 'card_split' | 'bundled_with_amex' | 'unknown'
}

interface SavedAnalysis {
  id: string
  accountName: string
  timestamp: Date
  extractedData: ExtractedData
  pricingModel: string
  rates: {
    tieredCheckCardRate: string
    tieredQualifiedRate: string
    tieredMidQualifiedRate: string
    tieredNonQualifiedRate: string
    tieredPerTransactionFee: string
    flatRate: string
    flatPerTransactionFee: string
    dualPricingRate: string
    interchangePlusMarkup: string
    interchangePlusPerTransactionFee: string
  }
}

export default function ProcessingCalculator() {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [selectedPricingModel, setSelectedPricingModel] = useState<string>('interchange_plus')
  
  // Account management
  const [accountName, setAccountName] = useState<string>('')
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([])
  const [showSavedAnalyses, setShowSavedAnalyses] = useState(false)
  
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

  // Load saved analyses from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('processingArAnalyses')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setSavedAnalyses(parsed)
        } catch (e) {
          console.error('Failed to load saved analyses:', e)
        }
      }
    }
  }, [])

  // Save to localStorage whenever savedAnalyses changes
  useEffect(() => {
    if (typeof window !== 'undefined' && savedAnalyses.length > 0) {
      localStorage.setItem('processingArAnalyses', JSON.stringify(savedAnalyses))
    }
  }, [savedAnalyses])

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

  const formatCardTypeName = (cardKey: string) => {
    // Format card type keys for readable display
    // e.g., "visa_mastercard_discover" -> "Visa/MC/Discover"
    //       "amex_keyed" -> "Amex (Keyed)"
    //       "amex_swipe" -> "Amex (Swipe)"
    
    // Handle bundled formats
    if (cardKey.includes('_')) {
      const parts = cardKey.split('_')
      const cards = parts.filter(p => !['swipe', 'keyed', 'online'].includes(p))
      const type = parts.find(p => ['swipe', 'keyed', 'online'].includes(p))
      
      const cardNames: Record<string, string> = {
        'visa': 'Visa',
        'mastercard': 'MC',
        'discover': 'Discover',
        'amex': 'Amex'
      }
      
      const cardDisplay = cards.map(c => cardNames[c] || c.charAt(0).toUpperCase() + c.slice(1)).join('/')
      const typeDisplay = type ? ` (${type.charAt(0).toUpperCase() + type.slice(1)})` : ''
      return cardDisplay + typeDisplay
    }
    
    // Single card types
    const cardNames: Record<string, string> = {
      'visa': '💳 Visa',
      'mastercard': '💳 Mastercard',
      'amex': '💳 American Express',
      'discover': '💳 Discover'
    }
    
    return cardNames[cardKey] || (cardKey.charAt(0).toUpperCase() + cardKey.slice(1))
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
        
        // Categorize cards into tiers - handle flexible card breakdown structure
        // Try to extract Visa/MC volumes, or estimate if bundled
        let visaMcVolume = 0
        let amexVolume = 0
        let discoverVolume = 0
        
        Object.entries(cardBreakdown).forEach(([cardKey, data]) => {
          const key = cardKey.toLowerCase()
          if (key.includes('visa') || key.includes('mastercard')) {
            visaMcVolume += data.volume
          } else if (key.includes('amex')) {
            amexVolume += data.volume
          } else if (key.includes('discover')) {
            discoverVolume += data.volume
          }
        })
        
        // If no specific cards found, proportionally estimate from total
        if (visaMcVolume === 0 && amexVolume === 0 && discoverVolume === 0) {
          // Fallback: estimate typical card mix
          visaMcVolume = totalVolume * 0.75
          amexVolume = totalVolume * 0.15
          discoverVolume = totalVolume * 0.10
        }
        
        // Check Card: 40% of Visa/MC (debit cards)
        const checkCardVolume = visaMcVolume * 0.40
        // Qualified: 30% of Visa/MC (basic credit)
        const qualifiedVolume = visaMcVolume * 0.30
        // Mid-Qualified: 20% of Visa/MC (rewards credit)
        const midQualifiedVolume = visaMcVolume * 0.20
        // Non-Qualified: 10% of Visa/MC + all Amex and Discover
        const nonQualifiedVolume = visaMcVolume * 0.10 + amexVolume + discoverVolume
        
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
    
    // Handle flexible card breakdown structure
    let totalWeightedRate = 0
    Object.entries(cardBreakdown).forEach(([_, data]) => {
      totalWeightedRate += (data.rate * data.volume)
    })
    
    const weightedRate = totalWeightedRate / totalVolume
    return weightedRate * 100
  }

  // Save current analysis
  const saveAnalysis = () => {
    if (!extractedData || !accountName.trim()) {
      alert('Please enter an account name and analyze a statement first.')
      return
    }

    const newAnalysis: SavedAnalysis = {
      id: Date.now().toString(),
      accountName: accountName.trim(),
      timestamp: new Date(),
      extractedData,
      pricingModel: selectedPricingModel,
      rates: {
        tieredCheckCardRate,
        tieredQualifiedRate,
        tieredMidQualifiedRate,
        tieredNonQualifiedRate,
        tieredPerTransactionFee,
        flatRate,
        flatPerTransactionFee,
        dualPricingRate,
        interchangePlusMarkup,
        interchangePlusPerTransactionFee
      }
    }

    setSavedAnalyses([newAnalysis, ...savedAnalyses])
    alert(`Analysis saved for ${accountName}!`)
  }

  // Load a saved analysis
  const loadAnalysis = (analysis: SavedAnalysis) => {
    setAccountName(analysis.accountName)
    setExtractedData(analysis.extractedData)
    setSelectedPricingModel(analysis.pricingModel)
    setTieredCheckCardRate(analysis.rates.tieredCheckCardRate)
    setTieredQualifiedRate(analysis.rates.tieredQualifiedRate)
    setTieredMidQualifiedRate(analysis.rates.tieredMidQualifiedRate)
    setTieredNonQualifiedRate(analysis.rates.tieredNonQualifiedRate)
    setTieredPerTransactionFee(analysis.rates.tieredPerTransactionFee)
    setFlatRate(analysis.rates.flatRate)
    setFlatPerTransactionFee(analysis.rates.flatPerTransactionFee)
    setDualPricingRate(analysis.rates.dualPricingRate)
    setInterchangePlusMarkup(analysis.rates.interchangePlusMarkup)
    setInterchangePlusPerTransactionFee(analysis.rates.interchangePlusPerTransactionFee)
    setShowSavedAnalyses(false)
  }

  // Delete a saved analysis
  const deleteAnalysis = (id: string) => {
    if (confirm('Are you sure you want to delete this analysis?')) {
      setSavedAnalyses(savedAnalyses.filter(a => a.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      {/* Account Name and Saved Analyses */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Account Information
          </h2>
          <button
            onClick={() => setShowSavedAnalyses(!showSavedAnalyses)}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 font-semibold text-sm shadow-md transition-all duration-200"
          >
            {showSavedAnalyses ? '✕' : '📂'} Saved ({savedAnalyses.length})
          </button>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <label htmlFor="account-name" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Merchant Name
            </label>
            <input
              id="account-name"
              type="text"
              placeholder="e.g., Joe's Italian Kitchen"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50"
            />
          </div>
          
          {extractedData && (
            <div className="flex items-end">
              <button
                onClick={saveAnalysis}
                disabled={!accountName.trim()}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed font-semibold shadow-md transition-all duration-200 flex items-center justify-center gap-2"
              >
                💾 Save Analysis
              </button>
            </div>
          )}
        </div>

        {/* Saved Analyses List */}
        {showSavedAnalyses && savedAnalyses.length > 0 && (
          <div className="mt-6 border-t border-gray-200 dark:border-slate-600 pt-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              📂 Saved Analyses
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {savedAnalyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-700 dark:to-slate-800 rounded-xl hover:shadow-md transition-all duration-200 border border-blue-200 dark:border-slate-600"
                >
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-white">{analysis.accountName}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(analysis.timestamp).toLocaleDateString()} • {new Date(analysis.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      💰 {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(analysis.extractedData.totalVolume)} | 
                      📊 {analysis.pricingModel.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadAnalysis(analysis)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-sm transition-all duration-200"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => deleteAnalysis(analysis.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold shadow-sm transition-all duration-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showSavedAnalyses && savedAnalyses.length === 0 && (
          <div className="mt-6 border-t border-gray-200 dark:border-slate-600 pt-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center italic">
              No saved analyses yet. Complete an analysis and save it to get started.
            </p>
          </div>
        )}
      </div>

      {/* Upload Section */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-slate-700">
        <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">
          📄 Upload Statement
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Upload processing statement pages for AI analysis
        </p>
        <div className="space-y-4">
          <div className="relative">
            <input
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-blue-600 file:to-indigo-600 file:text-white hover:file:from-blue-700 hover:file:to-indigo-700 dark:file:from-blue-500 dark:file:to-indigo-500 cursor-pointer transition-all duration-200"
            />
          </div>
          {files.length > 0 && (
            <div className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-2">
              ✓ {files.length} file{files.length !== 1 ? 's' : ''} selected
            </div>
          )}
          <button
            onClick={analyzeStatement}
            disabled={files.length === 0 || loading}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed font-semibold shadow-md transition-all duration-200 flex items-center justify-center gap-2"
          >
            {loading ? '⏳ Analyzing...' : '🚀 Analyze Statement'}
          </button>
        </div>
      </div>

      {/* Extracted Data Display */}
      {extractedData && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-slate-700">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              📊 Statement Analysis
            </h2>
            {accountName && (
              <p className="text-gray-600 dark:text-gray-400 mt-2 text-lg">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{accountName}</span>
              </p>
            )}
          </div>
          
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-600">
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Total Volume</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {formatCurrency(extractedData.totalVolume)}
              </p>
            </div>
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-600">
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Processing Method</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {extractedData.currentProcessingMethod}
              </p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-6 rounded-xl border border-blue-200 dark:border-blue-700">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Current Spend</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                {formatCurrency(extractedData.totalFees)}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
                this month
              </p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 p-6 rounded-xl border border-red-200 dark:border-red-700">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider">True Effective Rate</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
                {((extractedData.totalFees / extractedData.totalVolume) * 100).toFixed(2)}%
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
                {formatCurrency(extractedData.totalFees)} total
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 p-6 rounded-xl border border-purple-200 dark:border-purple-700">
              <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Processing Rate</p>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">
                {calculateProcessingRate().toFixed(2)}%
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 font-medium">
                weighted average
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 p-6 rounded-xl border border-green-200 dark:border-green-700">
              <p className="text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wider">Per Transaction</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                {formatCurrency(extractedData.perTransactionRate)}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">
                per transaction
              </p>
            </div>
          </div>

          {/* Card Breakdown */}
          <div>
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">💳 Card Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(extractedData.cardBreakdown).map(([card, data]) => (
                <div key={card} className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-700 dark:to-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-600 hover:shadow-md transition-all duration-200">
                  <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold tracking-wider mb-3">{formatCardTypeName(card)}</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(data.volume)}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-1">
                        {((data.volume / extractedData.totalVolume) * 100).toFixed(1)}% of volume
                      </p>
                    </div>
                    <div className="pt-3 border-t border-gray-300 dark:border-slate-600">
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Rate</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">
                        {(data.rate * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Per Transaction</p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400 mt-1">
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
      {extractedData && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-slate-700">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              📈 New Rate Analysis
            </h2>
            {accountName && (
              <p className="text-gray-600 dark:text-gray-400 mt-2 text-lg">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{accountName}</span>
              </p>
            )}
          </div>
          
          <div className="mb-8">
            <label htmlFor="pricing-model" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
              💰 Select Pricing Model
            </label>
            <select
              id="pricing-model"
              value={selectedPricingModel}
              onChange={(e) => setSelectedPricingModel(e.target.value)}
              className="w-full md:w-80 px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium bg-gray-50"
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
              <div className="mt-10 pt-8 border-t-2 border-gray-300 dark:border-slate-600">
                <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
                  💡 Projected Analysis
                </h3>
                
                {/* Main Metrics */}
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-6 rounded-xl border border-blue-200 dark:border-blue-700">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">New Monthly Cost</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                      {formatCurrency(newCosts.totalCost)}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
                      {newCosts.effectiveRate.toFixed(2)}% effective rate
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 p-6 rounded-xl border border-orange-200 dark:border-orange-700">
                    <p className="text-sm font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wider">Estimated Interchange</p>
                    <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-2">
                      {formatCurrency(newCosts.estimatedInterchange)}
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 font-medium">
                      paid to banks/networks
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 p-6 rounded-xl border border-green-200 dark:border-green-700">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wider">Monthly Profit</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                      {formatCurrency(monthlyProfit)}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">
                      your earnings
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 p-6 rounded-xl border border-purple-200 dark:border-purple-700">
                    <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Annual Profit</p>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">
                      {formatCurrency(annualProfit)}
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 font-medium">
                      ARR projection
                    </p>
                  </div>
                </div>
                
                {/* Merchant Savings Info */}
                <div className="mb-8 p-6 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-slate-700 dark:to-slate-800 rounded-xl border border-indigo-200 dark:border-slate-600">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">🎯 Merchant Savings Summary</h4>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Current Cost</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{formatCurrency(currentCost)}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Monthly Savings</p>
                      <p className={`text-2xl font-bold mt-2 ${monthlySavings >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {monthlySavings >= 0 ? '+' : ''}{formatCurrency(monthlySavings)}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Annual Savings</p>
                      <p className={`text-2xl font-bold mt-2 ${annualSavings >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {annualSavings >= 0 ? '+' : ''}{formatCurrency(annualSavings)}
                      </p>
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
