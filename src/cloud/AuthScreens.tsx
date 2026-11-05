import { useState, type FormEvent, type ReactNode } from 'react'
import { inputCls } from '../ui/fields'
import { Logo } from '../ui/Logo'
import { getClient } from './client'

/** Mensagens em português para os erros do Supabase (o texto original vem em inglês e pode vazar detalhes). */
export function authMessage(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (m.includes('already registered')) return 'Já existe uma conta com esse e-mail. Entre, ou use "Esqueci a senha".'
  if (m.includes('at least') && m.includes('password')) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Espere alguns minutos e tente de novo.'
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com a internet.'
  if (m.includes('invalid_code')) return 'Código não encontrado. Confira com quem criou o espaço.'
  if (m.includes('household_full')) return 'Este espaço já tem duas pessoas.'
  if (m.includes('already_member')) return 'Você já faz parte de um espaço.'
  return 'Não foi possível concluir. Tente de novo.'
}

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
const redirect = () => `${location.origin}${import.meta.env.BASE_URL}`

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-6 px-6 py-8 safe-top">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={56} />
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

const btn = 'w-full rounded-lg bg-accent py-3 text-sm font-semibold text-on-accent disabled:opacity-40'
const link = 'text-xs text-muted underline'

export function AuthScreen() {
  const [mode, setMode] = useState<'entrar' | 'criar' | 'esqueci'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const valid = emailOk(email) && (mode === 'esqueci' || senha.length >= 8) && (mode !== 'criar' || senha === senha2)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setMsg(null)
    const auth = getClient().auth
    try {
      if (mode === 'entrar') {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) setMsg({ ok: false, text: authMessage(error.message) })
      } else if (mode === 'criar') {
        const { data, error } = await auth.signUp({ email: email.trim(), password: senha, options: { emailRedirectTo: redirect() } })
        if (error) setMsg({ ok: false, text: authMessage(error.message) })
        else if (!data.session) setMsg({ ok: true, text: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.' })
      } else {
        const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect() })
        setMsg(error ? { ok: false, text: authMessage(error.message) } : { ok: true, text: 'Se o e-mail tiver conta, enviamos um link para criar uma nova senha.' })
      }
    } catch (err) {
      setMsg({ ok: false, text: authMessage(String((err as Error).message)) })
    }
    setBusy(false)
  }

  const go = (m: typeof mode) => {
    setMode(m)
    setMsg(null)
    setSenha('')
    setSenha2('')
  }

  return (
    <Shell title="Money" subtitle={mode === 'entrar' ? 'Entre com a sua conta' : mode === 'criar' ? 'Crie a sua conta' : 'Recuperar a senha'}>
      <form onSubmit={submit} className="space-y-3">
        <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" aria-label="E-mail" className={inputCls} />
        {mode !== 'esqueci' && (
          <input type="password" autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={mode === 'criar' ? 'Senha (mínimo 8 caracteres)' : 'Senha'} aria-label="Senha" className={inputCls} />
        )}
        {mode === 'criar' && (
          <>
            <input type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} placeholder="Repita a senha" aria-label="Repita a senha" className={inputCls} />
            {senha2 !== '' && senha !== senha2 && <p className="text-xs text-bad">As senhas são diferentes.</p>}
          </>
        )}
        <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-center text-xs ${msg?.ok ? 'text-good' : 'text-bad'}`}>{msg?.text}</p>
        <button type="submit" disabled={!valid || busy} className={btn}>
          {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Enviar link'}
        </button>
      </form>
      <div className="flex flex-col items-center gap-2">
        {mode === 'entrar' ? (
          <>
            <button onClick={() => go('criar')} className={link}>Criar uma conta</button>
            <button onClick={() => go('esqueci')} className={link}>Esqueci a senha</button>
          </>
        ) : (
          <button onClick={() => go('entrar')} className={link}>Voltar para entrar</button>
        )}
      </div>
    </Shell>
  )
}

/** Aberta pelo link do e-mail de recuperação. */
export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = senha.length >= 8 && senha === senha2

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    const { error } = await getClient().auth.updateUser({ password: senha })
    setBusy(false)
    if (error) setErr(authMessage(error.message))
    else onDone()
  }
  return (
    <Shell title="Nova senha" subtitle="Escolha a nova senha da sua conta">
      <form onSubmit={submit} className="space-y-3">
        <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha (mínimo 8 caracteres)" aria-label="Nova senha" className={inputCls} />
        <input type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} placeholder="Repita a nova senha" aria-label="Repita a nova senha" className={inputCls} />
        {senha2 !== '' && senha !== senha2 && <p className="text-xs text-bad">As senhas são diferentes.</p>}
        <p role="alert" className="min-h-[1.25rem] text-center text-xs text-bad">{err}</p>
        <button type="submit" disabled={!valid || busy} className={btn}>{busy ? 'Aguarde…' : 'Salvar nova senha'}</button>
      </form>
    </Shell>
  )
}

/** Primeira vez da conta: criar o espaço do casal ou entrar no que a outra pessoa criou. */
export function HouseholdSetup({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [nome, setNome] = useState('Casal')
  const [codigo, setCodigo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true)
    setErr('')
    try {
      const { error } = await fn()
      if (error) setErr(authMessage(error.message))
      else onDone()
    } catch (e) {
      setErr(authMessage(String((e as Error).message)))
    }
    setBusy(false)
  }

  return (
    <Shell title="Espaço do casal" subtitle="É onde ficam os dados que vocês dois compartilham">
      <div className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); void run(() => getClient().rpc('money_create_household', { p_name: nome })) }} className="space-y-2 rounded-xl border border-line bg-card p-4">
          <h2 className="text-sm font-semibold">Sou o primeiro a entrar</h2>
          <p className="text-xs text-muted">Cria o espaço e gera um código para a outra pessoa entrar. Os dados que já estão neste aparelho sobem para ele.</p>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} aria-label="Nome do espaço" className={inputCls} />
          <button type="submit" disabled={busy} className={btn}>Criar o espaço</button>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); void run(() => getClient().rpc('money_join_household', { p_code: codigo })) }} className="space-y-2 rounded-xl border border-line bg-card p-4">
          <h2 className="text-sm font-semibold">Tenho um código</h2>
          <p className="text-xs text-muted">Digite o código que a outra pessoa recebeu ao criar o espaço (em Ajustes → Conta).</p>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 12))} placeholder="Código de 12 caracteres" aria-label="Código do espaço" autoCapitalize="none" autoComplete="off" className={`${inputCls} num`} />
          <button type="submit" disabled={busy || codigo.length < 12} className={btn}>Entrar no espaço</button>
        </form>
        <p role="alert" className="min-h-[1.25rem] text-center text-xs text-bad">{err}</p>
      </div>
      <button onClick={onSignOut} className={`${link} self-center`}>Sair da conta</button>
    </Shell>
  )
}

export function StatusScreen({ title, text, action }: { title: string; text?: string; action?: { label: string; run: () => void }[] }) {
  return (
    <Shell title={title} subtitle={text}>
      {action && (
        <div className="space-y-2">
          {action.map((a, i) => (
            <button key={a.label} onClick={a.run} className={i === 0 ? btn : 'w-full rounded-lg border border-line py-3 text-sm'}>{a.label}</button>
          ))}
        </div>
      )}
    </Shell>
  )
}
