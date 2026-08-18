// Pure calculation logic for pricing model projections.
// No React, no side effects — unit-testable.

export interface CardBreakdownData {
  volume: number
  rate: number
  perTransactionFee: number
  averageTicketSize?: number
  transactionCount?: number
}

export interface ExtractedData {
  totalVolume: number
  totalInterchange: number
  totalFees: number
  perTransactionRate: number
  averageTicketSize?: number
  transactionCount?: number
  currentProcessingMethod: string
  cardBreakdown: Record<string, CardBreakdownData>
  statementFormat?: string
  processorMarkupRate?: number
  processorPerAuthFee?: number
  interchangePerTxnFee?: number
  monthlyFixedFees?: number
  otherWithholdings?: number
  hiddenMarginFlags?: string[]
  validationWarnings?: string[]
}

export interface Rates {
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

export interface ModelResult {
  /** What the merchant pays per month under the new pricing */
  merchantCost: number
  /** Merchant's all-in effective rate under the new pricing */
  effectiveRate: number
  /** Your monthly revenue (what the processor collects above card costs) */
  profit: number
  /** Interchange figure used (actual or estimated) */
  interchangeUsed: number
  /** Whether interchange was estimated rather than read from the statement */
  interchangeEstimated: boolean
  breakdown: Record<string, number>
}

export type PricingModel = 'interchange_plus' | 'flat' | 'tiered' | 'dual_pricing'

const num = (v: string | number | undefined | null): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(v ?? '')
  return Number.isFinite(n) ? n : 0
}

/** Best available transaction count: statement count → volume / avg ticket → volume / $45 fallback */
export function getTransactionCount(data: ExtractedData): { count: number; estimated: boolean } {
  if (data.transactionCount && data.transactionCount > 0) {
    return { count: data.transactionCount, estimated: false }
  }
  const avgTicket = data.averageTicketSize && data.averageTicketSize > 0 ? data.averageTicketSize : 45
  return { count: Math.round(data.totalVolume / avgTicket), estimated: true }
}

/** Fallback interchange estimate when statement interchange is unavailable */
export function estimateInterchange(totalVolume: number): number {
  return totalVolume * 0.021
}

/** Interchange to use in projections: actual from statement, else card-mix estimate */
export function getInterchange(data: ExtractedData): { amount: number; estimated: boolean } {
  if (data.totalInterchange > 0) return { amount: data.totalInterchange, estimated: false }
  return { amount: estimateInterchange(data.totalVolume), estimated: true }
}

/** Merchant's current all-in effective rate from the statement */
export function currentEffectiveRate(data: ExtractedData): number {
  if (!data.totalVolume) return 0
  return (data.totalFees / data.totalVolume) * 100
}

/** Total monthly fees for one card row (rate-based + per-transaction) */
export function cardFees(card: CardBreakdownData, fallbackAvgTicket?: number): number {
  const avgTicket = card.averageTicketSize || fallbackAvgTicket || 0
  const txns =
    card.transactionCount && card.transactionCount > 0
      ? card.transactionCount
      : avgTicket > 0
        ? card.volume / avgTicket
        : 0
  return card.volume * card.rate + (card.perTransactionFee || 0) * txns
}

