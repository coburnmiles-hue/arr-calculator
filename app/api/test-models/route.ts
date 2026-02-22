import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    
    // Try to fetch available models directly via REST API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    )
    
    const data = await response.json()
    
    return NextResponse.json({ 
      status: response.status,
      data 
    })
  } catch (error) {
    console.error('Error testing API:', error)
    return NextResponse.json(
      { error: 'Failed to test API', details: String(error) },
      { status: 500 }
    )
  }
}
