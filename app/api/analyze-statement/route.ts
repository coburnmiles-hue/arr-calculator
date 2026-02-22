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

Then extract:
{
  "totalVolume": total processing volume as a number (sum from all pages),
  "totalInterchange": total interchange fees as a number (sum from all pages) - this is what the credit card companies and banks charge,
  "totalFees": total ALL fees charged as a number (sum from all pages) - this includes interchange + processor markup + all other fees,
  "perTransactionRate": average per-transaction fee in dollars,
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
- Include ONLY the card types that appear on the statement
- Each key should have volume, rate (as decimal like 0.0275), and perTransactionFee
- If a specific line shows only "keyed" or "swipe", include that in the key name (e.g., "amex_swipe", "visaMC_keyed")

IMPORTANT: 
- Sum all volumes and fees from all pages
- totalInterchange should be ONLY interchange fees charged by card networks, NOT processor markup
- totalFees should include EVERYTHING charged
- For bundled cards, if only one rate is shown (and not broken by swipe/keyed), use that rate for the bundled entry
- Only return valid JSON
- Include statementFormat field to help the UI display data correctly
- If you can't find a value, use 0 or null as appropriate`

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
