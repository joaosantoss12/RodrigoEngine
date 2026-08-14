import { verifyTelegramIdToken } from './_lib/telegramAuth.js'
import { setSessionCookie } from './_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const idToken = typeof req.body?.id_token === 'string' ? req.body.id_token : null
  if (!idToken) {
    return res.status(400).json({ error: 'Payload inválido' })
  }

  const auth = await verifyTelegramIdToken(idToken, process.env.TELEGRAM_CLIENT_ID)
  if (!auth) {
    return res.status(401).json({ error: 'Autenticação inválida' })
  }

  const session = {
    id: auth.id,
    username: auth.username,
    first_name: auth.first_name,
    photo_url: auth.photo_url,
  }
  setSessionCookie(res, session)
  res.status(200).json({ ok: true, user: session })
}
