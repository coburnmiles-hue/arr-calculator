import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(request: NextRequest) {
  try {
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

  "Flat Rate" — Signal:
    * Single blended percentage for all cards, no interchange detail

  "Dual Pricing" — Signals:
    * "Cash Discount" language or dual pricing tiers (one rate, one surcharge)
    * Customer fee adjustments

  "Unknown" — if none of the above can be determined

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
  "hiddenMarginFlags": <array of strings — fees suspected to contain hidden processor markup>,
  "cardBreakdown": {
    "<key>": {
      "volume": <number>,
      "rate": <number — as decimal>,
      "perTransactionFee": <number>,
      "transactionCount": <number>,
      "averageTicketSize": <number>
    }
  }
}

cardBreakdown key conventions:
  - I+ or card_split: "visa", "mastercard", "amex", "discover", "debit"
  - bundled_with_amex: "visa_mastercard_discover", "amex", "amex_keyed"
  - tiered: "check_card", "qualified", "mid_qualified", "non_qualified"
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
      }
    })
    const response = await result.response
    const text = response.text()
    console.log('Gemini raw response length:', text.length)
    
    // Extract JSON from response (remove markdown formatting if present)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    if (!extractedData) {
      throw new Error('Failed to extract data from statement')
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
    data.processorMarkupRate = toNum(data.processorMarkupRate)
    data.processorPerAuthFee = toNum(data.processorPerAuthFee)
    data.interchangePerTxnFee = toNum(data.interchangePerTxnFee)

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
