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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    
    const prompt = `Analyze these credit card processing statement images (may be multiple pages of the same statement). Extract and COMBINE all information across all pages into a single JSON response.

FIRST: Detect the statement format:
- "card_split" format: Each card network (Visa, Mastercard, Amex, Discover) has separate rows with their own rates
- "bundled_with_amex" format: Visa/Mastercard/Discover are bundled together with one "Swipe" and "Keyed" row, and Amex has separate rows
- "other": Any other structure

SECOND: Detect the processing method - look for these specific indicators:
- "Interchange Plus": Look for "Interchange", "+", or "Plus" followed by a markup percentage. Shows base interchange cost plus a percentage/per-transaction markup
- "Tiered Pricing": Look for MULTIPLE DIFFERENT rate levels (not just fees). Check for:
  * Different rates for different card tier categories: "Check Card", "Qualified", "Mid-Qualified", "Non-Qualified"
  * OR different rates for different card networks: Visa, Mastercard, Amex, Discover each have unique percentages
- "Flat Rate": All cards are charged at ONE single percentage rate
- "Dual Pricing": Shows "Cash Discount" or shows two pricing tiers (one rate, one surcharge)

FINDING PER-TRANSACTION FEES - BE THOROUGH:
Look for per-transaction fees using MULTIPLE strategies:
1. Search for sections labeled "Per Transaction", "Per Txn", "Transaction Fee", "Authorization Detail", "Auth Detail", or "Interchange Detail"
2. Look for SMALL DOLLAR AMOUNTS in cents next to card types (e.g., "$0.15", "$0.25", "$0.10", "$0.30", "15¢", "25¢")
3. Search for patterns like:
   - "Visa ... $0.15" or "Visa 0.15"
   - "Mastercard ... $0.10" or "MC 0.10"
   - "Amex ... $0.25" or "American Express 0.25"
   - "Discover ... $0.20" or "Discover 0.20"
4. Look in "Authorization Detail" or "Detail" sections - these often contain per-transaction rates
5. If there's a "Total Fees" line and you can identify the number of transactions, calculate per-transaction fee
6. Look for fee schedules or rate tables that show both percentage and per-transaction fees

Then extract:
{
  "totalVolume": total processing volume as a number (sum from all pages),
  "totalInterchange": total interchange fees as a number (sum from all pages) - ONLY the interchange line item, NOT processor markup,
  "totalFees": total ALL fees charged as a number (sum from all pages) - everything combined,
  "perTransactionRate": the average per-transaction fee in dollars (e.g. 0.15 for 15 cents, NOT the total),
  "currentProcessingMethod": "Interchange Plus" | "Flat Rate" | "Tiered Pricing" | "Dual Pricing" | "Unknown",
  "statementFormat": "card_split" | "bundled_with_amex" | "unknown",
  "cardBreakdown": {
    "key1": { "volume": number, "rate": number (as decimal), "perTransactionFee": number },
    "key2": { "volume": number, "rate": number (as decimal), "perTransactionFee": number }
  }
}

For cardBreakdown:
- If card_split format: use keys like "visa", "mastercard", "amex", "discover"
- If bundled_with_amex format: use keys like "visa_mastercard_discover" (for bundled), "amex", "amex_keyed" (if separate keyed line)
- For tiered pricing: create separate entries for each tier with their respective rates (e.g., "check_card", "qualified", "mid_qualified", "non_qualified")
- Include ONLY the card types or tiers that appear on the statement
- Each key should have volume, rate (as decimal like 0.0275 for 2.75%), and perTransactionFee (dollar amount like 0.10 for $0.10)
- If fees differ by Swipe vs Keyed, create separate entries (e.g., "visa_swipe": {...perTransactionFee: 0.10}, "visa_keyed": {...perTransactionFee: 0.15})
- If a specific line shows only "keyed" or "swipe", include that in the key name (e.g., "amex_swipe", "visaMC_keyed")

IMPORTANT: 
- Sum all volumes and fees from all pages
- totalInterchange should be ONLY the "Interchange" line item, NOT including processor fees
- totalFees should include EVERYTHING (interchange + processor + transaction fees + all other charges)
- perTransactionRate MUST be a single average number representing cost per transaction in dollars (not a total, not a range)
  * If you find multiple per-transaction rates on the statement, calculate the weighted average
  * If you can't find a clear per-transaction fee, look carefully at fee schedules and small dollar amounts
  * Do NOT use transaction counts - use the actual per-transaction fee amounts listed on the statement
- For tiered pricing with multiple tiers: extract the volume and rate for EACH tier separately in cardBreakdown
- Only return valid JSON
- Include statementFormat field to help the UI display data correctly
- If you can't find a specific value, use 0 for numbers or "Unknown" for strings`

    // Convert all files to base64 and prepare for Gemini
    const imageParts = await Promise.all(
      files.map(async (file) => {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const base64 = buffer.toString('base64')
        
        return {
          inlineData: {
            mimeType: file.type,
            data: base64
          }
        }
      })
    )

    // Send all images to Gemini
    const result = await model.generateContent([prompt, ...imageParts])
    const response = await result.response
    const text = response.text()
    
    // Extract JSON from response (remove markdown formatting if present)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    if (!extractedData) {
      throw new Error('Failed to extract data from statement')
    }

    return NextResponse.json({ data: extractedData })
  } catch (error) {
    console.error('Error analyzing statement:', error)
    return NextResponse.json(
      { error: 'Failed to analyze statement' },
      { status: 500 }
    )
  }
}
