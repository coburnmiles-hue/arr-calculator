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
    
    const prompt = `Analyze these credit card processing statement images (may be multiple pages of the same statement). Extract and COMBINE all information across all pages into a single JSON response:

{
  "totalVolume": total processing volume as a number (sum from all pages),
  "totalInterchange": total interchange fees as a number (sum from all pages) - this is what the credit card companies and banks charge,
  "totalFees": total ALL fees charged as a number (sum from all pages) - this includes interchange + processor markup + all other fees,
  "perTransactionRate": average per-transaction fee in dollars,
  "currentProcessingMethod": "Interchange Plus" | "Flat Rate" | "Tiered Pricing" | "Dual Pricing" | "Unknown" - determine based on how fees are structured on the statement,
  "cardBreakdown": {
    "visa": {
      "volume": number - total amount processed for Visa cards,
      "rate": number - the percentage rate for Visa (as a decimal, e.g., 0.0275 for 2.75%),
      "perTransactionFee": number - per transaction fee for Visa in dollars
    },
    "mastercard": {
      "volume": number - total amount processed for Mastercard,
      "rate": number - the percentage rate for Mastercard (as a decimal),
      "perTransactionFee": number - per transaction fee for Mastercard in dollars
    },
    "amex": {
      "volume": number - total amount processed for Amex,
      "rate": number - the percentage rate for Amex (as a decimal),
      "perTransactionFee": number - per transaction fee for Amex in dollars
    },
    "discover": {
      "volume": number - total amount processed for Discover,
      "rate": number - the percentage rate for Discover (as a decimal),
      "perTransactionFee": number - per transaction fee for Discover in dollars
    }
  }
}

IMPORTANT: 
- Sum all volumes and fees from all pages
- totalInterchange should be ONLY the interchange fees charged by card networks/banks, NOT the processor's markup
- totalFees should include EVERYTHING charged (interchange + processor fees + transaction fees + all other fees)
- perTransactionRate is the overall dollar amount per transaction (often shown as "$0.10" or similar)
- For each card type, extract the specific rate and per-transaction fee if shown separately on the statement
- If per-transaction fees are NOT shown separately for each card type, use the same perTransactionRate value for all cards
- Look for indicators like "interchange plus", "flat rate", "qualified/mid-qualified/non-qualified" (tiered), or "cash discount" (dual pricing) to determine the processing method
- Only return valid JSON
- If you can't find a value, use 0 or "Unknown" as appropriate`

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
