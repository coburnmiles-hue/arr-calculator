import crypto from 'crypto'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function getSecret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET environment variable is required')
  return s
}

/** Reads credentials from AUTH_USERS env var (format: "user1:pass1,user2:pass2") */
export function getUsers(): Array<{ username: string; password: string }> {
  const raw = process.env.AUTH_USERS ?? ''
  if (!raw) return []
  return raw.split(',').flatMap((pair) => {
    const sep = pair.indexOf(':')
    if (sep === -1) return []
    const username = pair.slice(0, sep).trim()
    const password = pair.slice(sep + 1).trim()
    return username && password ? [{ username, password }] : []
  })
}

/** Creates a signed token with the username embedded.
 *  Format: base64url(username:expiresAt).hmac-sha256 */
export function createToken(username: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS
  const payload = Buffer.from(`${username}:${expiresAt}`).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

/** Verifies the token signature and expiry; returns the username or null. */
export function verifyToken(token: string | null | undefined): string | null {
  if (!token) return null
  try {
    const secret = getSecret()
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null

    const payload = token.slice(0, dot)
    const sig = token.slice(dot + 1)

    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    const expectedBuf = Buffer.from(expectedSig, 'hex') // always 32 bytes
    const sigBuf = Buffer.from(sig, 'hex')

    // Reject tokens with a malformed or wrong-length signature
    if (sigBuf.length !== expectedBuf.length) return null
    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null

    const decoded = Buffer.from(payload, 'base64url').toString()
    const lastColon = decoded.lastIndexOf(':')
    if (lastColon === -1) return null

    const username = decoded.slice(0, lastColon)
    const expiresAt = parseInt(decoded.slice(lastColon + 1), 10)
    if (!username || isNaN(expiresAt) || Date.now() > expiresAt) return null

    return username
  } catch {
    return null
  }
}