export function calculateModel(
  model: PricingModel,
  rates: Rates,
  data: ExtractedData
): ModelResult | null {
  const { totalVolume, cardBreakdown } = data
  if (!totalVolume) return null

  const { count: transactions } = getTransactionCount(data)
  const interchange = getInterchange(data)

  switch (model) {
    case 'interchange_plus': {
      const markupCost = totalVolume * (num(rates.interchangePlusMarkup) / 100)
      const txnFees = num(rates.interchangePlusPerTransactionFee) * transactions
      const merchantCost = interchange.amount + markupCost + txnFees
      return {
        merchantCost,
        effectiveRate: (merchantCost / totalVolume) * 100,
        profit: markupCost + txnFees,
        interchangeUsed: interchange.amount,
        interchangeEstimated: interchange.estimated,
        breakdown: { interchange: interchange.amount, markup: markupCost, transactionFees: txnFees },
      }
    }

    case 'flat': {
      const rateCost = totalVolume * (num(rates.flatRate) / 100)
      const txnFees = num(rates.flatPerTransactionFee) * transactions
      const merchantCost = rateCost + txnFees
      return {
        merchantCost,
        effectiveRate: (merchantCost / totalVolume) * 100,
        profit: merchantCost - interchange.amount,
        interchangeUsed: interchange.amount,
        interchangeEstimated: interchange.estimated,
        breakdown: { rateCost, transactionFees: txnFees },
      }
    }

    case 'dual_pricing': {
      // Cash discount / dual pricing: the card fee is passed to the customer.
      // The processor collects rate × volume; the merchant's own cost is ~0.
      const collected = totalVolume * (num(rates.dualPricingRate) / 100)
      return {
        merchantCost: 0,
        effectiveRate: 0,
        profit: collected - interchange.amount,
        interchangeUsed: interchange.amount,
        interchangeEstimated: interchange.estimated,
        breakdown: { customerPaidFees: collected },
      }
    }

    case 'tiered': {
      const checkCardRate = num(rates.tieredCheckCardRate)
      const qualifiedRate = num(rates.tieredQualifiedRate)
      const midQualifiedRate = num(rates.tieredMidQualifiedRate)
      const nonQualifiedRate = num(rates.tieredNonQualifiedRate)
      const txnFees = num(rates.tieredPerTransactionFee) * transactions

      const hasTierNames = Object.keys(cardBreakdown).some((k) => {
        const key = k.toLowerCase()
        return (
          key.includes('check_card') ||
          key.includes('check card') ||
          key.includes('mid_qual') ||
          key.includes('non_qual') ||
          key.includes('qual')
        )
      })

      let merchantCost = txnFees
      const breakdown: Record<string, number> = { transactionFees: txnFees }

      if (hasTierNames) {
        let checkCardVolume = 0
        let qualifiedVolume = 0
        let midQualifiedVolume = 0
        let nonQualifiedVolume = 0
        Object.entries(cardBreakdown).forEach(([cardKey, d]) => {
          const key = cardKey.toLowerCase()
          if (key.includes('check_card') || key === 'debit' || key.includes('check card')) {
            checkCardVolume += d.volume
          } else if (key.includes('mid_qual') || key.includes('midqual') || key.includes('mid-qual')) {
            midQualifiedVolume += d.volume
          } else if (key.includes('non_qual') || key.includes('nonqual') || key.includes('non-qual')) {
            nonQualifiedVolume += d.volume
          } else if (key.includes('qual')) {
            qualifiedVolume += d.volume
          }
        })
        breakdown.checkCard = checkCardVolume * (checkCardRate / 100)
        breakdown.qualified = qualifiedVolume * (qualifiedRate / 100)
        breakdown.midQualified = midQualifiedVolume * (midQualifiedRate / 100)
        breakdown.nonQualified = nonQualifiedVolume * (nonQualifiedRate / 100)
        merchantCost += breakdown.checkCard + breakdown.qualified + breakdown.midQualified + breakdown.nonQualified
      } else {
        // Rank-match proposed tier rates to card volumes sorted by current rate:
        // cheapest current-rate card gets the cheapest proposed tier, etc.
        const proposedSorted = [checkCardRate, qualifiedRate, midQualifiedRate, nonQualifiedRate]
          .filter((r) => r > 0)
          .sort((a, b) => a - b)
        const cardsSorted = Object.entries(cardBreakdown)
          .filter(([, d]) => d.volume > 0)
          .sort((a, b) => a[1].rate - b[1].rate)
        cardsSorted.forEach(([key, d], i) => {
          const rate = (proposedSorted[i] ?? proposedSorted[proposedSorted.length - 1] ?? 0) / 100
          const cost = d.volume * rate
          merchantCost += cost
          breakdown[key] = cost
        })
      }

      return {
        merchantCost,
        effectiveRate: (merchantCost / totalVolume) * 100,
        profit: merchantCost - interchange.amount,
        interchangeUsed: interchange.amount,
        interchangeEstimated: interchange.estimated,
        breakdown,
      }
    }

    default:
      return null
  }
}

export const ALL_MODELS: { key: PricingModel; label: string }[] = [
  { key: 'interchange_plus', label: 'Interchange Plus' },
  { key: 'flat', label: 'Flat Rate' },
  { key: 'tiered', label: 'Tiered' },
  { key: 'dual_pricing', label: 'Dual Pricing' },
]

/** True when the user has entered at least one rate for the given model */
export function hasRatesEntered(model: PricingModel, rates: Rates): boolean {
  switch (model) {
    case 'interchange_plus':
      return num(rates.interchangePlusMarkup) > 0 || num(rates.interchangePlusPerTransactionFee) > 0
    case 'flat':
      return num(rates.flatRate) > 0 || num(rates.flatPerTransactionFee) > 0
    case 'dual_pricing':
      return num(rates.dualPricingRate) > 0
    case 'tiered':
      return (
        num(rates.tieredCheckCardRate) > 0 ||
        num(rates.tieredQualifiedRate) > 0 ||
        num(rates.tieredMidQualifiedRate) > 0 ||
        num(rates.tieredNonQualifiedRate) > 0
      )
  }
}

/** Compute every model for which rates have been entered — for side-by-side comparison */
export function compareModels(
  rates: Rates,
  data: ExtractedData
): { model: PricingModel; label: string; result: ModelResult }[] {
  return ALL_MODELS.flatMap(({ key, label }) => {
    if (!hasRatesEntered(key, rates)) return []
    const result = calculateModel(key, rates, data)
    return result ? [{ model: key, label, result }] : []
  })
}
