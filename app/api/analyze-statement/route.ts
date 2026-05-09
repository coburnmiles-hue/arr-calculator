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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    
    const prompt = `Analyze these credit card processing statement images (may be multiple pages of the same statement). Extract and COMBINE all information across all pages into a single JSON response.

FIRST: Detect the statement format:
- "card_split" format: Each card network (Visa, Mastercard, Amex, Discover) has separate rows with their own rates
- "bundled_with_amex" format: Visa/Mastercard/Discover are bundled together with one "Swipe" and "Keyed" row, and Amex has separate rows
- "other": Any other structure

SECOND: Detect the processing method - look for these specific indicators:
- "Interchange Plus": Look for ANY of these signals:
  * A section titled "Interchange Charges/Program Fees" or "Interchange Detail" listing individual interchange categories (e.g., "VI-CPS/RESTAURANT", "MC-WORLD ELITE", "DSCVR PSL REST CP")
  * Lines showing "DISC RATE TIMES" or "Sales Discount" as a percentage of volume alongside separate interchange category line items
  * Fees labeled as "Interchange charges" (the base) AND separate "Service charges" (the markup)
  * Processor names commonly on I+: BASYS, Heartland, First Data, TSYS, Worldpay, Elavon, Gravity
- "Tiered Pricing": Look for MULTIPLE DIFFERENT rate levels. Check for:
  * Different rates for different card tier categories: "Check Card", "Qualified", "Mid-Qualified", "Non-Qualified"
  * OR different rates for different card networks: Visa, Mastercard, Amex, Discover each have unique percentages
- "Flat Rate": All cards are charged at ONE single percentage rate
- "Dual Pricing": Shows "Cash Discount" or shows two pricing tiers (one rate, one surcharge)

=== INTERCHANGE PLUS STATEMENTS - SPECIAL EXTRACTION RULES ===
If the statement is Interchange Plus, follow these specific rules:

1. FINDING totalInterchange:
   - Look for a fee SUMMARY section (usually near the bottom of the fees section) that shows a line explicitly labeled "Total Interchange Charges/Program Fees" or similar.
   - Use THAT labeled total — do NOT use the grand total of the interchange detail table (they may differ because debit network fees are sometimes listed separately).
   - Also include "Total Debit Network Fees" in totalInterchange if it appears as a separate line in the fee summary, as these ARE true interchange/network costs.
   - Example: if fee summary shows "Total Interchange Charges/Program Fees: $2,716.99", use $2,716.99.

2. FINDING the PROCESSOR MARKUP (the "+" in Interchange Plus):
   - Look for lines like "SALES DISCOUNT 0.0028 DISC RATE TIMES $120,000" — the 0.0028 is the processor's markup rate (0.28%).
   - Look for separate debit vs. credit discount lines (e.g., "DEBIT SALES DISCOUNT 0.0028 DISC RATE TIMES...").
   - These are labeled as "Service charges" in the fee type column.
   - Also look for per-authorization fees: "WATS AUTH FEE X TRANSACTIONS AT $0.09", "NETWORK ACCESS AUTH FEE X TRANSACTIONS AT $0.0295".
   - Report the processor markup rate as "processorMarkupRate" (e.g., 0.0028) and per-auth fee as "processorPerAuthFee" (e.g., 0.09).

2b. FINDING the INTERCHANGE PER-TRANSACTION FEE (separate from processor per-auth):
   - Each interchange category in the Interchange Detail section has a rate structure like "1.54% + $0.10" or "2.20% + $0.10".
   - The "+ $0.10" (or similar ¢ amount) is the INTERCHANGE's own per-transaction fee charged by the card networks — this is SEPARATE from the processor's per-auth fee above.
   - To find the blended interchange per-transaction fee: look at the individual category lines in the Interchange Detail/Charges section. Many will show a rate like "VISA CPS RESTAURANT 1.54% $0.10" or a column labeled "Per Item" or "Per Txn" next to each category.
   - Compute the weighted average: sum(per_txn_fee_for_category × transactions_in_category) / total_transactions. If you cannot get per-category transaction counts, use a simple average of the per-transaction fees you see across categories.
   - Report this as "interchangePerTxnFee" (e.g., 0.08 for 8 cents). If you cannot find individual category per-transaction fees, set to 0.

3. FINDING cardBreakdown for I+ statements:
   - Use volumes and transaction counts from the "Summary by Card Type" section.
   - For the "rate" per card: compute it as (total interchange charges for that card type) / (volume for that card type).
     * Find each card type's interchange total in the "Interchange Charges/Program Fees" detail table (e.g., "MASTERCARD TOTAL", "VISA TOTAL", "DISCOVER TOTAL", "AMEX ACQ TOTAL").
     * Divide by that card's volume from Summary by Card Type.
     * Example: if Visa interchange = $1,082 and Visa volume = $59,214 → rate = 1082/59214 = 0.01828
   - For debit cards: their interchange shows $0 in the credit interchange table, but debit NETWORK FEES are charged separately. Compute debit effective rate as (Total Debit Network Fees) / (debit volume).
   - Include "transactionCount" per card type from Summary by Card Type.
   - Use the "Average Ticket" column from Summary by Card Type for per-card averageTicketSize.

4. FINDING totalTransactionCount for I+ statements:
   - Look at the TOTAL row of "Summary by Card Type" — the "Items" or transaction count column gives the exact total.
   - This is critical — do not estimate it.

=== END INTERCHANGE PLUS RULES ===

FINDING PER-TRANSACTION FEES (for non-I+ statements):
Look for per-transaction fees using MULTIPLE strategies:
1. Search for sections labeled "Per Transaction", "Per Txn", "Transaction Fee", "Authorization Detail", "Auth Detail", or "Interchange Detail"
2. Look for SMALL DOLLAR AMOUNTS in cents next to card types (e.g., "$0.15", "$0.25", "$0.10", "$0.30", "15¢", "25¢")
3. Search for patterns like "Visa ... $0.15", "Mastercard ... $0.10", "Amex ... $0.25", "Discover ... $0.20"
4. Look in "Authorization Detail" or "Detail" sections
5. If there's a "Total Fees" line and you can identify the number of transactions, calculate per-transaction fee

Also: extract the average ticket size (average sale amount) when present as a dollar value.

Return this JSON:
{
  "totalVolume": total processing volume as a number (sum from all pages),
  "totalInterchange": total interchange fees as a number - for I+ this is the labeled "Total Interchange Charges/Program Fees" line,
  "totalFees": total ALL fees charged as a number (sum from all pages) - everything combined,
  "transactionCount": exact total number of transactions from the statement (not estimated),
  "perTransactionRate": the average per-transaction fee in dollars (e.g. 0.15 for 15 cents, NOT the total),
  "averageTicketSize": the average sale amount in dollars (e.g. 45.50),
  "currentProcessingMethod": "Interchange Plus" | "Flat Rate" | "Tiered Pricing" | "Dual Pricing" | "Unknown",
  "statementFormat": "card_split" | "bundled_with_amex" | "unknown",
  "processorMarkupRate": for I+ only - the processor's markup percentage as decimal (e.g. 0.0028 for 0.28%), or 0 if not I+,
  "processorPerAuthFee": for I+ only - the processor's per-authorization fee in dollars (e.g. 0.09), or 0 if not I+,
  "interchangePerTxnFee": for I+ only - the blended per-transaction fee charged by the card networks within the interchange categories (e.g. 0.08 for 8 cents). Look for the "+ $X.XX" portion of interchange category rate lines. Set to 0 if not found or not I+,
  "cardBreakdown": {
    "key1": { "volume": number, "rate": number (as decimal), "perTransactionFee": number, "transactionCount": number, "averageTicketSize": number },
    "key2": { ... }
  }
}

For cardBreakdown keys:
- If card_split or I+ format: use keys "visa", "mastercard", "amex", "discover", "debit" (include only card types that appear)
- If bundled_with_amex format: use keys like "visa_mastercard_discover", "amex", "amex_keyed" (if separate keyed line)
- For tiered pricing: create entries for each tier (e.g., "check_card", "qualified", "mid_qualified", "non_qualified")
- If fees differ by Swipe vs Keyed, create separate entries (e.g., "visa_swipe", "visa_keyed")

IMPORTANT:
- Sum all volumes and fees from all pages
- For I+: totalInterchange = "Total Interchange Charges/Program Fees" labeled value (includes debit network fees if listed there)
- For non-I+: totalInterchange = ONLY the base interchange line item, NOT including processor markup
- totalFees should include EVERYTHING (interchange + processor markup + transaction fees + all other charges)
- transactionCount: extract the actual number from the statement. If unavailable, estimate as totalVolume / averageTicketSize and set "transactionCountEstimated": true
- perTransactionRate MUST be a single average number representing cost per transaction in dollars (not a total, not a range)
  * For I+: use the processor's per-auth fee (e.g., processorPerAuthFee)
  * For non-I+: look for explicit per-transaction fee on the rate schedule
  * If estimating: totalFees / transactionCount and set "perTransactionRateEstimated": true
- For I+ cardBreakdown rates: compute effective rate = interchange_for_card / volume_for_card (as shown above)
- Only return valid JSON
- If you can't find a specific value, use 0 for numbers or "Unknown" for strings`

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
    const result = await model.generateContent([prompt, ...imageParts])
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
