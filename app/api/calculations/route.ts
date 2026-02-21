import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { calculations } from '@/lib/schema'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mrr, arr, customers, arpu } = body

    const newCalculation = await db.insert(calculations).values({
      mrr: mrr.toString(),
      arr: arr.toString(),
      customers,
      arpu: arpu.toString(),
    }).returning()

    return NextResponse.json(newCalculation[0], { status: 201 })
  } catch (error) {
    console.error('Error saving calculation:', error)
    return NextResponse.json(
      { error: 'Failed to save calculation' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const allCalculations = await db.select().from(calculations).orderBy(calculations.createdAt)
    return NextResponse.json(allCalculations)
  } catch (error) {
    console.error('Error fetching calculations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch calculations' },
      { status: 500 }
    )
  }
}
