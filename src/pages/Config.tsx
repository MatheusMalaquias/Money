import { useRef, useState } from 'react'
import { backupFileName, buildBackup, parseBackup } from '../domain/backup'
import { toBR, todayISO } from '../domain/dates'
import { formatMoney } from '../domain/money'
import { CURRENCIES, type Category, type Currency } from '../domain/types'
import { newId, nowISO, useApp } from '../state/data'
import type { ThemePref } from '../theme'
import { Segmented, inputCls } from '../ui/fields'
import { Card, Screen } from '../ui/Screen'

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
]

const h2 = 'text-sm font-semibold text-muted'

export default function Config({ theme, onTheme }: { theme: ThemePref; onTheme: (t: ThemePref) => void }) {
  const { settings, updateSettings, persistent } = useApp()

  const rename = (id: string, nome: string) =>
    updateSettings({ pessoas: settings.pessoas.map((p) => (p.id === id ? { ...p, nome } : p)) })

  return (
    <Screen title="Ajustes" subtitle="Aparência, pessoas, câmbio e categorias">
      {!persistent && <Card className="border-warn text-sm text-warn">O navegador bloqueou o armazenamento local: nada será salvo ao fechar. Saia da aba anônima.</Card>}

      <Card className="space-y-3">
        <h2 className={h2}>Tema</h2>
        <Segmented label="Tema" value={theme} onChange={onTheme} options={THEMES} />
      </Card>

      <Card className="space-y-3">
        <h2 className={h2}>Moeda dos totais</h2>
        <Segmented label="Moeda dos totais" value={settings.moedaExibicao} onChange={(m) => updateSettings({ moedaExibicao: m })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        <p className="text-xs text-muted">Os totais e o saldo aparecem nesta moeda. Os valores originais continuam guardados em cada lançamento.</p>
      </Card>

      <Card className="space-y-3">
        <h2 className={h2}>Pessoas</h2>
        {settings.pessoas.map((p) => (
          <NameField key={p.id} value={p.nome} onSave={(n) => rename(p.id, n)} />
        ))}
      </Card>

      <TitheCard />
      <CardCfgCard />
      <RatesCard />
      <CategoriesCard />
      <BackupCard />
      <ResetCard />
    </Screen>
  )
}

/** Salva ao sair do campo, sem aceitar nome vazio. */
function NameField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  return <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => (v.trim() ? v.trim() !== value && onSave(v.trim()) : setV(value))} className={inputCls} aria-label="Nome" />
}

function TitheCard() {
  const { settings, updateSettings } = useApp()
  const bps = settings.dizimoBps ?? 1000
  const [text, setText] = useState(String(bps / 100).replace('.', ','))
  const commit = () => {
    const n = Number(text.replace(',', '.'))
    if (Number.isFinite(n) && n >= 0 && n <= 100) void updateSettings({ dizimoBps: Math.round(n * 100) })
    else setText(String(bps / 100).replace('.', ','))
  }
  return (
    <Card className="space-y-3">
      <h2 className={h2}>Dízimo</h2>
      <div className="flex items-center gap-2">
        <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} aria-label="Percentual do dízimo" className={`${inputCls} num`} />
        <span className="text-sm text-muted">% das entradas</span>
      </div>
      <p className="text-xs text-muted">Toda entrada, nova ou antiga, já tem o dízimo calculado sozinho: não é preciso lançar nada. Ao mudar o percentual, as entradas do mês atual em diante são recalculadas; meses anteriores ficam como estavam. Dá para deixar uma entrada de fora (um reembolso, por exemplo) desmarcando "Dízimo automático" nela. Use 0 para desligar.</p>
    </Card>
  )
}

