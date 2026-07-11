import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { verifyToken } from '@/lib/auth'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Structured output schema — forces Gemini to return exactly this shape,
// eliminating JSON parse failures and missing/misnamed fields.
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    totalVolume: { type: SchemaType.NUMBER },
    totalInterchange: { type: SchemaType.NUMBER },
    totalFees: { type: SchemaType.NUMBER },
    transactionCount: { type: SchemaType.NUMBER },
    transactionCountEstimated: { type: SchemaType.BOOLEAN },
    perTransactionRate: { type: SchemaType.NUMBER },
    averageTicketSize: { type: SchemaType.NUMBER },
    currentProcessingMethod: {
      type: SchemaType.STRING,
      enum: ['Interchange Plus', 'Flat Rate', 'Tiered Pricing', 'Dual Pricing', 'Unknown'],
      format: 'enum',
    },
    statementFormat: {
      type: SchemaType.STRING,
      enum: ['card_split', 'bundled_with_amex', 'tiered', 'unknown'],
      format: 'enum',
    },
    processorMarkupRate: { type: SchemaType.NUMBER },
    processorPerAuthFee: { type: SchemaType.NUMBER },
    interchangePerTxnFee: { type: SchemaType.NUMBER },
    monthlyFixedFees: { type: SchemaType.NUMBER },
    statementPeriod: { type: SchemaType.STRING },
    processorName: { type: SchemaType.STRING },
    hiddenMarginFlags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    cardBreakdown: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          key: { type: SchemaType.STRING },
          volume: { type: SchemaType.NUMBER },
          rate: { type: SchemaType.NUMBER },
          perTransactionFee: { type: SchemaType.NUMBER },
          transactionCount: { type: SchemaType.NUMBER },
          averageTicketSize: { type: SchemaType.NUMBER },
        },
        required: ['key', 'volume', 'rate'],
      },
    },
  },
  required: [
    'totalVolume',
    'totalInterchange',
    'totalFees',
    'transactionCount',
    'averageTicketSize',
    'currentProcessingMethod',
    'statementFormat',
    'cardBreakdown',
    'hiddenMarginFlags',
  ],
} as const

// Cross-check extracted values against each other; returns human-readable warnings.
function validateExtraction(data: any): string[] {
  const warnings: string[] = []
  const { totalVolume, totalFees, totalInterchange, transactionCount, averageTicketSize } = data

  if (!totalVolume || totalVolume <= 0) {
    warnings.push('Total volume could not be extracted — all projections will be unreliable.')
    return warnings
  }

  // Effective rate sanity: typical merchant all-in rate is 1.5%–4.5%
  const effectiveRate = totalFees / totalVolume
  if (effectiveRate > 0.06) {
    warnings.push(
      `Effective rate is ${(effectiveRate * 100).toFixed(2)}% — unusually high. Total fees may include non-processing charges or volume may be under-extracted.`
    )
  } else if (totalFees > 0 && effectiveRate < 0.008) {
    warnings.push(
      `Effective rate is ${(effectiveRate * 100).toFixed(2)}% — unusually low. Some fees may have been missed (check for a second fees page).`
    )
  }

  // Interchange should never exceed total fees
  if (totalInterchange > totalFees && totalFees > 0) {
    warnings.push(
      `Extracted interchange (${totalInterchange.toFixed(2)}) exceeds total fees (${totalFees.toFixed(2)}) — one of these is wrong.`
    )
  }

  // Interchange as share of fees: usually 60–90% on I+ statements
  if (totalInterchange > 0 && totalFees > 0) {
    const icShare = totalInterchange / totalFees
    if (data.currentProcessingMethod === 'Interchange Plus' && icShare < 0.4) {
      warnings.push(
        `Interchange is only ${(icShare * 100).toFixed(0)}% of total fees — for Interchange Plus this is usually 60–90%. Some interchange lines may have been missed.`
      )
    }
  }

  // Card breakdown volumes should roughly reconcile with total volume (±5%)
  const cb = data.cardBreakdown
  if (cb && typeof cb === 'object' && Object.keys(cb).length > 0) {
    const cardVolumeSum = Object.values(cb).reduce((s: number, c: any) => s + (c?.volume || 0), 0)
    const diff = Math.abs(cardVolumeSum - totalVolume) / totalVolume
    if (diff > 0.05) {
      warnings.push(
        `Card breakdown volumes sum to ${cardVolumeSum.toFixed(2)} but total volume is ${totalVolume.toFixed(2)} (${(diff * 100).toFixed(1)}% off) — some card volume may be missing or double-counted.`
      )
    }

    // Per-card transaction counts should roughly reconcile with total count (±10%)
    if (transactionCount > 0) {
      const cardTxnSum = Object.values(cb).reduce((s: number, c: any) => s + (c?.transactionCount || 0), 0)
      if (cardTxnSum > 0) {
        const txnDiff = Math.abs(cardTxnSum - transactionCount) / transactionCount
        if (txnDiff > 0.1) {
          warnings.push(
            `Card transaction counts sum to ${cardTxnSum} but statement total is ${transactionCount} — counts may be misread.`
          )
        }
      }
    }
  }

  // Average ticket cross-check: volume / count should match extracted avg ticket (±15%)
  if (transactionCount > 0 && averageTicketSize > 0) {
    const impliedTicket = totalVolume / transactionCount
    const ticketDiff = Math.abs(impliedTicket - averageTicketSize) / averageTicketSize
    if (ticketDiff > 0.15) {
      warnings.push(
        `Extracted average ticket ($${averageTicketSize.toFixed(2)}) doesn't match volume ÷ transactions ($${impliedTicket.toFixed(2)}) — transaction count or avg ticket may be misread.`
      )
    }
  }

  return warnings
}

