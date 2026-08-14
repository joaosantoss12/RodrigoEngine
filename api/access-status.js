import { verifySession } from './_lib/session.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { createGroupInviteLink } from './_lib/telegramBot.js'

export default async function handler(req, res) {
  const session = verifySession(req.cookies)
  if (!session) {
    return res.status(200).json({ status: 'logged_out' })
  }

  const purchaseId = req.query.id
  if (!purchaseId || typeof purchaseId !== 'string') {
    return res.status(400).json({ status: 'error', error: 'Missing id' })
  }

  const { data: subscriber, error } = await supabaseAdmin
    .from('subscribers')
    .select('*')
    .eq('id', purchaseId)
    .single()

  if (error || !subscriber) {
    return res.status(404).json({ status: 'not_found' })
  }

  // A purchase belongs to whichever Telegram account bought it — never leak
  // it to a different logged-in session even if they guess the id.
  if (String(subscriber.telegram_user_id) !== String(session.id)) {
    return res.status(403).json({ status: 'forbidden' })
  }

  if (!subscriber.paid) {
    return res.status(200).json({ status: 'pending' })
  }

  let inviteLink = subscriber.invite_link
  if (!inviteLink) {
    // The webhook's bot call failed earlier — retry once here so the buyer
    // isn't stuck without a link.
    inviteLink = await createGroupInviteLink()
    if (inviteLink) {
      await supabaseAdmin.from('subscribers').update({ invite_link: inviteLink }).eq('id', purchaseId)
    }
  }

  if (!inviteLink) {
    return res.status(200).json({ status: 'paid_no_link' })
  }

  res.status(200).json({ status: 'ready', invite_link: inviteLink })
}