function RatesCard() {
  const { settings, refreshRates, ratesStatus, fixRate } = useApp()
  const { rates, moedaExibicao } = settings
  const others = CURRENCIES.filter((c) => c !== 'USD')
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className={h2}>Câmbio (1 US$ =)</h2>
        <button onClick={() => void refreshRates()} disabled={ratesStatus === 'loading'} className="rounded-full border border-line px-3 py-1 text-xs">
          {ratesStatus === 'loading' ? 'Atualizando…' : 'Atualizar agora'}
        </button>
      </div>
      <p className="text-xs text-muted">
        {rates.date ? `Cotação de referência do Banco Central Europeu, de ${toBR(rates.date)}.` : 'Ainda sem cotação online: valores aproximados.'}
        {ratesStatus === 'error' && ' Não consegui atualizar agora (sem internet?). Usando a última cotação guardada.'} A taxa do seu banco costuma ser diferente: se quiser, fixe a sua.
      </p>
      {others.map((c) => (
        <RateRow key={c} currency={c} value={rates.perUSD[c]} manual={rates.manual.includes(c)} onFix={(v) => fixRate(c, v)} />
      ))}
      <p className="num text-xs text-muted">Exemplo: US$ 1.000,00 = {formatMoney(Math.round(100000 * (rates.perUSD[moedaExibicao] / rates.perUSD.USD)), moedaExibicao)}</p>
    </Card>
  )
}

function RateRow({ currency, value, manual, onFix }: { currency: Currency; value: number; manual: boolean; onFix: (v: number | null) => void }) {
  const [text, setText] = useState(String(value).replace('.', ','))
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    // a cotação mudou por fora (atualização automática): reflete no campo
    setLastValue(value)
    setText(String(value).replace('.', ','))
  }
  const commit = () => {
    const n = Number(text.replace(',', '.'))
    if (Number.isFinite(n) && n > 0 && n !== value) onFix(n)
    else setText(String(value).replace('.', ','))
  }
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-sm font-medium">{currency}</span>
      <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} aria-label={`Cotação do ${currency}`} className={`${inputCls} num flex-1`} />
      {manual ? (
        <button onClick={() => onFix(null)} className="shrink-0 text-xs text-accent underline">Fixa · usar automática</button>
      ) : (
        <span className="shrink-0 text-xs text-muted">automática</span>
      )}
    </div>
  )
}

function CategoriesCard() {
  const { categories, saveCategory, removeCategory } = useApp()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')

  const add = async () => {
    if (!nome.trim()) return
    const now = nowISO()
    await saveCategory({ id: newId(), createdAt: now, updatedAt: now, nome: nome.trim(), cor: '#94a3b8', ordem: categories.length })
    setNome('')
  }
  const del = async (c: Category) => {
    try {
      await removeCategory(c.id)
      setErro('')
    } catch {
      setErro(c.chave ? `"${c.nome}" é usada pelo dízimo automático e não pode ser excluída. Você pode renomeá-la.` : `"${c.nome}" está em uso por contas ou lançamentos. Renomeie em vez de excluir.`)
    }
  }
  return (
    <Card className="space-y-3">
      <h2 className={h2}>Categorias</h2>
      {categories.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <input type="color" value={c.cor} onChange={(e) => void saveCategory({ ...c, cor: e.target.value, updatedAt: nowISO() })} aria-label={`Cor de ${c.nome}`} className="h-9 w-9 shrink-0 rounded-lg border border-line bg-transparent p-0.5" />
          <NameField value={c.nome} onSave={(n) => void saveCategory({ ...c, nome: n, updatedAt: nowISO() })} />
          <button onClick={() => void del(c)} aria-label={`Excluir ${c.nome}`} className="px-2 text-lg text-muted">×</button>
        </div>
      ))}
      {erro && <p className="text-xs text-bad">{erro}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void add() }} className="flex gap-2">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nova categoria" className={inputCls} />
        <button type="submit" disabled={!nome.trim()} className="rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-40">Adicionar</button>
      </form>
    </Card>
  )
}

