import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    // Define valid user accounts
    const validUsers = [
      {
        username: 'mcoburn',
        password: 'coburn8675!'
      },
      {
        username: 'dtorres',
        password: 'torres1234!'
      }
    ]

    // Validate credentials against valid users
    const user = validUsers.find(u => u.username === username && u.password === password)
    
    if (!user) {
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
