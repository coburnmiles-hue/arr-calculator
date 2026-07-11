import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyses } from '@/lib/schema'
import { eq, desc } from 'drizzle-orm'
import { verifyToken } from '@/lib/auth'

function getUsernameFromRequest(request: NextRequest): string | null {
  return verifyToken(request.cookies.get('authToken')?.value)
}

export async function GET(request: NextRequest) {
  try {
    const username = getUsernameFromRequest(request)
    if (!username) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const rows = await db
      .select()
      .from(analyses)
      .where(eq(analyses.username, username))
      .orderBy(desc(analyses.createdAt))

    return NextResponse.json({ analyses: rows })
  } catch (error) {
    console.error('GET /api/analyses error:', error)
    return NextResponse.json({ error: 'Failed to load analyses' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const username = getUsernameFromRequest(request)
    if (!username) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { accountName, pricingModel, rates, extractedData } = body

    if (!accountName || !pricingModel || !rates || !extractedData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const [inserted] = await db
      .insert(analyses)
      .values({ username, accountName, pricingModel, rates, extractedData })
      .returning()

    return NextResponse.json({ analysis: inserted })
  } catch (error) {
    console.error('POST /api/analyses error:', error)
    return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
  }
}
