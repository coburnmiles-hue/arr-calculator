import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    // Get credentials from environment variables
    const validUsername = process.env.AUTH_USERNAME || 'mcoburn'
    const validPassword = process.env.AUTH_PASSWORD || 'coburn8675!'

    // Validate credentials
    if (username !== validUsername || password !== validPassword) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // Create a simple token (timestamp + hash)
    const token = crypto
      .createHash('sha256')
      .update(`${username}:${Date.now()}`)
      .digest('hex')

    // Return token
    return NextResponse.json(
      { 
        token,
        username,
        message: 'Login successful'
      },
      { 
        status: 200,
        headers: {
          'Set-Cookie': `authToken=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`
        }
      }
    )
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}
