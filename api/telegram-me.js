import { verifySession } from './_lib/session.js'

export default async function handler(req, res) {
  const session = verifySession(req.cookies)
  if (!session) {
    return res.status(200).json({ loggedIn: false })
  }
  res.status(200).json({ loggedIn: true, user: session })
}
