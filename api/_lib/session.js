import { createHmac, timingSafeEqual } from 'crypto'

export const SESSION_COOKIE = 'tg_session'

function sign(value) {
  return createHmac('sha256', process.env.SESSION_SECRET)
    .update(value)
    .digest('base64url')
}

export function signSession(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

// `req.cookies` is pre-parsed by Vercel's Node runtime.
export function verifySession(cookies) {
  const cookieValue = cookies?.[SESSION_COOKIE]
  if (!cookieValue) return null
  const [payload, signature] = cookieValue.split('.')
  if (!payload || !signature) return null

  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function setSessionCookie(res, session) {
  const value = signSession(session)
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`
  )
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  )
}