export async function POST(request: NextRequest) {
  try {
    const username = verifyToken(request.cookies.get('authToken')?.value)
    if (!username) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const model = genAI.getGenerativeModel(
      { model: 'gemini-2.5-flash' },
      { apiVersion: 'v1beta' }
    )
    
    const prompt = `You are an expert payment processing analyst. Analyze these credit card processing statement images (may be multiple pages of the same statement). Extract and COMBINE all information across all pages into a single JSON response.

CRITICAL MINDSET: Processing statements are layered financial documents. Processors intentionally use vague terminology, overlapping categories, and inconsistent naming conventions. NEVER trust labels at face value — classify fees semantically, infer relationships mathematically, and compare totals against expected industry behavior.

There are three conceptual layers in every statement:
  Layer 1 — True Card Costs: Interchange + Assessments (paid to card networks and issuing banks)
  Layer 2 — Processor Markup: The processor's own revenue added on top
  Layer 3 — Fixed / Ancillary Fees: Monthly/per-item fees charged by the processor

══════════════════════════════════════════
STEP 1 — LOCATE TOTALS
══════════════════════════════════════════
Find from the statement:
  - totalVolume: total processing volume (sum all pages)
  - totalFees: total ALL fees charged (everything — interchange + markup + fixed)
  - transactionCount: exact count from the statement (do not estimate unless unavailable)
  - averageTicketSize: average sale amount in dollars

Effective Rate = totalFees / totalVolume  (the merchant's true blended cost)

══════════════════════════════════════════
STEP 2 — DETECT PRICING MODEL
══════════════════════════════════════════
Classify as one of:
  "Interchange Plus" — Signals:
    * Section titled "Interchange Charges/Program Fees" or "Interchange Detail" with individual interchange categories (e.g., VI-CPS/RESTAURANT, MC-WORLD ELITE, DSCVR PSL REST CP)
    * Lines showing "DISC RATE TIMES" or "Sales Discount" as a percentage of volume alongside interchange category line items
    * Fees labeled "Interchange charges" (base) AND separate "Service charges" (markup)
    * Processors commonly on I+: BASYS, Heartland, First Data, TSYS, Worldpay, Elavon, Gravity

  "Tiered Pricing" — Signals:
    * Multiple rate tiers: Qualified / Mid-Qualified / Non-Qualified
    * OR separate unique percentages per card network (Visa at X%, Mastercard at Y%, Amex at Z%)
    * Little or no interchange detail visible

  "Flat Rate" — Signals:
    * Single blended percentage for all cards, no interchange detail
    * OR a rate table with rows per entry method / card type (see STEP 2b below)

  "Dual Pricing" — Signals:
    * "Cash Discount" language or dual pricing tiers (one rate, one surcharge)
    * Customer fee adjustments

  "Unknown" — if none of the above can be determined

══════════════════════════════════════════
STEP 2b — ENTRY-METHOD BUNDLED FLAT RATE FORMAT
══════════════════════════════════════════
Some processors show a rate table that segments by ENTRY METHOD and CARD TYPE (not by card network).
Detect this format when ALL of these are true:
  * Rows include labels like "V/MC/D (Swipe/Dip/Tap) – Debit/Prepaid", "V/MC/D (Swipe/Dip/Tap) – Credit", "V/MC/D (Keyed)", "Amex"
  * Each row shows a flat rate (e.g., "1.75% + 0.2") — NOT interchange categories
  * There is NO interchange detail section, NO individual interchange category line items
  * A totals row shows Payments (count), Refunds, Fees, Fee Adjustments, Fees Adjusted, Net

When this format is detected, set pricingModel = "Flat Rate" and use these cardBreakdown keys:
  "debit_swipe"   — "V/MC/D (Swipe/Dip/Tap) – Debit/Prepaid" → Pin-Based / ATM debit
  "credit_swipe"  — "V/MC/D (Swipe/Dip/Tap) – Credit" → standard swiped/dipped/tapped credit
  "keyed"         — "V/MC/D (Keyed)" → manually entered card-not-present; non-qualified tier
  "amex"          — "Amex" row

CRITICAL PARSING RULES for this format:
  1. The "Rate" column shows "X% + Y" where Y is ALWAYS a per-transaction fee in DOLLARS.
     "1.75% + 0.2"  → rate: 0.0175, perTransactionFee: 0.20
     "2.91% + 0.1"  → rate: 0.0291, perTransactionFee: 0.10
     "3.5% + 0.15"  → rate: 0.035,  perTransactionFee: 0.15
     Never treat the "+Y" as a percentage — it is always cents per transaction.
  2. True fee per row = "Fees Adjusted" column (Fees + Fee Adjustments). Use this value, NOT the raw "Fees" column.
  3. totalInterchange = 0 — this format shows no interchange passthrough.
  4. transactionCount per card = the "Payments" column for that row.
  5. "V/MC/D (Keyed)" volume appears in some comparison tools reclassified under "AMEX Non-Qualified" because it shares the same rate — this is expected; extract it as "keyed" in your output.
  6. totalFees = the "Fees Adjusted" cell in the Total row (not the sum of raw "Fees" column).

══════════════════════════════════════════
STEP 3 — SEPARATE CARD COSTS FROM PROCESSOR REVENUE
══════════════════════════════════════════
Classify every fee line into two buckets. IMPORTANT: Do not assume section headers are truthful — classify each line item individually based on its semantic meaning.

A. Card Brand / Interchange Costs (Layer 1 — pass-through to card networks / issuing banks):
   Labels that indicate true card costs (mostly unavoidable):
   Interchange Charges, Program Fees, Assessments, NABU, APF, FANF,
   Visa Acquirer Processing Fee, Mastercard Network Access, Discover Data Usage,
   Amex Discount, Card Brand Fees, Debit Network Fees, Network Access Fee (when it is a
   direct pass-through of the card brand's own network access charge)

B. Processor Revenue / Markup (Layer 2 + 3 — processor profit and operational charges):
   Labels that indicate processor-added fees:
   Service Charges, Discount Rate, Transaction Fee, Authorization Fee, Auth Fee,
   Batch Fee, PCI Fee, Statement Fee, Gateway Fee, Monthly Minimum, Non-Qualified Surcharge,
   Access Fee, Platform Fee, Admin Fee, Compliance Fee, Sales Discount (when it represents
   the processor's markup percentage applied to volume)

   NOTE: Processors frequently hide margin inside fees that sound like pass-through costs.
   If a "Network Access Fee" or similar appears inflated or inconsistent with standard
   card brand pricing, flag it as suspected hidden markup.

totalInterchange = sum of Layer 1 fees
Processor Revenue = totalFees − totalInterchange

══════════════════════════════════════════
STEP 4 — INTERCHANGE PLUS: DETAILED EXTRACTION
══════════════════════════════════════════
If the pricing model is Interchange Plus, follow these specific rules:

4a. FINDING totalInterchange:
   - Look for a fee SUMMARY section that shows a line explicitly labeled "Total Interchange Charges/Program Fees" or similar.
   - Use THAT labeled total — do NOT use the grand total of the interchange detail table (they may differ because debit network fees are sometimes listed separately).
   - Also include "Total Debit Network Fees" in totalInterchange if it appears as a separate line in the fee summary — these ARE true network costs.
   - Example: "Total Interchange Charges/Program Fees: $2,716.99" → use $2,716.99.

4b. FINDING the PROCESSOR MARKUP RATE (the "+" in Interchange Plus):
   - Look for lines like "SALES DISCOUNT 0.0028 DISC RATE TIMES $120,000" — the 0.0028 is the markup rate (0.28%).
   - Look for separate debit vs. credit discount lines (e.g., "DEBIT SALES DISCOUNT 0.0028 DISC RATE TIMES...").
   - These are labeled as "Service charges" in the fee type column.
   - Also look for per-authorization fees: "WATS AUTH FEE X TRANSACTIONS AT $0.09", "NETWORK ACCESS AUTH FEE X TRANSACTIONS AT $0.0295".
   - Report as "processorMarkupRate" (e.g., 0.0028) and "processorPerAuthFee" (e.g., 0.09).

4c. FINDING the INTERCHANGE PER-TRANSACTION FEE (separate from processor per-auth):
   - Each interchange category line has a rate structure like "1.54% + $0.10" or "2.20% + $0.10".
   - The "+ $0.10" is the INTERCHANGE's own per-transaction fee charged by the card networks — SEPARATE from the processor's per-auth fee.
   - Compute the weighted average: sum(per_txn_fee × transactions_in_category) / total_transactions.
     If per-category transaction counts are unavailable, use a simple average across all visible category per-txn fees.
   - Report as "interchangePerTxnFee" (e.g., 0.08 for 8 cents). Set to 0 if not found.

4d. FINDING cardBreakdown for I+ statements:
   - Use volumes and transaction counts from the "Summary by Card Type" section.
   - Compute effective interchange rate per card as: interchange_for_card / volume_for_card
     * Find each card's interchange total in the "Interchange Charges/Program Fees" detail table.
     * Example: Visa interchange $1,082 / Visa volume $59,214 = 0.01828
   - For debit: their interchange shows $0 in the credit table; compute debit rate as (Total Debit Network Fees) / (debit volume).
   - Include "transactionCount" and "averageTicketSize" per card type from Summary by Card Type.

4e. FINDING totalTransactionCount for I+ statements:
   - Use the TOTAL row of "Summary by Card Type" → "Items" or transaction count column.
   - This is exact — do not estimate.

══════════════════════════════════════════
STEP 5 — NON-INTERCHANGE-PLUS: PER-TRANSACTION FEES
══════════════════════════════════════════
For Tiered, Flat Rate, or unknown statements:
  1. Look for sections labeled "Per Transaction", "Per Txn", "Transaction Fee", "Authorization Detail"
  2. Look for small dollar amounts next to card types (e.g., "$0.15", "$0.25", "15¢")
  3. Search for patterns like "Visa ... $0.15", "Mastercard ... $0.10"
  4. If unavailable, estimate as totalFees / transactionCount and set "perTransactionRateEstimated": true

══════════════════════════════════════════
STEP 6 — IDENTIFY HIDDEN MARGIN
══════════════════════════════════════════
Flag any fees that appear to contain concealed processor markup in "hiddenMarginFlags": an array of strings.
Common hiding spots:
  - Network access fees inflated above standard card brand pricing
  - Auth fees significantly higher than industry norm (~$0.02–$0.05 per auth for pass-through)
  - "Sales Discount" bundled with interchange rather than broken out separately
  - Non-qualified surcharges added on top of already-marked-up tiered rates
  - "Program fees" or "data usage fees" with values inconsistent with card brand published schedules
  - Any fee labeled as a pass-through but where the total does not reconcile with published card brand rates

══════════════════════════════════════════
STEP 7 — STATEMENT FORMAT
══════════════════════════════════════════
Classify the layout format as:
  "card_split": Each card network (Visa, Mastercard, Amex, Discover) has separate rows with own rates
  "bundled_with_amex": Visa/MC/Discover bundled together; Amex has separate rows
  "tiered": Organized by qualification tier (Qualified / Mid-Qual / Non-Qual)
  "unknown": Cannot be determined

══════════════════════════════════════════
RETURN THIS JSON:
══════════════════════════════════════════
{
  "totalVolume": <number — total processing volume, sum all pages>,
  "totalInterchange": <number — Layer 1 card brand costs only (see Step 3)>,
  "totalFees": <number — ALL fees combined (interchange + markup + fixed)>,
  "transactionCount": <number — exact count from statement; if unavailable estimate and set transactionCountEstimated: true>,
  "perTransactionRate": <number — avg per-transaction fee in dollars (e.g. 0.15 for 15¢), NOT a total>,
  "averageTicketSize": <number — average sale amount in dollars>,
  "currentProcessingMethod": "Interchange Plus" | "Flat Rate" | "Tiered Pricing" | "Dual Pricing" | "Unknown",
  "statementFormat": "card_split" | "bundled_with_amex" | "tiered" | "unknown",
  "processorMarkupRate": <number — I+ only: processor's markup as decimal (e.g. 0.0028); else 0>,
  "processorPerAuthFee": <number — I+ only: processor's per-auth fee in dollars (e.g. 0.09); else 0>,
  "interchangePerTxnFee": <number — I+ only: blended card-network per-txn fee in dollars (e.g. 0.08); else 0>,
  "monthlyFixedFees": <number — sum of fixed monthly fees (statement fee, PCI fee, gateway fee, monthly minimum, etc.) in dollars; 0 if none>,
  "statementPeriod": <string — the statement month/period, e.g. "March 2026"; "Unknown" if not found>,
  "processorName": <string — the processing company name from the statement header; "Unknown" if not found>,
  "hiddenMarginFlags": <array of strings — fees suspected to contain hidden processor markup>,
  "cardBreakdown": [
    {
      "key": <string — card type key, see conventions below>,
      "volume": <number>,
      "rate": <number — as decimal>,
      "perTransactionFee": <number>,
      "transactionCount": <number>,
      "averageTicketSize": <number>
    }
  ]
}

cardBreakdown "key" conventions:
  - I+ or card_split: "visa", "mastercard", "amex", "discover", "debit"
  - bundled_with_amex: "visa_mastercard_discover", "amex", "amex_keyed"
  - tiered: "check_card", "qualified", "mid_qualified", "non_qualified"
  - entry-method bundled flat rate (STEP 2b): "debit_swipe", "credit_swipe", "keyed", "amex"
  - Swipe vs Keyed differences: "visa_swipe", "visa_keyed", etc.
  - Only include card types that actually appear in the statement

IMPORTANT RULES:
  - Sum all volumes and fees across all pages
  - NEVER trust section labels alone — classify each line item semantically
  - totalFees includes EVERYTHING; totalInterchange is Layer 1 only
  - perTransactionRate is a PER-TRANSACTION average (not a total amount)
    * For I+: use processorPerAuthFee value
    * For non-I+: extract from rate schedule or estimate
  - For I+ cardBreakdown rates: effective rate = interchange_for_card / volume_for_card
  - Only return valid JSON; use 0 for unknown numbers, "Unknown" for unknown strings`

    // Convert all files to base64 and prepare for Gemini
    const imageParts = await Promise.all(
      files.map(async (file) => {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const base64 = buffer.toString('base64')

        // Normalize MIME type — Gemini requires specific values
        let mimeType = file.type
        if (!mimeType || mimeType === 'application/octet-stream') {
          const name = file.name?.toLowerCase() ?? ''
          if (name.endsWith('.pdf')) mimeType = 'application/pdf'
          else if (name.endsWith('.png')) mimeType = 'image/png'
          else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mimeType = 'image/jpeg'
          else if (name.endsWith('.webp')) mimeType = 'image/webp'
          else if (name.endsWith('.heic') || name.endsWith('.heif')) mimeType = 'image/heic'
          else mimeType = 'image/jpeg' // fallback
        }

        console.log(`File: ${file.name}, type: ${file.type}, normalized: ${mimeType}, size: ${buffer.length} bytes`)

        return {
          inlineData: {
            mimeType,
            data: base64
          }
        }
      })
    )

    // Send all images to Gemini
    console.log(`Sending ${imageParts.length} file(s) to Gemini model: ${model.model}`)
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
      generationConfig: {
        temperature: 0,          // Fully deterministic — same input → same output
        responseMimeType: 'application/json', // Force JSON output mode
        responseSchema: responseSchema as any, // Enforce exact output structure
      }
    })
    const response = await result.response
    const text = response.text()
    console.log('Gemini raw response length:', text.length)

    // With responseSchema the output is guaranteed JSON, but keep the fallback for safety
    let extractedData: any = null
    try {
      extractedData = JSON.parse(text)
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    }

    if (!extractedData) {
      throw new Error('Failed to extract data from statement')
    }

    // Convert cardBreakdown from schema array format back to keyed record
    if (Array.isArray(extractedData.cardBreakdown)) {
      const record: Record<string, any> = {}
      for (const entry of extractedData.cardBreakdown) {
        if (entry && entry.key) {
          const { key, ...rest } = entry
          record[key] = rest
        }
      }
      extractedData.cardBreakdown = record
    }

    // Post-process: ensure numeric fields and compute estimated per-transaction rate
    const data = extractedData as any
    data.averageTicketSize = data.averageTicketSize ?? 0
    data.totalVolume = data.totalVolume ?? 0
    data.totalFees = data.totalFees ?? 0
    data.processorMarkupRate = data.processorMarkupRate ?? 0
    data.processorPerAuthFee = data.processorPerAuthFee ?? 0
    data.interchangePerTxnFee = data.interchangePerTxnFee ?? 0
    data.hiddenMarginFlags = Array.isArray(data.hiddenMarginFlags) ? data.hiddenMarginFlags : []

    // Normalize numeric values if strings
    const toNum = (v: any) => {
      if (typeof v === 'number') return v
      if (typeof v === 'string') {
        const n = Number(v.replace(/[^0-9.-]+/g, ''))
        return Number.isNaN(n) ? 0 : n
      }
      return 0
    }

    data.averageTicketSize = toNum(data.averageTicketSize)
    data.totalVolume = toNum(data.totalVolume)
    data.totalFees = toNum(data.totalFees)
    data.totalInterchange = toNum(data.totalInterchange)
    data.processorMarkupRate = toNum(data.processorMarkupRate)
    data.processorPerAuthFee = toNum(data.processorPerAuthFee)
    data.interchangePerTxnFee = toNum(data.interchangePerTxnFee)
    data.monthlyFixedFees = toNum(data.monthlyFixedFees)

    // Normalize and ensure per-card averageTicketSize exists
    if (data.cardBreakdown && typeof data.cardBreakdown === 'object') {
      for (const key of Object.keys(data.cardBreakdown)) {
        const card = data.cardBreakdown[key] || {}
        card.volume = toNum(card.volume)
        card.rate = toNum(card.rate)
        card.perTransactionFee = toNum(card.perTransactionFee)
        // Normalize possible transaction count fields for per-card
        card.transactionCount = toNum(card.transactionCount ?? card.transactions ?? card.totalTransactions ?? card.txns ?? 0)

        // Prefer per-card averageTicketSize, otherwise fallback to overall averageTicketSize
        card.averageTicketSize = toNum(card.averageTicketSize ?? 0)
        if (!card.averageTicketSize) {
          if (card.transactionCount > 0 && card.volume > 0) {
            card.averageTicketSize = Number((card.volume / card.transactionCount).toFixed(4))
          } else {
            card.averageTicketSize = toNum(data.averageTicketSize)
          }
        }
        data.cardBreakdown[key] = card
      }
    }

    // Normalize possible global transaction count fields
    data.transactionCount = toNum(data.transactionCount ?? data.transactions ?? data.totalTransactions ?? data.txns ?? 0)

    // If averageTicketSize missing, but we have totalVolume and transactionCount, compute it
    if ((!data.averageTicketSize || data.averageTicketSize === 0) && data.totalVolume > 0 && data.transactionCount > 0) {
      data.averageTicketSize = Number((data.totalVolume / data.transactionCount).toFixed(4))
      data.averageTicketSizeEstimated = true
    } else {
      data.averageTicketSizeEstimated = false
    }

    // If perTransactionRate missing or zero, try to estimate using averageTicketSize
    if (!data.perTransactionRate || data.perTransactionRate === 0) {
      if (data.averageTicketSize > 0 && data.totalVolume > 0 && data.totalFees > 0) {
        const estimatedTxCount = data.totalVolume / data.averageTicketSize
        if (estimatedTxCount > 0) {
          data.perTransactionRate = Number((data.totalFees / estimatedTxCount).toFixed(4))
          data.perTransactionRateEstimated = true
        } else {
          data.perTransactionRate = 0
          data.perTransactionRateEstimated = false
        }
      } else {
        data.perTransactionRate = data.perTransactionRate ?? 0
        data.perTransactionRateEstimated = false
      }
    } else {
      data.perTransactionRateEstimated = false
    }

    // Cross-check extracted values and attach human-readable warnings
    data.validationWarnings = validateExtraction(data)
    if (data.validationWarnings.length > 0) {
      console.log('Validation warnings:', data.validationWarnings)
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error analyzing statement:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to analyze statement', detail: message },
      { status: 500 }
    )
  }
}
