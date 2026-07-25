import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/lib/hooks'
import { Modal, Btn, Badge, TierPill, Spinner } from '@/components/ui'
import { SchoolMark } from '@/components/SchoolMark'
import { TIERS, TIER_META } from '@/data/mockDb'
import { fmtMoney } from '@/lib/format'
import type { School, Tier } from '@/types'
import { useOwnerPlans } from '@/api/hooks/useOwner'
import {
  createUpgradeRequest,
  createRazorpayOrder,
  confirmUpgradePayment,
  loadRazorpayScript,
  type UpgradeMode,
} from '@/api/upgradeRequests'
import { ApiError } from '@/api/ApiError'
import type { Plan } from '@/api/ownerTypes'

const TIER_RANK: Record<string, number> = { silver: 1, gold: 2, platinum: 3 }

function planAmount(p: Plan, students: number): number {
  if ((p.pricing ?? '').toLowerCase() === 'per_student') {
    const rate = Number(p.per_student) || 0
    const min = Number(p.min_students) || 0
    const seats = Math.max(students, min, 1)
    return rate * seats
  }
  return Number(p.price) || 0
}

export function UpgradePlanModal({
  school,
  onClose,
  isPlatform,
}: {
  school: School | null
  onClose: () => void
  isPlatform: boolean
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const plansQ = useOwnerPlans(isPlatform)
  const [mode, setMode] = useState<UpgradeMode>('offline')
  const [planId, setPlanId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const upgradePlans = useMemo(() => {
    if (!school) return []
    const cur = TIER_RANK[school.plan] ?? 0
    return (plansQ.data ?? [])
      .filter((p) => (TIER_RANK[(p.tier ?? '').toLowerCase()] ?? 0) > cur)
      .sort((a, b) => (TIER_RANK[a.tier] ?? 0) - (TIER_RANK[b.tier] ?? 0))
  }, [plansQ.data, school])

  const selected = upgradePlans.find((p) => p.id === planId) ?? upgradePlans[0] ?? null

  if (!school) return null

  const submit = async () => {
    if (!selected) {
      toast.info('No upgrade available', 'This school is already on the highest published plan.')
      return
    }
    setBusy(true)
    try {
      const created = await createUpgradeRequest(school.id, selected.id, mode)
      if (mode === 'offline') {
        toast.success('Request submitted', 'Catre admin will confirm payment and activate the plan.')
        await qc.invalidateQueries({ queryKey: ['owner'] })
        onClose()
        return
      }

      let order
      try {
        order = await createRazorpayOrder(created.id)
      } catch (e) {
        const notConfigured = e instanceof ApiError && e.code === 'payment_not_configured'
        toast.info(
          'Payment not done',
          notConfigured
            ? 'Razorpay is not configured. Request stays pending payment — use Offline mode or add keys and pay.'
            : (e instanceof ApiError ? e.message : 'Could not start Razorpay.'),
        )
        await qc.invalidateQueries({ queryKey: ['owner'] })
        onClose()
        return
      }

      const ok = await loadRazorpayScript()
      if (!ok || !window.Razorpay) {
        toast.info('Payment not done', 'Razorpay checkout did not load. Payment is still pending — try offline.')
        return
      }

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.key_id,
          amount: order.amount_paise,
          currency: order.currency,
          name: 'SchoolMate',
          description: `Upgrade ${school.name} → ${selected.name}`,
          order_id: order.order_id,
          handler: async (response: {
            razorpay_order_id: string
            razorpay_payment_id: string
            razorpay_signature: string
          }) => {
            try {
              await confirmUpgradePayment(created.id, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              })
              toast.success('Payment received', 'Waiting for Catre admin approval to activate the plan.')
              await qc.invalidateQueries({ queryKey: ['owner'] })
              onClose()
              resolve()
            } catch (e) {
              reject(e)
            }
          },
          modal: {
            ondismiss: () => {
              toast.info('Payment not completed', 'Checkout closed — payment is still pending.')
              resolve()
            },
          },
        })
        rzp.open()
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Please try again.'
      toast.danger('Upgrade failed', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      icon="sparkle"
      size="md"
      title={`Upgrade plan · ${school.name}`}
      sub={`Currently ${TIER_META[school.plan].label} · live Catre plans`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={busy || !selected} onClick={() => { void submit() }}>
            {busy ? 'Working…' : mode === 'online' ? 'Pay with Razorpay' : 'Request offline upgrade'}
          </Btn>
        </div>
      }
    >
      <div className="row ai-center gap12" style={{ marginBottom: 14 }}>
        <SchoolMark school={school} size={40} />
        <div>
          <div className="fw7">{school.name}</div>
          <div className="t-xs muted">{school.city}</div>
        </div>
      </div>
      {plansQ.isLoading ? (
        <div className="col ai-center gap12" style={{ padding: 24 }}><Spinner size={28} /><div className="t-sm muted">Loading plans…</div></div>
      ) : upgradePlans.length === 0 ? (
        <div className="t-sm muted">No higher published plans are available for this school.</div>
      ) : (
        <div className="col gap12">
          <div className="col gap8">
            {upgradePlans.map((p) => {
              const tier = ((TIERS as readonly string[]).includes((p.tier ?? '').toLowerCase())
                ? p.tier!.toLowerCase()
                : 'gold') as Tier
              const amount = planAmount(p, school.students)
              const active = (selected?.id ?? '') === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  className="sm-card pad row ai-center jc-between gap12"
                  style={{
                    cursor: 'pointer',
                    textAlign: 'left',
                    borderColor: active ? TIER_META[tier].color : undefined,
                    borderWidth: active ? 2 : undefined,
                    background: 'var(--surface)',
                  }}
                  onClick={() => setPlanId(p.id)}
                >
                  <div className="row ai-center gap10">
                    <TierPill plan={tier} size="md" />
                    <div>
                      <div className="fw6">{p.name}</div>
                      <div className="t-xs muted">{p.period || 'month'}</div>
                    </div>
                  </div>
                  <div className="fw7">{fmtMoney(amount)}</div>
                </button>
              )
            })}
          </div>

          <div className="row gap8 wrap">
            <Btn
              size="sm"
              variant={mode === 'offline' ? 'primary' : 'secondary'}
              onClick={() => setMode('offline')}
            >
              Pay offline
            </Btn>
            <Btn
              size="sm"
              variant={mode === 'online' ? 'primary' : 'secondary'}
              onClick={() => setMode('online')}
            >
              Pay online (Razorpay)
            </Btn>
          </div>
          <div className="t-xs muted">
            {mode === 'offline'
              ? 'Catre admin confirms your bank/NEFT payment, then activates the plan.'
              : 'Pay now with Razorpay, then Catre admin approves to activate the plan.'}
          </div>
          {selected && (
            <div className="row ai-center gap8">
              <Badge tone="brand">Selected</Badge>
              <span className="t-sm">{selected.name} · {fmtMoney(planAmount(selected, school.students))}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
