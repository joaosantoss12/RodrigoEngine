import { jwtVerify, createRemoteJWKSet } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://oauth.telegram.org/.well-known/jwks.json')
)

/**
 * https://core.telegram.org/widgets/login — OIDC flow (telegram-login.js).
 * Verifies the id_token's signature against Telegram's JWKS, and that it
 * was issued for our bot (aud = client_id).
 */
export async function verifyTelegramIdToken(idToken, clientId) {
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: 'https://oauth.telegram.org',
    })

    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.some((a) => String(a) === String(clientId))) {
      console.error('Telegram id_token aud mismatch:', payload.aud, 'expected', clientId)
      return null
    }

    // `id` is the real Telegram user id. `sub` is the OIDC subject — a
    // different, much larger number that overflows a JS/Postgres bigint.
    const id = Number(payload.id ?? payload.sub)
    if (!Number.isFinite(id)) return null

    const username =
      typeof payload.preferred_username === 'string' ? payload.preferred_username : undefined
    const firstName =
      (typeof payload.given_name === 'string' && payload.given_name) ||
      (typeof payload.name === 'string' && payload.name) ||
      'Telegram'
    const photoUrl = typeof payload.picture === 'string' ? payload.picture : undefined

    return { id, username, first_name: firstName, photo_url: photoUrl }
  } catch (err) {
    console.error('Telegram id_token verification failed:', err)
    return null
  }
}
