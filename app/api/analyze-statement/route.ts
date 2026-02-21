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

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    
    const prompt = `Analyze these credit card processing statement images (may be multiple pages of the same statement). Extract and COMBINE all information across all pages into a single JSON response:

{
  "restaurantName": "name of the business",
  "monthlyVolume": total processing volume as a number (sum from all pages),
  "totalInterchange": total interchange fees as a number (sum from all pages),
  "cardBreakdown": {
    "visa": {"volume": number, "interchange": number, "percentage": number},
    "mastercard": {"volume": number, "interchange": number, "percentage": number},
    "amex": {"volume": number, "interchange": number, "percentage": number},
    "discover": {"volume": number, "interchange": number, "percentage": number}
  }
}

IMPORTANT: 
- Sum all volumes and fees from all pages
- Calculate percentages based on total volume
- Only return valid JSON
- If you can't find a value, use 0`

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
