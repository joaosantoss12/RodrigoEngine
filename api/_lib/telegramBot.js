// Talks to the RODRIGOTIPS ENGINE group's bot (separate from the login-widget
// bot) to mint single-use invite links. The bot must be an admin of
// TELEGRAM_GROUP_CHAT_ID with the "Invite Users via Link" permission.
const TELEGRAM_API = 'https://api.telegram.org'

export async function createGroupInviteLink({ memberLimit = 1, expireSeconds = 3600 } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID
  if (!token || !chatId) {
    console.error('[telegramBot] TELEGRAM_BOT_TOKEN or TELEGRAM_GROUP_CHAT_ID not set')
    return null
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/createChatInviteLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        member_limit: memberLimit,
        expire_date: Math.floor(Date.now() / 1000) + expireSeconds,
        creates_join_request: false,
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error('[telegramBot] createChatInviteLink failed:', data.description)
      return null
    }
    return data.result.invite_link
  } catch (err) {
    console.error('[telegramBot] createChatInviteLink error:', err.message)
    return null
  }
}
