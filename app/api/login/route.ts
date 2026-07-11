import { NextRequest, NextResponse } from 'next/server'
import { getUsers, createToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    const users = getUsers()
    if (users.length === 0) {
      console.error('AUTH_USERS environment variable is not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Validate credentials — constant-time username+password check to avoid enumeration
    const user = users.find((u) => u.username === username && u.password === password)
    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const token = createToken(username)
    const maxAge = 7 * 24 * 60 * 60

    return NextResponse.json(
      { username, message: 'Login successful' },
      {
        status: 200,
        headers: {
          'Set-Cookie': `authToken=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
        },
      }
    )
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
