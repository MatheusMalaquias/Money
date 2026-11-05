import { useState } from 'react'
import { clampedDate, todayISO, toBR } from '../domain/dates'
import { cardInvoice, DEFAULT_CARD } from '../domain/card'
import { occurrences } from '../domain/recurrence'
import { centsToInput, formatMoney, parseAmount } from '../domain/money'
import type { Bill, Currency, PersonId, Recurrence } from '../domain/types'
import { newId, nowISO, useApp } from '../state/data'
import { AmountInput, ConversionHint, Field, Segmented, inputCls, peopleOptions } from './fields'
import { Sheet } from './Sheet'

export default function BillSheet({ bill, defaultPessoa, defaultDate, onSaved, onClose }: { bill: Bill | null; defaultPessoa: PersonId; /** Data pré-preenchida ao tocar num dia do calendário. */ defaultDate?: string; onSaved: (paid: boolean) => void; onClose: () => void }) {
  const { categories, settings, bills, saveBill, createBill, removeBill, removeBillAndNext } = useApp()
  const [descricao, setDescricao] = useState(bill?.descricao ?? '')
  const [amount, setAmount] = useState(bill ? centsToInput(bill.valorCents) : '')
  const [moeda, setMoeda] = useState<Currency>(bill?.moeda ?? settings.moedaExibicao)
  const [vencimento, setVencimento] = useState(bill?.vencimento ?? defaultDate ?? todayISO())
  // só no cadastro: compra no cartão, em que o vencimento vem da fatura (fecha dia 19, vence dia 26)
  const [origem, setOrigem] = useState<'conta' | 'cartao'>('conta')
  const [compra, setCompra] = useState(defaultDate ?? todayISO())
  const [categoriaId, setCategoriaId] = useState(bill?.categoriaId ?? categories[0]?.id ?? '')
  const [pessoa, setPessoa] = useState<PersonId>(bill?.pessoa ?? defaultPessoa)
  const [recorrencia, setRecorrencia] = useState<Recurrence>(bill?.recorrencia ?? 'mensal')
  // só no cadastro: a conta pode já ter sido paga (nasce na aba Pagas e desconta do total)
  const [situacao, setSituacao] = useState<'pendente' | 'paga'>('pendente')
  const [pagaEm, setPagaEm] = useState(todayISO())
  const [fimMes, setFimMes] = useState(bill?.fim?.slice(0, 7) ?? '') // 'YYYY-MM' ou vazio = sem fim
  const cents = parseAmount(amount)
  const paid = bill?.status === 'paga'
  // há parcelas pendentes depois desta na mesma conta (mensal/anual)?
  const hasNext = !!bill && bills.some((x) => x.serieId === bill.serieId && x.id !== bill.id && x.status === 'pendente' && x.vencimento >= bill.vencimento)
  const cfg = settings.cartao ?? DEFAULT_CARD
  const fatura = !bill && origem === 'cartao' ? cardInvoice(compra, cfg) : null
  const venc = fatura ? fatura.vence : vencimento
  const dia = Number(venc.slice(8, 10))
  const fim = recorrencia !== 'unica' && fimMes ? clampedDate(fimMes, dia) : undefined
  const fimOk = !fim || fim >= venc
  const parcelas = fim && fimOk ? occurrences(venc, recorrencia, dia, fim).length : 0
  const valid = descricao.trim().length > 0 && cents !== null && cents > 0 && !!venc && !!categoriaId && fimOk && (situacao === 'pendente' || !!pagaEm)

  const save = async () => {
    const now = nowISO()
    const base: Bill = bill ?? { id: newId(), createdAt: now, updatedAt: now, descricao: '', valorCents: 0, moeda, vencimento: venc, diaAncora: 1, categoriaId, pessoa, recorrencia, status: 'pendente', serieId: newId() }
    const next: Bill = {
      ...base,
      descricao: descricao.trim(),
      valorCents: cents!,
      moeda,
      vencimento: venc,
      cartao: bill ? bill.cartao : fatura ? true : undefined,
      compraEm: bill ? bill.compraEm : fatura ? compra : undefined,
      // o dia escolhido vira a âncora: assim uma conta do dia 31 não "escorrega" para o 28 depois de fevereiro
      diaAncora: dia,
      categoriaId,
      pessoa,
      recorrencia,
      fim,
      updatedAt: now,
    }
    if (bill) await saveBill(next)
    else await createBill(next, situacao === 'paga' ? pagaEm : undefined)
    onSaved(!bill && situacao === 'paga')
    onClose()
  }

  return (
    <Sheet
      title={bill ? 'Editar conta' : 'Nova conta'}
      onClose={onClose}
      onSubmit={save}
      canSubmit={valid}
      danger={
        bill
          ? [
              {
                label: paid ? 'Excluir conta e pagamento' : 'Excluir',
                onClick: async () => {
                  if (paid && !confirm(`Excluir "${bill.descricao}" e o pagamento de ${formatMoney(bill.valorCents, bill.moeda)}? O valor volta ao total.`)) return
                  await removeBill(bill.id)
                  onClose()
                },
              },
              ...(hasNext
                ? [
                    {
                      label: 'Esta e as próximas',
                      onClick: async () => {
                        if (!confirm(`Excluir esta conta${paid ? ' (com o pagamento)' : ''} e as próximas parcelas pendentes?`)) return
                        await removeBillAndNext(bill.id)
                        onClose()
                      },
                    },
                  ]
                : []),
            ]
          : undefined
      }
    >
      {!bill && (
        <Segmented
          label="Situação"
          value={situacao}
          onChange={setSituacao}
          options={[{ value: 'pendente', label: 'Ainda não paguei' }, { value: 'paga', label: 'Já foi paga' }]}
        />
      )}
      {!bill && (
        <Segmented
          label="Tipo"
          value={origem}
          // compra no cartão costuma ser única (ou parcelada: aí escolha Mensal e o mês final); conta fixa costuma ser mensal
          onChange={(v) => {
            setOrigem(v)
            setRecorrencia(v === 'cartao' ? 'unica' : 'mensal')
          }}
          options={[{ value: 'conta', label: 'Conta com vencimento' }, { value: 'cartao', label: 'Compra no cartão' }]}
        />
      )}
      <Field label="Descrição">
        <input autoFocus={!bill} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Aluguel" className={inputCls} />
      </Field>
      <Field label="Valor">
        <AmountInput amount={amount} currency={moeda} onAmount={setAmount} onCurrency={setMoeda} />
      </Field>
      <ConversionHint cents={cents} from={moeda} to={settings.moedaExibicao} rates={settings.rates} />
      <div className="grid grid-cols-2 gap-3">
        {fatura ? (
          <Field label="Data da compra">
            <input type="date" value={compra} onChange={(e) => setCompra(e.target.value)} className={inputCls} />
          </Field>
        ) : (
          <Field label="Vencimento">
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={inputCls} />
          </Field>
        )}
        <Field label="Quem paga">
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={inputCls}>
            {peopleOptions(settings).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Field>
      </div>
      {fatura && (
        <p className="rounded-lg bg-raised px-3 py-2 text-xs text-muted">
          Entra na fatura que fecha em <b className="text-main">{toBR(fatura.fecha)}</b> e vence em <b className="text-main">{toBR(fatura.vence)}</b>. Compra até o dia {cfg.fechamento} cai nessa fatura; depois dele, na seguinte.
        </p>
      )}
      <Field label="Categoria">
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={inputCls}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>
      <Field label="Repetição">
        <Segmented label="Repetição" value={recorrencia} onChange={setRecorrencia} options={[{ value: 'unica', label: 'Única' }, { value: 'mensal', label: 'Mensal' }, { value: 'anual', label: 'Anual' }]} />
      </Field>
      {!bill && situacao === 'paga' && (
        <>
          <Field label="Pago em">
            <input type="date" value={pagaEm} max={todayISO()} onChange={(e) => setPagaEm(e.target.value)} className={inputCls} />
          </Field>
          <p className="text-xs text-muted">Fica em Pagas e já sai do total na data do pagamento.{recorrencia !== 'unica' ? ' A próxima parcela fica em Pendentes.' : ''}</p>
        </>
      )}
      {recorrencia !== 'unica' && (
        <Field label="Repetir até (opcional)">
          <input type="month" value={fimMes} min={venc.slice(0, 7)} onChange={(e) => setFimMes(e.target.value)} className={inputCls} />
        </Field>
      )}
      {recorrencia !== 'unica' && (
        <p className={`text-xs ${fimOk ? 'text-muted' : 'text-bad'}`}>
          {!fimOk
            ? 'O mês final não pode ser antes do primeiro vencimento.'
            : fim
              ? bill
                ? `Termina em ${toBR(fim).slice(3)}. As parcelas que faltarem até lá serão criadas; as que passarem desse mês, removidas.`
                : `Serão criadas ${parcelas} ${parcelas === 1 ? 'parcela' : 'parcelas'}, de ${toBR(venc)} até ${toBR(fim)}.`
              : 'Sem data final: repete para sempre. Para as últimas parcelas de uma conta, escolha o mês da última.'}
        </p>
      )}
      {bill && bill.fim && <p className="text-xs text-muted">Mudar o valor ou a categoria vale só para esta parcela.</p>}
      {paid && <p className="text-xs text-muted">Excluir apaga a conta e o pagamento dela: o valor volta ao total. Para só desfazer o pagamento, use o círculo na lista.</p>}
    </Sheet>
  )
}
