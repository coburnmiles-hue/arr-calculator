import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyses } from '@/lib/schema'
import { eq, and } from 'drizzle-orm'

function getUsernameFromRequest(request: NextRequest): string | null {
  const usernameHeader = request.headers.get('x-username')
  if (usernameHeader) return usernameHeader
  const usernameCookie = request.cookies.get('username')?.value
  return usernameCookie ?? null
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const username = getUsernameFromRequest(request)
    if (!username) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const id = parseInt(params.id, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    await db
      .delete(analyses)
      .where(and(eq(analyses.id, id), eq(analyses.username, username)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/analyses/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete analysis' }, { status: 500 })
  }
}