/** Os dados ficam só neste aparelho: o backup é a única cópia de segurança. */
function BackupCard() {
  const { exportData, importData } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const doExport = async () => {
    const json = JSON.stringify(buildBackup(await exportData(), nowISO()), null, 2)
    const file = new File([json], backupFileName(todayISO()), { type: 'application/json' })
    try {
      // no celular abre a folha de compartilhamento (Salvar em Arquivos, enviar por WhatsApp…)
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
        setMsg({ ok: true, text: 'Backup pronto.' })
        return
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // a pessoa fechou a folha de compartilhamento
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMsg({ ok: true, text: `Backup baixado: ${file.name}` })
  }

  const doImport = async (file: File) => {
    try {
      const snap = parseBackup(await file.text())
      const n = snap.data.transactions.length + snap.data.bills.length + snap.data.goals.length
      if (!confirm(`Importar "${file.name}" (${n} registros)? Isso SUBSTITUI todos os dados atuais deste aparelho.`)) return
      await importData(snap)
      setMsg({ ok: true, text: 'Backup importado.' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className={h2}>Backup</h2>
      <p className="text-xs text-muted">Seus dados ficam só neste aparelho. Exporte de vez em quando: é também como passam os dados de um celular para outro.</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => void doExport()} className="rounded-lg bg-accent py-2.5 text-sm font-semibold text-on-accent">Exportar</button>
        <button onClick={() => input.current?.click()} className="rounded-lg border border-line py-2.5 text-sm font-medium">Importar</button>
      </div>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doImport(f) }} />
      {msg && <p role="status" className={`text-xs ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p>}
    </Card>
  )
}

/** Apaga os dados (lançamentos, contas, metas, reserva) e mantém os ajustes e as categorias. Exige digitar ZERAR. */
function ResetCard() {
  const { categories, settings, importData } = useApp()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const ok = text.trim().toUpperCase() === 'ZERAR'

  const reset = async () => {
    await importData({ data: { categories, bills: [], transactions: [], goals: [], rules: [] }, settings })
    setOpen(false)
    setText('')
    setDone(true)
  }

  return (
    <Card className="space-y-3 border-bad/40">
      <h2 className="text-sm font-semibold text-bad">Zerar tudo</h2>
      <p className="text-xs text-muted">
        Apaga todos os lançamentos, contas, metas e movimentos da reserva <b>deste aparelho</b>. Os ajustes (nomes, moeda, dízimo, câmbio) e as categorias ficam. Não dá para desfazer: faça um Exportar antes se quiser guardar uma cópia.
      </p>
      {!open ? (
        <button onClick={() => { setOpen(true); setDone(false) }} className="w-full rounded-lg border border-bad/60 py-2.5 text-sm font-medium text-bad">
          Zerar todos os dados
        </button>
      ) : (
        <div className="space-y-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Digite ZERAR para confirmar' aria-label="Confirmação" autoCapitalize="characters" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setOpen(false); setText('') }} className="rounded-lg border border-line py-2.5 text-sm">Cancelar</button>
            <button onClick={() => void reset()} disabled={!ok} className="rounded-lg bg-bad py-2.5 text-sm font-semibold text-white disabled:opacity-40">Apagar tudo</button>
          </div>
        </div>
      )}
      {done && <p role="status" className="text-xs text-good">Tudo zerado. O app está como novo.</p>}
    </Card>
  )
}

/** Dia em que a fatura do cartão fecha e dia em que vence: usados ao cadastrar compras no cartão. */
function CardCfgCard() {
  const { settings, updateSettings } = useApp()
  const cfg = settings.cartao ?? { fechamento: 19, vencimento: 26 }
  const save = (patch: Partial<typeof cfg>) => void updateSettings({ cartao: { ...cfg, ...patch } })
  return (
    <Card className="space-y-3">
      <h2 className={h2}>Cartão de crédito</h2>
      <div className="grid grid-cols-2 gap-3">
        <DayField label="Fatura fecha no dia" value={cfg.fechamento} onSave={(v) => save({ fechamento: v })} />
        <DayField label="Vence no dia" value={cfg.vencimento} onSave={(v) => save({ vencimento: v })} />
      </div>
      <p className="text-xs text-muted">Ao cadastrar uma conta como "Compra no cartão", o vencimento é calculado sozinho: compra até o dia {cfg.fechamento} entra na fatura que vence dia {cfg.vencimento}; depois dele, na do mês seguinte.</p>
    </Card>
  )
}

function DayField({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  const commit = () => {
    const n = Number(text)
    if (Number.isInteger(n) && n >= 1 && n <= 31) n !== value && onSave(n)
    else setText(String(value))
  }
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input inputMode="numeric" value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={commit} className={`${inputCls} num`} />
    </label>
  )
}
