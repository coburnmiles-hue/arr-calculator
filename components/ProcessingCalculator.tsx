'use client'

import { useState, useEffect } from 'react'
import {
  type ExtractedData,
  type Rates,
  type PricingModel,
  calculateModel,
  compareModels,
  currentEffectiveRate,
  cardFees,
} from '@/lib/calculations'

interface SavedAnalysis {
  id: string
  accountName: string
  timestamp: Date
  extractedData: ExtractedData
  pricingModel: string
  rates: Rates
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

  // Customer-facing mode — hides profit figures
  const [showProfit, setShowProfit] = useState<boolean>(true)

  // Load saved analyses from the database on mount
  useEffect(() => {
    const load = async () => {
      try {
        const username = localStorage.getItem('username') ?? ''
        if (!username) {
          console.log('No username in localStorage — skipping analyses load')
          return
        }
        console.log('Loading analyses for username:', username)
        const res = await fetch('/api/analyses')
        console.log('GET /api/analyses status:', res.status)
        if (!res.ok) return
        const json = await res.json()
        console.log('Analyses response:', JSON.stringify(json).slice(0, 200))
        if (json.analyses) {
          // Map DB rows to SavedAnalysis shape
          const mapped = json.analyses.map((row: any) => ({
            id: String(row.id),
            accountName: row.accountName ?? row.account_name,
            timestamp: new Date(row.createdAt ?? row.created_at),
            extractedData: row.extractedData ?? row.extracted_data,
            pricingModel: row.pricingModel ?? row.pricing_model,
            rates: row.rates
          }))
          console.log('Mapped analyses count:', mapped.length)
          setSavedAnalyses(mapped)
        }
      } catch (e) {
        console.error('Failed to load saved analyses:', e)
      }
    }
    load()
    // Re-run when the tab becomes visible again (e.g., after login redirect)
    // Using visibilitychange instead of focus so file picker dialogs don't trigger this
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

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
      } else {
        const detail = result.detail ? `\n\n${result.detail}` : ''
        alert(`Failed to analyze statement.${detail}`)
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

  const getCardLogo = (cardKey: string) => {
    // Determine primary card type from key
    let primaryCard = 'visa'
    if (cardKey.includes('mastercard') || cardKey.includes('mc')) primaryCard = 'mastercard'
    else if (cardKey.includes('amex')) primaryCard = 'amex'
    else if (cardKey.includes('discover')) primaryCard = 'discover'
    
    const logos: Record<string, JSX.Element> = {
      'visa': (
        <svg width="32" height="24" viewBox="0 0 32 24" className="inline-block mr-2">
          <rect width="32" height="24" rx="2" fill="#1A1F71" />
          <text x="50%" y="50%" textAnchor="middle" dy="0.3em" fill="white" fontSize="10" fontWeight="bold" fontFamily="Arial">VISA</text>
        </svg>
      ),
      'mastercard': (
        <svg width="32" height="24" viewBox="0 0 32 24" className="inline-block mr-2">
          <rect width="32" height="24" rx="2" fill="#EB001B" />
          <circle cx="13" cy="12" r="6" fill="#FF5F00" />
          <circle cx="19" cy="12" r="6" fill="#FFD700" opacity="0.8" />
        </svg>
      ),
      'amex': (
        <svg width="32" height="24" viewBox="0 0 32 24" className="inline-block mr-2">
          <rect width="32" height="24" rx="2" fill="#006FCF" />
          <text x="50%" y="50%" textAnchor="middle" dy="0.3em" fill="white" fontSize="10" fontWeight="bold" fontFamily="Arial">AXP</text>
        </svg>
      ),
      'discover': (
        <svg width="32" height="24" viewBox="0 0 32 24" className="inline-block mr-2">
          <rect width="32" height="24" rx="2" fill="#FF6000" />
          <circle cx="17" cy="12" r="4" fill="white" />
        </svg>
      )
    }
    
    return logos[primaryCard] || null
  }

  const formatCardTypeName = (cardKey: string) => {
    // Explicit mappings for entry-method bundled flat rate format (STEP 2b)
    const explicitNames: Record<string, string> = {
      'debit_swipe': 'Debit/Prepaid (Swipe)',
      'credit_swipe': 'Credit (Swipe/Dip/Tap)',
      'keyed': 'Card-Not-Present (Keyed)',
      'atm': 'ATM / Pin-Based Debit',
      'check_card': 'Check Card / Debit',
      'qualified': 'Qualified',
      'mid_qualified': 'Mid-Qualified',
      'non_qualified': 'Non-Qualified',
      'visa': 'Visa',
      'mastercard': 'Mastercard',
      'amex': 'American Express',
      'discover': 'Discover',
      'debit': 'Debit',
    }
    if (explicitNames[cardKey]) return explicitNames[cardKey]

    // Handle compound keys like "visa_mastercard_discover", "amex_keyed", "visa_swipe"
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
    
    return cardKey.charAt(0).toUpperCase() + cardKey.slice(1)
  }

  // Assemble current rate inputs into a Rates object for the calculation library
  const currentRates = (): Rates => ({
    tieredCheckCardRate,
    tieredQualifiedRate,
    tieredMidQualifiedRate,
    tieredNonQualifiedRate,
    tieredPerTransactionFee,
    flatRate,
    flatPerTransactionFee,
    dualPricingRate,
    interchangePlusMarkup,
    interchangePlusPerTransactionFee,
  })

  // Projected costs for the currently selected pricing model
  const calculateNewCosts = () => {
    if (!extractedData) return null
    return calculateModel(selectedPricingModel as PricingModel, currentRates(), extractedData)
  }

  // True effective rate = all fees paid / total volume (from actual statement)
  const calculateEffectiveRate = () => {
    if (!extractedData) return 0
    return currentEffectiveRate(extractedData)
  }

  // Total fees for a specific card type (rate-based + per-transaction)
  const calculateCardFees = (cardData: any) => {
    return cardFees(cardData, extractedData?.averageTicketSize)
  }

  // Save current analysis
  const saveAnalysis = async () => {
    if (!extractedData || !accountName.trim()) {
      alert('Please enter an account name and analyze a statement first.')
      return
    }

    const rates = {
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

    try {
      const username = localStorage.getItem('username') ?? ''
      const res = await fetch('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountName: accountName.trim(),
          pricingModel: selectedPricingModel,
          rates,
          extractedData
        })
      })

      if (!res.ok) {
        const err = await res.json()
        alert(`Failed to save: ${err.error}`)
        return
      }

      const json = await res.json()
      const row = json.analysis
      const newAnalysis: SavedAnalysis = {
        id: String(row.id),
        accountName: row.accountName ?? row.account_name,
        timestamp: new Date(row.createdAt ?? row.created_at),
        extractedData,
        pricingModel: selectedPricingModel,
        rates
      }
      setSavedAnalyses([newAnalysis, ...savedAnalyses])
      alert(`Analysis saved for ${accountName}!`)
    } catch (e) {
      console.error('Save failed:', e)
      alert('Failed to save analysis. Please try again.')
    }
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
  const deleteAnalysis = async (id: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) return
    try {
      const username = localStorage.getItem('username') ?? ''
      const res = await fetch(`/api/analyses/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        alert('Failed to delete analysis.')
        return
      }
      setSavedAnalyses(savedAnalyses.filter(a => a.id !== id))
    } catch (e) {
      console.error('Delete failed:', e)
      alert('Failed to delete analysis.')
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
                      {analysis.extractedData?.totalVolume ? `💰 ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(analysis.extractedData.totalVolume)} | ` : ''}
                      📊 {analysis.pricingModel.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
          
          {/* ── KEYNOTES ────────────────────────────────────── */}
          <div className="mb-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-4">Keynotes</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-600">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Processing Method</p>
                <p className="text-base font-bold text-gray-900 dark:text-white leading-tight">{extractedData.currentProcessingMethod}</p>
              </div>
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-600">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Total Processed</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(extractedData.totalVolume)}</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 p-5 rounded-xl border border-yellow-200 dark:border-yellow-700">
                <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 uppercase tracking-wider mb-2">Avg Ticket</p>
                <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                  {formatCurrency(
                    extractedData.averageTicketSize && extractedData.averageTicketSize > 0
                      ? extractedData.averageTicketSize
                      : (extractedData.transactionCount && extractedData.transactionCount > 0
                          ? extractedData.totalVolume / extractedData.transactionCount : 0)
                  )}
                </p>
                {extractedData.transactionCount ? (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">{extractedData.transactionCount.toLocaleString()} txns</p>
                ) : null}
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-5 rounded-xl border border-blue-200 dark:border-blue-700">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2">Total Spend</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(extractedData.totalFees)}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">all fees + interchange</p>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 p-5 rounded-xl border border-red-200 dark:border-red-700">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider mb-2">Effective Rate</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{calculateEffectiveRate().toFixed(2)}%</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">all-in rate</p>
              </div>
            </div>
          </div>

          {/* ── INTERCHANGE + PROCESSOR FEES ────────────────── */}
          {extractedData.totalInterchange > 0 && (
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {/* Interchange */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 p-5 rounded-xl border border-orange-200 dark:border-orange-700">
                <p className="text-sm font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400 mb-3">Interchange</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">Effective Rate</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                      {((extractedData.totalInterchange / extractedData.totalVolume) * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">Total Spend</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                      {formatCurrency(extractedData.totalInterchange)}
                    </p>
                  </div>
                </div>
              </div>
              {/* Processor Fees */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 p-5 rounded-xl border border-purple-200 dark:border-purple-700">
                <p className="text-sm font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-3">Processor Fees</p>
                {(() => {
                  const processorSpend = extractedData.totalFees - extractedData.totalInterchange
                  const processorRate = (processorSpend / extractedData.totalVolume) * 100
                  return (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Effective Rate</p>
                        <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{processorRate.toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Total Spend</p>
                        <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatCurrency(processorSpend)}</p>
                      </div>
                    </div>
                  )
                })()}
                {/* I+ extra detail */}
                {extractedData.currentProcessingMethod === 'Interchange Plus' && (extractedData.processorMarkupRate || extractedData.processorPerAuthFee) && (
                  <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700 flex gap-4 text-xs text-purple-600 dark:text-purple-400">
                    {extractedData.processorMarkupRate ? (
                      <span>{(extractedData.processorMarkupRate * 100).toFixed(2)}% markup</span>
                    ) : null}
                    {extractedData.processorPerAuthFee ? (
                      <span>{formatCurrency(extractedData.processorPerAuthFee)} per auth</span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Extraction Validation Warnings */}
          {extractedData.validationWarnings && extractedData.validationWarnings.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">🔍 Extraction Checks</h3>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider">
                  The extracted numbers didn't fully reconcile — verify against the statement before quoting
                </p>
                {extractedData.validationWarnings.map((warning, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                    <p className="text-sm text-red-800 dark:text-red-200">{warning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hidden Margin Flags */}
          {extractedData.hiddenMarginFlags && extractedData.hiddenMarginFlags.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">⚠️ Hidden Margin Detected</h3>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4 space-y-2">
                {extractedData.hiddenMarginFlags.map((flag, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span>
                    <p className="text-sm text-amber-800 dark:text-amber-200">{flag}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CARD BREAKDOWN ───────────────────────────────── */}
          <div>
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">💳 Card Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(extractedData.cardBreakdown).map(([card, data]) => {
                const isIPlus = extractedData.currentProcessingMethod === 'Interchange Plus'
                const isTiered = extractedData.currentProcessingMethod === 'Tiered Pricing'

                // Per-card interchange amount (for I+: rate is the interchange rate)
                const cardInterchangeAmt = isIPlus ? data.volume * data.rate : 0
                const cardInterchangeRate = isIPlus ? data.rate * 100 : 0

                // Per-card processor fees (for I+)
                const cardTxnCount = data.transactionCount && data.transactionCount > 0
                  ? data.transactionCount
                  : (extractedData.averageTicketSize && extractedData.averageTicketSize > 0
                      ? Math.round(data.volume / extractedData.averageTicketSize) : 0)
                const cardProcessorAmt = isIPlus
                  ? (data.volume * (extractedData.processorMarkupRate ?? 0)) + (cardTxnCount * (extractedData.processorPerAuthFee ?? 0))
                  : 0
                const cardProcessorRate = isIPlus && data.volume > 0 ? (cardProcessorAmt / data.volume) * 100 : 0

                // For non-I+: total fees from the rate on the card
                const cardTotalFees = calculateCardFees(data)
                const cardTotalRate = data.rate * 100

                return (
                  <div key={card} className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-700 dark:to-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-600 hover:shadow-md transition-all duration-200">
                    {/* Card header */}
                    <div className="flex items-center mb-3">
                      {getCardLogo(card)}
                      <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold tracking-wider">{formatCardTypeName(card)}</p>
                    </div>

                    {/* Volume */}
                    <div className="mb-3">
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(data.volume)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {((data.volume / extractedData.totalVolume) * 100).toFixed(1)}% of volume
                        {data.transactionCount ? ` · ${data.transactionCount.toLocaleString()} txns` : ''}
                        {data.averageTicketSize ? ` · ${formatCurrency(data.averageTicketSize)} avg` : ''}
                      </p>
                    </div>

                    {isIPlus ? (
                      /* I+: split into Interchange + Processor Fees */
                      <div className="space-y-2">
                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-700/50">
                          <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">Interchange</p>
                          <div className="flex justify-between items-baseline">
                            <span className="text-base font-bold text-orange-700 dark:text-orange-300">{cardInterchangeRate.toFixed(2)}%</span>
                            <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(cardInterchangeAmt)}</span>
                          </div>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-700/50">
                          <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Processor Fees</p>
                          <div className="flex justify-between items-baseline">
                            <span className="text-base font-bold text-purple-700 dark:text-purple-300">{cardProcessorRate.toFixed(2)}%</span>
                            <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">{formatCurrency(cardProcessorAmt)}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Tiered / Flat / Dual: show all-in rate + total fees */
                      <div className="space-y-2">
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700/50">
                          <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
                            {isTiered ? 'Tier Rate' : 'Rate'}
                          </p>
                          <div className="flex justify-between items-baseline">
                            <span className="text-base font-bold text-blue-700 dark:text-blue-300">{cardTotalRate.toFixed(2)}%</span>
                            {data.perTransactionFee > 0 && (
                              <span className="text-xs text-blue-500 dark:text-blue-400">+{formatCurrency(data.perTransactionFee)}/txn</span>
                            )}
                          </div>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-600/40 rounded-lg p-3 border border-gray-200 dark:border-slate-600">
                          <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Total Fees</p>
                          <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(cardTotalFees)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      {extractedData && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                📈 New Rate Analysis
              </h2>
              {accountName && (
                <p className="text-gray-600 dark:text-gray-400 mt-2 text-lg">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{accountName}</span>
                </p>
              )}
            </div>
            {/* Customer mode toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {showProfit ? 'Internal View' : 'Customer View'}
              </span>
              <button
                onClick={() => setShowProfit(!showProfit)}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none ${showProfit ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${showProfit ? 'translate-x-8' : 'translate-x-1'}`}
                />
              </button>
            </div>
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
            const monthlySavings = currentCost - newCosts.merchantCost
            const annualSavings = monthlySavings * 12
            const monthlyProfit = newCosts.profit
            const annualProfit = monthlyProfit * 12
            const monthlyResidual = (annualProfit * 0.15) / 12
            
            return (
              <div className="mt-10 pt-8 border-t-2 border-gray-300 dark:border-slate-600">
                <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
                  💡 Projected Analysis
                </h3>

                {newCosts.interchangeEstimated && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
                    ⚠️ Interchange was not found on the statement — profit figures use an estimated card mix and may vary.
                  </p>
                )}
                
                {/* Main Metrics */}
                <div className={`grid md:grid-cols-2 ${showProfit ? 'lg:grid-cols-2 xl:grid-cols-5' : 'lg:grid-cols-2'} gap-6 mb-8`}>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-6 rounded-xl border border-blue-200 dark:border-blue-700">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">New Monthly Cost</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                      {formatCurrency(newCosts.merchantCost)}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
                      vs {formatCurrency(currentCost)} current
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/30 p-6 rounded-xl border border-teal-200 dark:border-teal-700">
                    <p className="text-sm font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wider">New Effective Rate</p>
                    <p className="text-3xl font-bold text-teal-600 dark:text-teal-400 mt-2">
                      {newCosts.effectiveRate.toFixed(2)}%
                    </p>
                    <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 font-medium">
                      vs {calculateEffectiveRate().toFixed(2)}% current
                    </p>
                  </div>
                  
                  {showProfit && (
                    <>
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

                      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 p-6 rounded-xl border border-yellow-200 dark:border-yellow-700">
                        <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300 uppercase tracking-wider">Monthly Residual</p>
                        <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">
                          {formatCurrency(monthlyResidual)}
                        </p>
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 font-medium">
                          15% of annual profit ÷ 12
                        </p>
                      </div>
                    </>
                  )}
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

                {/* Side-by-side Model Comparison */}
                {(() => {
                  const comparisons = compareModels(currentRates(), extractedData)
                  if (comparisons.length < 2) return null
                  const bestProfit = Math.max(...comparisons.map(c => c.result.profit))
                  const bestSavings = Math.max(...comparisons.map(c => currentCost - c.result.merchantCost))
                  return (
                    <div className="mb-8">
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">⚖️ Model Comparison</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        All pricing models with rates entered, side by side
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b-2 border-gray-300 dark:border-slate-600 text-left">
                              <th className="py-3 pr-4 font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">Model</th>
                              <th className="py-3 pr-4 font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">Merchant Cost/mo</th>
                              <th className="py-3 pr-4 font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">Effective Rate</th>
                              <th className="py-3 pr-4 font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">Merchant Savings/mo</th>
                              {showProfit && (
                                <>
                                  <th className="py-3 pr-4 font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">Profit/mo</th>
                                  <th className="py-3 font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-xs">ARR</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {comparisons.map(({ model, label, result }) => {
                              const savings = currentCost - result.merchantCost
                              const isSelected = model === selectedPricingModel
                              return (
                                <tr
                                  key={model}
                                  className={`border-b border-gray-200 dark:border-slate-700 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                >
                                  <td className="py-3 pr-4 font-semibold text-gray-900 dark:text-white">
                                    {label}{isSelected ? ' ✓' : ''}
                                  </td>
                                  <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">{formatCurrency(result.merchantCost)}</td>
                                  <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">{result.effectiveRate.toFixed(2)}%</td>
                                  <td className={`py-3 pr-4 font-semibold ${savings >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {savings >= 0 ? '+' : ''}{formatCurrency(savings)}
                                    {savings === bestSavings && comparisons.length > 1 ? ' 🏆' : ''}
                                  </td>
                                  {showProfit && (
                                    <>
                                      <td className="py-3 pr-4 font-semibold text-gray-800 dark:text-gray-200">
                                        {formatCurrency(result.profit)}
                                        {result.profit === bestProfit && comparisons.length > 1 ? ' 🏆' : ''}
                                      </td>
                                      <td className="py-3 font-bold text-purple-600 dark:text-purple-400">{formatCurrency(result.profit * 12)}</td>
                                    </>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 italic">
                        Dual pricing shows $0 merchant cost because card fees are passed to the customer.
                      </p>
                    </div>
                  )
                })()}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
