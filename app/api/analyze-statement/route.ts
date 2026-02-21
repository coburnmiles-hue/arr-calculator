import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')

    // Use Gemini Vision to analyze the statement
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    
    const prompt = `Analyze this credit card processing statement image. Extract the following information in JSON format:
{
  "restaurantName": "name of the business",
  "monthlyVolume": total processing volume as a number,
  "totalInterchange": total interchange fees as a number,
  "cardBreakdown": {
    "visa": {"volume": number, "interchange": number, "percentage": number},
    "mastercard": {"volume": number, "interchange": number, "percentage": number},
    "amex": {"volume": number, "interchange": number, "percentage": number},
    "discover": {"volume": number, "interchange": number, "percentage": number}
  }
}

Only return valid JSON. If you can't find a value, use 0. Focus on extracting card types, processing volumes, and interchange amounts.`

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: file.type,
          data: base64
        }
      }
    ])

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
