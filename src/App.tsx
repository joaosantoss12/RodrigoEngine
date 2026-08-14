import { useState, useEffect, useRef, useCallback } from 'react'
import mascot from './assets/mascot.jpeg'
import './App.css'

const TELEGRAM_CLIENT_ID = import.meta.env.VITE_TELEGRAM_CLIENT_ID as string

type TgUser = {
  username?: string
  first_name: string
  photo_url?: string
}

type TelegramAuthData = { id_token?: string; error?: string }

declare global {
  interface Window {
    onTelegramAuth?: (data: TelegramAuthData) => void
  }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── Immersive background: a slowly drifting particle network (canvas), evoking
// the "engine" analyzing data points. Density scales with viewport area, capped
// so it stays cheap on large screens. Pauses on hidden tabs and reduced-motion.
const PARTICLE_COLORS = ['56,189,248', '139,92,246']

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (prefersReducedMotion()) {
      return
    }

    let width = 0
    let height = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let particles: { x: number; y: number; vx: number; vy: number; r: number; color: string }[] = []
    let raf = 0
    let running = true

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.min(90, Math.max(28, Math.round((width * height) / 16000)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.6 + 0.6,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      }))
    }

    const linkDist = 140

    const tick = () => {
      if (!running) return
      ctx.clearRect(0, 0, width, height)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0
      }

      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < linkDist) {
            ctx.strokeStyle = `rgba(56,189,248,${0.12 * (1 - dist / linkDist)})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const p of particles) {
        ctx.fillStyle = `rgba(${p.color},0.55)`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(tick)
    }

    const handleVisibility = () => {
      running = !document.hidden
      if (running) raf = requestAnimationFrame(tick)
      else cancelAnimationFrame(raf)
    }

    resize()
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="particle-field" aria-hidden="true" />
}

// ── Scroll-reveal: fades/slides an element in the first time it enters the
// viewport. One-shot (observer disconnects after triggering) so re-scrolling
// past a section doesn't replay the animation.
function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => prefersReducedMotion())

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// ── Pointer-driven 3D tilt for cards/mascot — sets --tilt-x/--tilt-y custom
// properties that the CSS transform reads, so the JS never touches transform
// directly (keeps it compositor-friendly).
function useTilt<T extends HTMLElement>(maxDeg = 8) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return

    const handleMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5
      el.style.setProperty('--tilt-x', `${(-py * maxDeg).toFixed(2)}deg`)
      el.style.setProperty('--tilt-y', `${(px * maxDeg).toFixed(2)}deg`)
    }
    const reset = () => {
      el.style.setProperty('--tilt-x', '0deg')
      el.style.setProperty('--tilt-y', '0deg')
    }

    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerleave', reset)
    return () => {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerleave', reset)
    }
  }, [maxDeg])

  return ref
}

// ── Telegram login widget: injects oauth.telegram.org's script next to a
// button it turns into the login trigger. This site has its own dedicated
// bot (TELEGRAM_CLIENT_ID) — its domain must be registered with @BotFather
// under that bot's Web Login settings for the widget to render.
function TelegramLoginWidget() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const script = document.createElement('script')
    script.src = 'https://oauth.telegram.org/js/telegram-login.js?22'
    script.async = true
    script.setAttribute('data-client-id', TELEGRAM_CLIENT_ID)
    script.setAttribute('data-onauth', 'onTelegramAuth(data)')
    script.setAttribute('data-request-access', 'write')
    el.appendChild(script)
    return () => {
      script.remove()
    }
  }, [])

  return (
    <div ref={containerRef} className="tg-login-widget">
      <button className="tg-auth-button" data-style="shine" type="button">
        Entrar com Telegram
      </button>
    </div>
  )
}

function JoinGroupButton({ url, label = 'Entrar no Grupo' }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary btn-full join-btn">
      <span>🤖 {label}</span>
    </a>
  )
}

function SuccessPage({ tgUser }: { tgUser: TgUser | null }) {
  const purchaseId = new URLSearchParams(window.location.search).get('purchase_id')
  const [status, setStatus] = useState<
    'checking' | 'pending' | 'ready' | 'paid_no_link' | 'forbidden' | 'not_found' | 'logged_out' | 'error'
  >('checking')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const attemptsRef = useRef(0)

  const poll = useCallback(async () => {
    if (!purchaseId) {
      setStatus('error')
      return
    }
    try {
      const res = await fetch(`/api/access-status?id=${encodeURIComponent(purchaseId)}`)
      const data = await res.json()
      setStatus(data.status)
      if (data.status === 'ready') setInviteLink(data.invite_link)
    } catch {
      setStatus('error')
    }
  }, [purchaseId])

  useEffect(() => {
    poll()
    const interval = setInterval(() => {
      attemptsRef.current += 1
      if (attemptsRef.current > 20 || (status !== 'checking' && status !== 'pending')) {
        clearInterval(interval)
        return
      }
      poll()
    }, 3000)
    return () => clearInterval(interval)
  }, [poll, status])

  return (
    <div className="success-page">
      <ParticleField />
      <div className="bg-glow" />
      <div className="success-card">
        <div className="success-icon">✓</div>
        <h1>Pagamento Confirmado!</h1>

        {status === 'checking' || status === 'pending' ? (
          <>
            <span className="spinner-accent" />
            <p>A preparar o teu acesso ao grupo...</p>
            <p className="success-sub">Isto demora normalmente só alguns segundos.</p>
          </>
        ) : status === 'ready' && inviteLink ? (
          <>
            <p>Tens acesso vitalício ao RODRIGOTIPS ENGINE. Entra no grupo privado:</p>
            <JoinGroupButton url={inviteLink} />
            <p className="success-sub">
              O link é de uso único e expira em 1 hora. Se precisares de um novo, volta a este
              site e inicia sessão com o mesmo Telegram.
            </p>
          </>
        ) : status === 'paid_no_link' ? (
          <>
            <p>O pagamento foi confirmado, mas ainda não conseguimos gerar o link do grupo.</p>
            <p className="success-sub">
              Recarrega a página dentro de instantes. Se o problema persistir contacta-nos.
            </p>
          </>
        ) : status === 'logged_out' || status === 'forbidden' ? (
          <>
            <p>
              Inicia sessão com o <strong>mesmo Telegram</strong> que usaste na compra para
              acederes ao grupo.
            </p>
            {!tgUser && <TelegramLoginWidget />}
          </>
        ) : (
          <>
            <p>Não encontrámos essa compra.</p>
            <p className="success-sub">
              Se acabaste de pagar, tenta recarregar a página. Caso contrário contacta-nos.
            </p>
          </>
        )}

        <a href="/" className="btn-secondary">
          Voltar ao Início
        </a>
      </div>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`faq-item ${open ? 'open' : ''}`}>
      <button className="faq-question" onClick={() => setOpen(!open)}>
        <span>{question}</span>
        <span className="faq-icon">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="faq-answer">{answer}</p>}
    </div>
  )
}

function TelegramAuthBar({
  tgUser,
  onLogout,
  hasAccess,
  onJoinGroup,
}: {
  tgUser: TgUser | null
  onLogout: () => void
  hasAccess: boolean
  onJoinGroup: () => void
}) {
  if (tgUser) {
    return (
      <div className="tg-auth-bar">
        {tgUser.photo_url && (
          <img src={tgUser.photo_url} alt={tgUser.first_name} referrerPolicy="no-referrer" className="tg-avatar" />
        )}
        <div className="tg-auth-info">
          <span className="tg-auth-name">{tgUser.first_name}</span>
          {tgUser.username && <span className="tg-auth-username">@{tgUser.username}</span>}
        </div>
        {hasAccess && (
          <button className="tg-view-pick-btn" onClick={onJoinGroup} type="button">
            Entrar no Grupo
          </button>
        )}
        <button className="tg-logout-btn" onClick={onLogout} type="button">
          Sair
        </button>
      </div>
    )
  }

  return (
    <div className="tg-auth-bar tg-auth-bar-login">
      <p>
        <strong>Inicia sessão com o Telegram</strong> antes de comprar — assim o teu acesso ao
        grupo fica associado à tua conta, mesmo que percas o link.
      </p>
      <TelegramLoginWidget />
    </div>
  )
}

type EngineInput = { label: string; icon: string }

const ENGINE_INPUTS: EngineInput[] = [
  { label: 'Odd', icon: '💰' },
  { label: 'Probabilidade estimada', icon: '🎯' },
  { label: 'Value', icon: '📊' },
  { label: 'Score', icon: '🧠' },
  { label: 'Banca disponível', icon: '🏦' },
]

type ResultCard = {
  match: string
  league: string
  selection: string
  odd: string
  value: string
  score: string
  confidence: string
}

const RESULTS: ResultCard[] = [
  {
    match: 'Bodø/Glimt vs Union Saint-Gilloise',
    league: 'UEFA Champions League — Qualificação',
    selection: 'Mais de 2.5 Golos',
    odd: '1.75',
    value: '+0.18%',
    score: '82/100',
    confidence: 'ALTA',
  },
  {
    match: 'Västerås SK vs Djurgårdens IF',
    league: 'Swedish Allsvenskan',
    selection: 'Västerås SK',
    odd: '4.6',
    value: '+0.19%',
    score: '80/100',
    confidence: 'ALTA',
  },
]

function ResultCardView({ result }: { result: ResultCard }) {
  const tiltRef = useTilt<HTMLDivElement>(6)
  return (
    <div className="result-card tilt-card" ref={tiltRef}>
      <div className="result-card-header">
        <span className="result-badge">💎 RODRIGOTIPS ELITE</span>
        <span className="result-green">GREEN ✅</span>
      </div>
      <h3 className="result-match">⚽ {result.match}</h3>
      <p className="result-league">🏆 {result.league}</p>
      <div className="result-grid">
        <div className="result-item">
          <span className="email-label">Seleção</span>
          <span className="pick-highlight">{result.selection}</span>
        </div>
        <div className="result-item">
          <span className="email-label">Odd</span>
          <span className="odd-value">{result.odd}</span>
        </div>
        <div className="result-item">
          <span className="email-label">Value</span>
          <span className="value-value">{result.value}</span>
        </div>
        <div className="result-item">
          <span className="email-label">Score</span>
          <span className="score-value">{result.score}</span>
        </div>
      </div>
      <p className="result-confidence">🔥 Confiança: {result.confidence}</p>
    </div>
  )
}

function App() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tgUser, setTgUser] = useState<TgUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)
  const [myInviteLink, setMyInviteLink] = useState<string | null>(null)
  const isSuccess = new URLSearchParams(window.location.search).get('success') === '1'

  const PRICE_CENTS = Number(import.meta.env.VITE_LIFETIME_PRICE_CENTS ?? 19700)
  const PRICE = `${(PRICE_CENTS / 100).toFixed(2)}€`

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram-me')
      const data = await res.json()
      setTgUser(data.loggedIn ? data.user : null)
    } finally {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    // Registers the callback the telegram-login.js embed calls on auth. Must
    // be defined unconditionally — the library evals `onTelegramAuth(data)`
    // in global scope.
    window.onTelegramAuth = async (data: TelegramAuthData) => {
      if (!data.id_token) {
        setError('Login com Telegram falhou. Tenta novamente.')
        return
      }
      const res = await fetch('/api/telegram-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: data.id_token }),
      })
      if (!res.ok) {
        setError('Login com Telegram falhou. Tenta novamente.')
        return
      }
      await refreshAuth()
    }
  }, [refreshAuth])

  const logout = useCallback(async () => {
    await fetch('/api/telegram-logout', { method: 'POST' })
    setTgUser(null)
    setHasAccess(false)
    setMyInviteLink(null)
  }, [])

  useEffect(() => {
    if (isSuccess) window.scrollTo(0, 0)
  }, [isSuccess])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    if (isSuccess || !authChecked || !tgUser) return
    fetch('/api/my-access')
      .then((res) => res.json())
      .then((data) => {
        setHasAccess(!!data.hasAccess)
        setMyInviteLink(data.invite_link ?? null)
      })
      .catch(() => setHasAccess(false))
  }, [isSuccess, authChecked, tgUser])

  const disabledReason = !tgUser ? 'Inicia sessão com o Telegram para comprar' : undefined
  const mascotTiltRef = useTilt<HTMLImageElement>(10)

  if (isSuccess) return <SuccessPage tgUser={tgUser} />

  const handleJoinGroup = async () => {
    if (myInviteLink) {
      window.open(myInviteLink, '_blank', 'noopener,noreferrer')
    }
    try {
      const res = await fetch('/api/refresh-invite', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        setMyInviteLink(data.url)
        if (!myInviteLink) window.open(data.url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      // best-effort — the already-open link (if any) still works
    }
  }

  const handleBuy = async () => {
    if (!tgUser) {
      document.getElementById('tg-auth-bar')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    if (hasAccess) {
      handleJoinGroup()
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (data.already_paid) {
        setHasAccess(true)
        setError('')
      } else {
        setError(data.error || 'Erro ao processar o pagamento. Tenta novamente.')
      }
    } catch {
      setError('Não foi possível ligar ao servidor. Tenta mais tarde.')
    } finally {
      setLoading(false)
    }
  }

  const buyLabel = hasAccess ? 'Entrar no Grupo' : `Acesso Vitalício — ${PRICE}`

  return (
    <div className="app">
      <ParticleField />
      <div className="bg-glow" />

      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="nav-inner">
          <div className="logo">
            <img src={mascot} alt="" className="logo-mascot" />
            <span className="logo-text">
              RodrigoTips <span className="logo-highlight">Engine</span>
            </span>
          </div>
          <button
            className="btn-nav"
            onClick={handleBuy}
            disabled={loading}
            title={disabledReason}
          >
            {hasAccess ? 'Entrar no Grupo' : `Comprar — ${PRICE}`}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-content hero-content-in">
          <img
            src={mascot}
            alt="Mascote RodrigoTips Engine"
            className="hero-mascot tilt-card"
            ref={mascotTiltRef}
          />
          <div className="hero-badge">🤖💎 Sports Analysis Engine</div>
          <h1 className="hero-title">
            Não é só encontrar Value.
            <br />
            <span className="gradient-text">É saber quanto investir.</span>
          </h1>
          <p className="hero-sub">
            O RODRIGOTIPS ENGINE analisa odds, estatísticas, probabilidades e mercados para
            encontrar oportunidades com value — e usa o Critério de Kelly para calcular a stake
            certa em cada uma. Os sinais chegam direto a um grupo privado no Telegram.
          </p>

          <div id="tg-auth-bar">
            <TelegramAuthBar
              tgUser={tgUser}
              onLogout={logout}
              hasAccess={hasAccess}
              onJoinGroup={handleJoinGroup}
            />
          </div>

          <div className="hero-actions">
            <button
              className="btn-primary btn-large"
              onClick={handleBuy}
              disabled={loading}
              title={disabledReason}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <span>{buyLabel}</span>
              )}
            </button>
            <p className="hero-guarantee">
              🔒 Pagamento seguro via Stripe · Acesso imediato ao grupo privado
            </p>
          </div>
          {error && <p className="error-msg">{error}</p>}
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="stats-bar">
        <Reveal className="stats-inner">
          <div className="stat">
            <span className="stat-num">80+</span>
            <span className="stat-label">Score Médio das Oportunidades</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-num">🧠</span>
            <span className="stat-label">Kelly Fracionado</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-num">100%</span>
            <span className="stat-label">Baseado em Dados</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-num">⚡</span>
            <span className="stat-label">Sinais em Tempo Real</span>
          </div>
        </Reveal>
      </section>

      {/* ── Engine explanation ── */}
      <section className="section engine">
        <div className="container">
          <Reveal>
            <p className="section-tag">Decidido 🔥</p>
            <h2 className="section-title">Como o Engine Funciona</h2>
            <p className="engine-sub">
              Para a gestão de banca, o ENGINE utiliza o Critério de Kelly. O sistema tem em conta
              cinco variáveis por oportunidade, e a partir daí calcula a stake adequada.
            </p>
          </Reveal>

          <Reveal className="engine-inputs" delay={80}>
            {ENGINE_INPUTS.map((input) => (
              <div className="engine-input" key={input.label}>
                <span className="engine-input-icon">{input.icon}</span>
                <span>{input.label}</span>
              </div>
            ))}
          </Reveal>

          <Reveal className="engine-flow" delay={140}>
            <div className="engine-flow-step">
              <span className="step-num">Passo [1]</span>
              <p>Análise pré-jogo → odds, estatísticas e mercados avaliados</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="engine-flow-step">
              <span className="step-num">Passo [2]</span>
              <p>Oportunidade identificada → probabilidade, value e score atribuídos</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="engine-flow-step">
              <span className="step-num">Passo [3]</span>
              <p>Kelly fracionado calcula a stake, tendo em conta a banca disponível</p>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <blockquote className="engine-quote">
              🧠 Trabalhamos com Kelly fracionado, para manter uma gestão mais controlada do risco.
              <br />
              <span className="gradient-text">
                Não é apenas encontrar VALUE. É saber quanto investir.
              </span>{' '}
              🤖📈
            </blockquote>
          </Reveal>
        </div>
      </section>

      {/* ── Results showcase ── */}
      <section className="section results">
        <div className="container">
          <Reveal>
            <p className="section-tag">Prova social</p>
            <h2 className="section-title">Alguns Resultados do Engine</h2>
            <p className="engine-sub">
              Análise pré-jogo → oportunidade identificada → GREEN ✅
            </p>
          </Reveal>
          <div className="results-grid">
            {RESULTS.map((result, i) => (
              <Reveal key={result.match} delay={i * 80}>
                <ResultCardView result={result} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="section how">
        <div className="container">
          <Reveal>
            <p className="section-tag">Simples e rápido</p>
            <h2 className="section-title">Como Aderir?</h2>
          </Reveal>
          <Reveal className="steps" delay={100}>
            <div className="step">
              <div className="step-num">Passo [1]</div>
              <div className="step-icon">📲</div>
              <h3>Entras com o Telegram</h3>
              <p>Login rápido e seguro, sem passwords, com a tua conta de Telegram.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-num">Passo [2]</div>
              <div className="step-icon">💳</div>
              <h3>Garantes o Acesso Vitalício</h3>
              <p>Pagamento único de {PRICE} via Stripe. Sem mensalidades.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-num">Passo [3]</div>
              <div className="step-icon">🤖</div>
              <h3>Entras no Grupo Privado</h3>
              <p>
                Recebes o link de convite na hora e passas a receber os sinais do Engine
                diretamente no Telegram.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── What you get ── */}
      <section className="section what">
        <div className="container">
          <div className="what-grid">
            <Reveal className="what-text">
              <p className="section-tag">O que inclui</p>
              <h2 className="section-title">Tudo o que Precisas</h2>
              <p className="what-sub">
                O RODRIGOTIPS ENGINE é um software de análise desportiva que analisa odds,
                estatísticas, probabilidades e mercados para encontrar oportunidades com value.
              </p>
              <ul className="what-list">
                {[
                  'Sinais de value com odd, probabilidade e score',
                  'Stake recomendada via Critério de Kelly fracionado',
                  'Acesso vitalício — sem mensalidades',
                  'Grupo privado no Telegram, sinais em tempo real',
                  'Análise 24/7 baseada em dados, sem emoção',
                  'Fundamentação de cada oportunidade identificada',
                ].map((item) => (
                  <li key={item}>
                    <span className="check">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal className="what-card tilt-card" delay={120}>
              <div className="card-header">
                <span className="card-tag">EXEMPLO DE SINAL</span>
              </div>
              <div className="card-body">
                <ResultCardView result={RESULTS[0]} />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="section pricing" id="pricing">
        <div className="container">
          <Reveal>
            <p className="section-tag">Preço justo</p>
            <h2 className="section-title">Um Preço, Acesso Para Sempre</h2>
          </Reveal>
          <Reveal className="price-card-wrap" delay={100}>
            <div className="price-card tilt-card">
              <div className="price-badge">ACESSO VITALÍCIO</div>
              <div className="price-amount">
                <span className="price-curr">€</span>
                <span className="price-num">{(PRICE_CENTS / 100).toFixed(2).split('.')[0]}</span>
                <span className="price-dec">.{(PRICE_CENTS / 100).toFixed(2).split('.')[1]}</span>
              </div>
              <p className="price-desc">
                Paga uma vez. Entra no grupo. Sem renovações automáticas, sem mensalidades.
              </p>
              <ul className="price-features">
                {[
                  'Sinais do Engine em tempo real no Telegram',
                  'Gestão de banca via Kelly fracionado',
                  'Odd, probabilidade, value e score em cada sinal',
                  'Acesso vitalício ao grupo privado',
                ].map((f) => (
                  <li key={f}>
                    <span className="check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className="btn-primary btn-full"
                onClick={handleBuy}
                disabled={loading}
                title={disabledReason}
              >
                {loading ? <span className="spinner" /> : buyLabel}
              </button>
              <p className="price-secure">🔒 Pagamento 100% seguro via Stripe</p>
              {error && <p className="error-msg">{error}</p>}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="section faq">
        <div className="container container-sm">
          <Reveal>
            <p className="section-tag">Dúvidas frequentes</p>
            <h2 className="section-title">FAQ</h2>
          </Reveal>
          <Reveal className="faq-list" delay={80}>
            <FAQItem
              question="Preciso mesmo de ter Telegram?"
              answer="Sim. O login com Telegram é o que nos permite associar a tua compra à tua conta e gerar o convite para o grupo privado — que também é no Telegram."
            />
            <FAQItem
              question="O que é o Critério de Kelly?"
              answer="É uma fórmula matemática de gestão de banca que calcula a percentagem ideal da banca a apostar em cada oportunidade, com base na odd e na probabilidade estimada. Usamos uma versão fracionada, mais conservadora, para controlar melhor o risco."
            />
            <FAQItem
              question="É pagamento único ou mensalidade?"
              answer="Pagamento único. Pagas uma vez e o acesso ao grupo é vitalício — sem subscrições nem renovações automáticas."
            />
            <FAQItem
              question="Como recebo o acesso ao grupo?"
              answer="Assim que o pagamento é confirmado, geramos automaticamente um link de convite de uso único para o grupo privado no Telegram, disponível nesta página."
            />
            <FAQItem
              question="O pagamento é seguro?"
              answer="Sim. Utilizamos o Stripe, um dos processadores de pagamentos mais seguros do mundo. Os teus dados bancários nunca passam pelos nossos servidores."
            />
            <FAQItem
              question="Há garantia de lucro?"
              answer="Não. O Engine identifica oportunidades com value estatístico, mas apostar desportivo envolve sempre risco e nenhum resultado é garantido. As análises são de caráter informativo."
            />
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="logo">
            <img src={mascot} alt="" className="logo-mascot" />
            <span className="logo-text">
              RodrigoTips <span className="logo-highlight">Engine</span>
            </span>
          </div>
          <p className="footer-disclaimer">
            ⚠️ Apostar pode criar dependência. Joga com responsabilidade. +18.
            As análises são de caráter informativo e não garantem resultados.
          </p>
          <p className="footer-copy">
            © {new Date().getFullYear()} RodrigoTips Engine. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
