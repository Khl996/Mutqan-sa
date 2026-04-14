/**
 * QuotesPage.tsx  —  Platform Admin: Pricing Quotes Management
 *
 * Three tabs:
 *   1. Quotes     — list + create + approve + activate
 *   2. Add-ons    — manage billable add-on catalog
 *   3. Discounts  — manage named discount policies
 *
 * Uses the unified billing engine (migration 101+).
 * All pricing is calculated server-side via engine_calculate().
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
    FileText, Plus, CheckCircle2, XCircle, Zap, ChevronDown, ChevronUp,
    Package, Tag, Edit2, Loader2, RefreshCw, AlertCircle,
    CalendarDays, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    useBillingQuotes,
    useBillingQuote,
    useBillingAddOns,
    useDiscountPolicies,
    useCreateBillingAddOn,
    useUpdateBillingAddOn,
    useEngineCalculate,
    useEngineCreateQuote,
    useEngineApproveQuote,
    useEngineActivateFromQuote,
    useCreateDiscountPolicy,
    useUpdateDiscountPolicy,
    quoteStatusColor,
    formatSAR,
    fmtDate,
    type BillingAddOn,
    type BillingQuote,
    type BillingQuoteStatus,
    type BillingCycle,
    type DiscountPolicy,
} from '@/hooks/useBillingEngine'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'
import { useTenants } from '@/hooks/useTenants'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status, isRTL }: { status: BillingQuoteStatus; isRTL: boolean }) {
    const labels: Record<BillingQuoteStatus, { en: string; ar: string }> = {
        draft:     { en: 'Draft',     ar: 'مسودة' },
        approved:  { en: 'Approved',  ar: 'معتمد' },
        activated: { en: 'Activated', ar: 'مُفعَّل' },
        expired:   { en: 'Expired',   ar: 'منتهي' },
    }
    const info = labels[status] ?? labels.draft
    return (
        <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide', quoteStatusColor(status))}>
            {isRTL ? info.ar : info.en}
        </span>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE DETAIL PANEL
// ─────────────────────────────────────────────────────────────────────────────

function QuoteDetailPanel({
    quoteId, isRTL, onClose,
}: {
    quoteId: string; isRTL: boolean; onClose: () => void
}) {
    const { t } = useTranslation()
    const { data: quote, isLoading } = useBillingQuote(quoteId)
    const approve  = useEngineApproveQuote()
    const activate = useEngineActivateFromQuote()
    const [confirmActivate, setConfirmActivate] = useState(false)

    if (isLoading || !quote) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-secondary" />
            </div>
        )
    }

    const canApprove  = quote.status === 'draft'
    const canActivate = quote.status === 'approved'

    const handleApprove = async () => {
        try {
            await approve.mutateAsync({ quoteId: quote.id })
            toast.success(t('billing.success.quote_approved'))
        } catch (e: unknown) {
            toast.error((e as Error).message)
        }
    }

    const handleActivate = async () => {
        try {
            const result = await activate.mutateAsync({ quoteId: quote.id })
            toast.success(
                isRTL
                    ? `تم تفعيل الاشتراك من العرض`
                    : `Subscription activated from quote ${result.invoice_number ?? ''}`
            )
            setConfirmActivate(false)
            onClose()
        } catch (e: unknown) {
            toast.error((e as Error).message)
            setConfirmActivate(false)
        }
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b shrink-0">
                <div>
                    <h2 className="text-lg font-bold font-cairo text-primary">{quote.quote_number}</h2>
                    <p className="text-sm text-muted-foreground font-cairo mt-0.5">
                        {isRTL ? quote.tenant?.name_ar || quote.tenant?.name : quote.tenant?.name}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <StatusBadge status={quote.status} isRTL={isRTL} />
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-muted/10">
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground font-cairo">
                    <div>
                        <span className="block font-semibold mb-0.5">{t('billing.quote.plan_label')}</span>
                        <span>{isRTL ? quote.plan?.name_ar || quote.plan?.name : quote.plan?.name || '—'}</span>
                    </div>
                    <div>
                        <span className="block font-semibold mb-0.5">{t('billing.quote.billing_label')}</span>
                        <span>{quote.billing_cycle === 'yearly' ? t('billing.plan.yearly') : t('billing.plan.monthly')}</span>
                    </div>
                    <div>
                        <span className="block font-semibold mb-0.5">{t('billing.quote.valid_until')}</span>
                        <span>{fmtDate(quote.valid_until)}</span>
                    </div>
                    <div>
                        <span className="block font-semibold mb-0.5">{t('billing.quote.created_label')}</span>
                        <span>{fmtDate(quote.created_at)}</span>
                    </div>
                </div>

                {/* Line items */}
                {quote.line_items && quote.line_items.length > 0 && (
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 font-cairo">
                            {t('billing.quote.breakdown_title')}
                        </h3>
                        <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/5 border-b">
                                    <tr>
                                        <th className="text-start px-3 py-2 font-cairo text-xs text-muted-foreground font-semibold">
                                            {t('billing.quote.col_item')}
                                        </th>
                                        <th className="text-end px-3 py-2 font-cairo text-xs text-muted-foreground font-semibold">
                                            {t('billing.quote.col_amount')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {quote.line_items.map((item, i) => (
                                        <tr key={i} className={cn(item.type === 'discount' && 'bg-green-50')}>
                                            <td className="px-3 py-2.5 font-cairo text-xs">
                                                {isRTL ? item.name_ar || item.name : item.name}
                                            </td>
                                            <td className={cn(
                                                'px-3 py-2.5 text-end font-mono text-xs font-bold',
                                                item.subtotal < 0 ? 'text-green-600' : ''
                                            )}>
                                                {formatSAR(item.subtotal)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Totals */}
                <div className="bg-muted/5 rounded-xl p-4 space-y-2 text-sm font-cairo border">
                    <div className="flex justify-between text-muted-foreground">
                        <span>{t('billing.pricing.subtotal')}</span>
                        <span>{formatSAR(quote.subtotal)}</span>
                    </div>
                    {quote.discount_amount > 0 && (
                        <div className="flex justify-between text-green-600">
                            <span>{t('billing.pricing.discount_amount')}</span>
                            <span>-{formatSAR(quote.discount_amount)}</span>
                        </div>
                    )}
                    {quote.tax_amount > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                            <span>{isRTL ? `ضريبة ${Math.round(quote.tax_rate * 100)}%` : `VAT ${Math.round(quote.tax_rate * 100)}%`}</span>
                            <span>{formatSAR(quote.tax_amount)}</span>
                        </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold text-base">
                        <span>{t('billing.quote.total_label')}</span>
                        <span className="text-secondary">{formatSAR(quote.total)}</span>
                    </div>
                </div>

                {quote.admin_notes && (
                    <div className="text-xs font-cairo">
                        <span className="block font-semibold mb-1 text-muted-foreground">{t('billing.quote.admin_notes_field')}</span>
                        <p className="bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-800">{quote.admin_notes}</p>
                    </div>
                )}
            </div>

            {/* Action footer */}
            {(canApprove || canActivate) && (
                <div className="border-t p-4 shrink-0 flex flex-wrap gap-2">
                    {canApprove && (
                        <button
                            onClick={handleApprove}
                            disabled={approve.isPending}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-cairo font-bold transition-colors disabled:opacity-50"
                        >
                            {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            {t('billing.quote.approve_btn')}
                        </button>
                    )}
                    {canActivate && (
                        <button
                            onClick={() => setConfirmActivate(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/90 text-white rounded-lg text-sm font-cairo font-bold transition-colors"
                        >
                            <Zap className="w-4 h-4" />
                            {t('billing.quote.activate_sub_title')}
                        </button>
                    )}
                </div>
            )}

            {/* Activate confirmation */}
            <AlertDialog open={confirmActivate} onOpenChange={setConfirmActivate}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-cairo">
                            {t('billing.quote.from_quote_title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="font-cairo">
                            {isRTL
                                ? `سيتم تفعيل اشتراك للمنشأة "${quote.tenant?.name_ar || quote.tenant?.name}" بمبلغ ${formatSAR(quote.total)}. لا يمكن التراجع عن هذا الإجراء.`
                                : `This will activate a subscription for "${quote.tenant?.name}" at ${formatSAR(quote.total)} (${quote.billing_cycle}). This cannot be undone.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="font-cairo">{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleActivate}
                            disabled={activate.isPending}
                            className="bg-secondary hover:bg-secondary/90 font-cairo"
                        >
                            {activate.isPending
                                ? t('billing.quote.activating')
                                : t('billing.quote.activate_btn')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE QUOTE FORM
// ─────────────────────────────────────────────────────────────────────────────

function CreateQuoteForm({ isRTL, onClose }: { isRTL: boolean; onClose: () => void }) {
    const { t } = useTranslation()
    const { data: plans = [] } = useSubscriptionPlans()
    const { data: addOns = [] } = useBillingAddOns(true)
    const { data: discounts = [] } = useDiscountPolicies(true)
    const { data: tenantsRaw } = useTenants()
    const tenants = tenantsRaw || []
    const createQuote = useEngineCreateQuote()

    const [tenantId, setTenantId]             = useState('')
    const [planId, setPlanId]                 = useState<string>('')
    const [billingCycle, setBillingCycle]     = useState<BillingCycle>('yearly')
    const [selectedAddOns, setSelectedAddOns] = useState<string[]>([])
    const [discountPolicyId, setDiscountId]   = useState('')
    const [adminNotes, setAdminNotes]         = useState('')
    const [clientNotes, setClientNotes]       = useState('')
    const [validDays, setValidDays]           = useState(30)
    const [showPreview, setShowPreview]       = useState(false)

    // Live calculation preview
    const { data: calcResult, isFetching: calcFetching } = useEngineCalculate({
        planId: planId || null,
        billingCycle,
        addOnIds: selectedAddOns,
        discountPolicyId: discountPolicyId || null,
    })

    const toggleAddOn = (id: string) =>
        setSelectedAddOns(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

    const handleSubmit = async () => {
        if (!tenantId) {
            toast.error(t('billing.quote.select_tenant_required'))
            return
        }
        if (!planId) {
            toast.error(t('billing.quote.select_plan_required'))
            return
        }
        try {
            const result = await createQuote.mutateAsync({
                tenantId, planId, billingCycle,
                addOnIds: selectedAddOns,
                discountPolicyId: discountPolicyId || null,
                adminNotes: adminNotes || null,
                clientNotes: clientNotes || null,
                validDays,
            })
            toast.success(isRTL ? `تم إنشاء العرض ${result.quote_number}` : `Quote ${result.quote_number} created`)
            onClose()
        } catch (e: unknown) {
            toast.error((e as Error).message)
        }
    }

    return (
        <div className="space-y-5">
            {/* Tenant */}
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 font-cairo">
                    {t('billing.quote.tenant_field')}
                </label>
                <select
                    value={tenantId}
                    onChange={e => setTenantId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                >
                    <option value="">{t('billing.quote.select_tenant_option')}</option>
                    {tenants.map((t: { id: string; name: string; name_ar?: string | null }) => (
                        <option key={t.id} value={t.id}>
                            {isRTL ? t.name_ar || t.name : t.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Plan + Billing Cycle */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 font-cairo">
                        {t('billing.quote.plan_field')}
                    </label>
                    <select
                        value={planId}
                        onChange={e => setPlanId(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                    >
                        <option value="">{t('billing.quote.select_plan_option')}</option>
                        {plans.map(p => (
                            <option key={p.id} value={p.id}>
                                {isRTL ? p.name_ar || p.name : p.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 font-cairo">
                        {t('billing.quote.billing_cycle_field')}
                    </label>
                    <select
                        value={billingCycle}
                        onChange={e => setBillingCycle(e.target.value as BillingCycle)}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                    >
                        <option value="yearly">{t('billing.plan.yearly')}</option>
                        <option value="monthly">{t('billing.plan.monthly')}</option>
                    </select>
                </div>
            </div>

            {/* Add-ons */}
            {addOns.length > 0 && (
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 font-cairo">
                        {t('billing.quote.addons_field')}
                    </label>
                    <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                        {addOns.map(ao => {
                            const selected = selectedAddOns.includes(ao.id)
                            return (
                                <label
                                    key={ao.id}
                                    className={cn(
                                        'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors',
                                        selected ? 'border-secondary bg-secondary/5' : 'border-border hover:border-secondary/50'
                                    )}
                                >
                                    <input
                                        type="checkbox" checked={selected}
                                        onChange={() => toggleAddOn(ao.id)}
                                        className="accent-secondary"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium font-cairo truncate">
                                            {isRTL ? ao.name_ar || ao.name : ao.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground font-cairo">
                                            {ao.billing_type === 'one_time' ? t('billing.add_on.one_time') : t('billing.add_on.recurring')}
                                        </p>
                                    </div>
                                    <span className="text-sm font-bold text-secondary font-mono shrink-0">
                                        {formatSAR(ao.price)}
                                    </span>
                                </label>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Discount + Valid days */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 font-cairo">
                        {t('billing.quote.discount_field')}
                    </label>
                    <select
                        value={discountPolicyId}
                        onChange={e => setDiscountId(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                    >
                        <option value="">{t('billing.quote.no_discount')}</option>
                        {discounts.map(d => (
                            <option key={d.id} value={d.id}>
                                {isRTL ? d.name_ar || d.name : d.name} ({d.discount_value}{d.discount_type === 'percentage' ? '%' : ' SAR'})
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 font-cairo">
                        {t('billing.quote.valid_days_field')}
                    </label>
                    <input
                        type="number" min={1} value={validDays}
                        onChange={e => setValidDays(Math.max(1, parseInt(e.target.value) || 30))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                    />
                </div>
            </div>

            {/* Admin notes */}
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 font-cairo">
                    {t('billing.quote.admin_notes_field')}
                </label>
                <textarea
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    rows={2}
                    placeholder={t('billing.quote.admin_notes_placeholder')}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                />
            </div>

            {/* Client notes */}
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 font-cairo">
                    {t('billing.client_notes')}
                </label>
                <textarea
                    value={clientNotes}
                    onChange={e => setClientNotes(e.target.value)}
                    rows={2}
                    placeholder={t('billing.discount.client_notes_placeholder')}
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                />
            </div>

            {/* Live preview toggle */}
            <div>
                <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-2 text-xs text-secondary font-bold font-cairo"
                >
                    {showPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {t('billing.plan.select')}
                    {calcFetching && <Loader2 className="w-3 h-3 animate-spin" />}
                </button>

                {showPreview && calcResult && (
                    <div className="mt-2 bg-muted/5 rounded-xl p-4 space-y-1.5 text-sm font-cairo border">
                        <div className="flex justify-between text-muted-foreground">
                            <span>{t('billing.pricing.plan_amount')}</span>
                            <span className="font-mono">{formatSAR(calcResult.plan_amount)}</span>
                        </div>
                        {calcResult.add_ons_amount > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span>{t('billing.pricing.add_ons_amount')}</span>
                                <span className="font-mono">{formatSAR(calcResult.add_ons_amount)}</span>
                            </div>
                        )}
                        {calcResult.discount_amount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>{t('billing.pricing.discount_amount')}</span>
                                <span className="font-mono">-{formatSAR(calcResult.discount_amount)}</span>
                            </div>
                        )}
                        {calcResult.tax_amount > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span>{isRTL ? `ضريبة ${Math.round(calcResult.tax_rate * 100)}%` : `VAT ${Math.round(calcResult.tax_rate * 100)}%`}</span>
                                <span className="font-mono">{formatSAR(calcResult.tax_amount)}</span>
                            </div>
                        )}
                        <div className="border-t pt-1.5 flex justify-between font-bold text-base">
                            <span>{t('billing.pricing.total')}</span>
                            <span className="text-secondary font-mono">{formatSAR(calcResult.total)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
                <button
                    onClick={handleSubmit}
                    disabled={createQuote.isPending || !tenantId || !planId}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-xl font-cairo text-sm font-bold hover:bg-secondary/90 transition-colors disabled:opacity-50"
                >
                    {createQuote.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <FileText className="w-4 h-4" />}
                    {t('billing.quote.create')}
                </button>
                <button
                    onClick={onClose}
                    className="px-4 py-2.5 border rounded-xl font-cairo text-sm hover:bg-muted/10 transition-colors"
                >
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTES TAB
// ─────────────────────────────────────────────────────────────────────────────

function QuotesTab({ isRTL }: { isRTL: boolean }) {
    const { t } = useTranslation()
    const [statusFilter, setStatusFilter] = useState<BillingQuoteStatus | ''>('')
    const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
    const [showCreate, setShowCreate] = useState(false)

    const { data: quotes = [], isLoading, refetch } = useBillingQuotes(
        statusFilter ? { status: statusFilter as BillingQuoteStatus } : undefined
    )

    const statusOptions: Array<{ val: BillingQuoteStatus | ''; label: string; labelAr: string }> = [
        { val: '',          label: 'All',       labelAr: 'الكل' },
        { val: 'draft',     label: 'Draft',     labelAr: 'مسودة' },
        { val: 'approved',  label: 'Approved',  labelAr: 'معتمد' },
        { val: 'activated', label: 'Activated', labelAr: 'مُفعَّل' },
        { val: 'expired',   label: 'Expired',   labelAr: 'منتهي' },
    ]

    return (
        <div className="flex gap-5 h-[calc(100vh-220px)] min-h-[500px]">
            {/* Left: list */}
            <div className={cn('flex flex-col', selectedQuoteId ? 'w-[55%]' : 'flex-1')}>
                {/* Toolbar */}
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <div className="flex gap-1.5 flex-wrap">
                        {statusOptions.map(opt => (
                            <button
                                key={opt.val}
                                onClick={() => setStatusFilter(opt.val)}
                                className={cn(
                                    'px-3 py-1.5 rounded-full text-xs font-bold font-cairo transition-colors',
                                    statusFilter === opt.val
                                        ? 'bg-secondary text-white'
                                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                                )}
                            >
                                {isRTL ? opt.labelAr : opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 ms-auto">
                        <button
                            onClick={() => refetch()}
                            className="p-2 rounded-lg border hover:bg-muted/10 transition-colors"
                            title={t('common.refresh')}
                        >
                            <RefreshCw className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => { setShowCreate(true); setSelectedQuoteId(null) }}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg text-sm font-cairo font-bold hover:bg-secondary/90 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            {t('billing.quote.create')}
                        </button>
                    </div>
                </div>

                {/* Quote list */}
                {isLoading ? (
                    <div className="flex items-center justify-center flex-1">
                        <Loader2 className="w-7 h-7 animate-spin text-secondary" />
                    </div>
                ) : quotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 text-center">
                        <FileText className="w-12 h-12 text-muted-foreground/30 mb-3" />
                        <p className="text-muted-foreground font-cairo">
                            {t('billing.empty.no_quotes')}
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        <div className="space-y-2">
                            {quotes.map((q: BillingQuote) => (
                                <motion.div
                                    key={q.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    onClick={() => { setSelectedQuoteId(q.id); setShowCreate(false) }}
                                    className={cn(
                                        'bg-card border rounded-xl p-4 cursor-pointer transition-all hover:shadow-sm',
                                        selectedQuoteId === q.id ? 'border-secondary ring-1 ring-secondary/20' : 'border-border'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-mono text-sm font-bold">{q.quote_number}</span>
                                                <StatusBadge status={q.status} isRTL={isRTL} />
                                            </div>
                                            <p className="text-sm text-muted-foreground font-cairo truncate flex items-center gap-1">
                                                <Building2 className="w-3 h-3 shrink-0" />
                                                {isRTL ? q.tenant?.name_ar || q.tenant?.name : q.tenant?.name}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground font-cairo">
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays className="w-3 h-3" />
                                                    {fmtDate(q.created_at)}
                                                </span>
                                                {q.plan && (
                                                    <span>{isRTL ? q.plan.name_ar || q.plan.name : q.plan.name}</span>
                                                )}
                                                <span>
                                                    {q.billing_cycle === 'yearly' ? t('billing.plan.yearly') : t('billing.plan.monthly')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-end shrink-0">
                                            <p className="font-bold text-lg text-secondary font-mono">
                                                {formatSAR(q.total)}
                                            </p>
                                            {/* Only show "incl. VAT" if the quote has tax */}
                                            {q.tax_amount > 0 && (
                                                <p className="text-xs text-muted-foreground font-cairo">
                                                    {t('billing.quote.incl_vat')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {q.valid_until && new Date(q.valid_until) < new Date() && q.status === 'draft' && (
                                        <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 font-cairo">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            {t('billing.quote.expired_message')}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Right: detail / create panel */}
            {(selectedQuoteId || showCreate) && (
                <div className="w-[45%] bg-card border rounded-2xl shadow-sm overflow-hidden flex flex-col shrink-0">
                    {showCreate ? (
                        <div className="h-full overflow-y-auto p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-base font-bold font-cairo">
                                    {t('billing.quote.create')}
                                </h2>
                                <button onClick={() => setShowCreate(false)} className="p-1.5 rounded hover:bg-muted/10">
                                    <XCircle className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                            <CreateQuoteForm isRTL={isRTL} onClose={() => setShowCreate(false)} />
                        </div>
                    ) : selectedQuoteId ? (
                        <QuoteDetailPanel
                            quoteId={selectedQuoteId}
                            isRTL={isRTL}
                            onClose={() => setSelectedQuoteId(null)}
                        />
                    ) : null}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD-ONS TAB
// ─────────────────────────────────────────────────────────────────────────────

function AddOnsTab({ isRTL }: { isRTL: boolean }) {
    const { t } = useTranslation()
    const { data: addOns = [], isLoading } = useBillingAddOns(false)
    const createAO = useCreateBillingAddOn()
    const updateAO = useUpdateBillingAddOn()
    const [editing, setEditing] = useState<Partial<BillingAddOn> | null>(null)

    const emptyForm: Partial<BillingAddOn> = {
        code: '', name: '', name_ar: '', description: null, description_ar: null,
        billing_type: 'recurring', price: 0,
        is_active: true, sort_order: 0,
    }

    const handleSave = async () => {
        if (!editing) return
        try {
            if (editing.id) {
                await updateAO.mutateAsync(editing as Partial<BillingAddOn> & { id: string })
                toast.success(t('billing.add_on.updated'))
            } else {
                await createAO.mutateAsync(editing as Omit<BillingAddOn, 'id' | 'created_at' | 'updated_at'>)
                toast.success(t('billing.add_on.created'))
            }
            setEditing(null)
        } catch (e: unknown) {
            toast.error((e as Error).message)
        }
    }

    if (editing !== null) {
        return (
            <div className="max-w-2xl">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-bold font-cairo">
                        {editing.id ? t('common.edit') : t('common.add')} {t('billing.add_on.title')}
                    </h2>
                    <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground font-cairo hover:underline">
                        {t('common.cancel')}
                    </button>
                </div>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { k: 'code' as const,    l: 'Code',        la: 'الكود' },
                            { k: 'name' as const,    l: 'Name (EN)',   la: 'الاسم (إنجليزي)' },
                            { k: 'name_ar' as const, l: 'Name (AR)',   la: 'الاسم (عربي)' },
                        ].map(f => (
                            <div key={f.k}>
                                <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">
                                    {isRTL ? f.la : f.l}
                                </label>
                                <input
                                    type="text"
                                    value={(editing[f.k] as string) || ''}
                                    onChange={e => setEditing({ ...editing, [f.k]: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                                />
                            </div>
                        ))}
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">
                                {t('billing.quote.billing_cycle_field')}
                            </label>
                            <select
                                value={editing.billing_type}
                                onChange={e => setEditing({ ...editing, billing_type: e.target.value as 'recurring' | 'one_time' })}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                            >
                                <option value="recurring">{t('billing.add_on.recurring')}</option>
                                <option value="one_time">{t('billing.add_on.one_time')}</option>
                            </select>
                        </div>
                    </div>

                    {/* Price */}
                    <div>
                        <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">
                            {t('billing.add_on.price_label')}
                        </label>
                        <input
                            type="number" min={0}
                            value={editing.price || 0}
                            onChange={e => setEditing({ ...editing, price: parseFloat(e.target.value) || 0 })}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={editing.is_active ?? true}
                                onChange={e => setEditing({ ...editing, is_active: e.target.checked })}
                                className="accent-secondary"
                            />
                            <span className="text-sm font-cairo">{t('billing.add_on.active_label')}</span>
                        </label>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleSave}
                            disabled={createAO.isPending || updateAO.isPending}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-xl font-cairo text-sm font-bold hover:bg-secondary/90 transition-colors disabled:opacity-50"
                        >
                            {(createAO.isPending || updateAO.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {t('common.save')}
                        </button>
                        <button onClick={() => setEditing(null)} className="px-4 py-2.5 border rounded-xl font-cairo text-sm hover:bg-muted/10">
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground font-cairo">
                    {isRTL
                        ? 'كتالوج الخدمات والإضافات القابلة للفوترة. تُستخدم في عروض الأسعار.'
                        : 'Catalog of billable add-ons. Used as line items in pricing quotes.'}
                </p>
                <button
                    onClick={() => setEditing({ ...emptyForm })}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg text-sm font-cairo font-bold hover:bg-secondary/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t('billing.add_on.add_service')}
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-secondary" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {addOns.map(ao => (
                        <div key={ao.id} className={cn('bg-card border rounded-xl p-4', !ao.is_active && 'opacity-60')}>
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-sm font-cairo truncate">
                                        {isRTL ? ao.name_ar || ao.name : ao.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{ao.code}</p>
                                </div>
                                <button onClick={() => setEditing({ ...ao })} className="p-1.5 rounded hover:bg-muted/10 shrink-0">
                                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs bg-muted/20 text-muted-foreground px-2 py-0.5 rounded font-cairo">
                                    {ao.billing_type === 'one_time' ? t('billing.add_on.one_time') : t('billing.add_on.recurring')}
                                </span>
                                <span className="text-sm font-bold text-secondary font-mono">{formatSAR(ao.price)}</span>
                                {!ao.is_active && (
                                    <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded font-cairo">
                                        {t('billing.add_on.inactive')}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNTS TAB
// ─────────────────────────────────────────────────────────────────────────────

function DiscountsTab({ isRTL }: { isRTL: boolean }) {
    const { t } = useTranslation()
    const { data: policies = [], isLoading } = useDiscountPolicies()
    const create = useCreateDiscountPolicy()
    const update = useUpdateDiscountPolicy()
    const [editing, setEditing] = useState<Record<string, unknown> | null>(null)

    const emptyForm = {
        code: '', name: '', name_ar: '', description: null, description_ar: null,
        discount_type: 'percentage', discount_value: 10,
        valid_from: '', valid_to: '', is_active: true,
    }

    const handleSave = async () => {
        if (!editing) return
        const payload = {
            ...editing,
            valid_from: (editing.valid_from as string) || null,
            valid_to:   (editing.valid_to as string) || null,
        }
        try {
            if (editing.id) {
                await update.mutateAsync(payload as Parameters<typeof update.mutateAsync>[0])
                toast.success(t('billing.discount.policy_updated'))
            } else {
                await create.mutateAsync(payload as Parameters<typeof create.mutateAsync>[0])
                toast.success(t('billing.discount.policy_created'))
            }
            setEditing(null)
        } catch (e: unknown) {
            toast.error((e as Error).message)
        }
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground font-cairo">
                    {isRTL
                        ? 'سياسات الخصم القابلة لإعادة الاستخدام. تُطبق على مجموع عرض السعر.'
                        : 'Named discount templates applied to quote totals.'}
                </p>
                <button
                    onClick={() => setEditing({ ...emptyForm })}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg text-sm font-cairo font-bold hover:bg-secondary/90"
                >
                    <Plus className="w-4 h-4" />
                    {t('billing.discount.new_policy')}
                </button>
            </div>

            {editing && (
                <div className="bg-card border rounded-xl p-5 mb-5 max-w-2xl">
                    <h3 className="font-bold font-cairo mb-4">
                        {editing.id ? t('billing.discount.edit_policy') : t('billing.discount.new_policy')}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { k: 'code',    l: 'Code',        la: 'الكود' },
                            { k: 'name',    l: 'Name (EN)',   la: 'الاسم إنجليزي' },
                            { k: 'name_ar', l: 'Name (AR)',   la: 'الاسم عربي' },
                        ].map(f => (
                            <div key={f.k}>
                                <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">{isRTL ? f.la : f.l}</label>
                                <input
                                    type="text"
                                    value={(editing[f.k] as string) || ''}
                                    onChange={e => setEditing({ ...editing, [f.k]: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                                />
                            </div>
                        ))}
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">{t('billing.discount.type_label')}</label>
                            <select
                                value={editing.discount_type as string}
                                onChange={e => setEditing({ ...editing, discount_type: e.target.value })}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                            >
                                <option value="percentage">{t('billing.discount.percentage')}</option>
                                <option value="fixed">{t('billing.discount.fixed')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">
                                {t('billing.discount.value_label')}
                                {editing.discount_type === 'percentage' ? ' (%)' : ' (SAR)'}
                            </label>
                            <input
                                type="number" min={0}
                                value={(editing.discount_value as number) || 0}
                                onChange={e => setEditing({ ...editing, discount_value: parseFloat(e.target.value) || 0 })}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">{t('billing.discount.valid_from')}</label>
                            <input
                                type="date"
                                value={(editing.valid_from as string) || ''}
                                onChange={e => setEditing({ ...editing, valid_from: e.target.value })}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">{t('billing.discount.valid_to')}</label>
                            <input
                                type="date"
                                value={(editing.valid_to as string) || ''}
                                onChange={e => setEditing({ ...editing, valid_to: e.target.value })}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button
                            onClick={handleSave}
                            disabled={create.isPending || update.isPending}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-2 bg-secondary text-white rounded-xl font-cairo text-sm font-bold hover:bg-secondary/90 disabled:opacity-50"
                        >
                            {t('common.save')}
                        </button>
                        <button onClick={() => setEditing(null)} className="px-4 py-2 border rounded-xl font-cairo text-sm hover:bg-muted/10">
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-secondary" />
                </div>
            ) : (
                <div className="space-y-2">
                    {policies.map((p: DiscountPolicy) => {
                        const isExpired = p.valid_to && new Date(p.valid_to) < new Date()
                        return (
                            <div key={p.id} className={cn('bg-card border rounded-xl p-4 flex items-center gap-4', !p.is_active && 'opacity-60')}>
                                <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                                    <Tag className="w-5 h-5 text-secondary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-sm font-cairo">{isRTL ? p.name_ar || p.name : p.name}</p>
                                        {isExpired && (
                                            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded font-cairo">
                                                {t('billing.discount.expired_badge')}
                                            </span>
                                        )}
                                        {!p.is_active && (
                                            <span className="text-xs bg-muted/20 text-muted-foreground px-2 py-0.5 rounded font-cairo">
                                                {t('billing.add_on.inactive')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.code}</p>
                                    <p className="text-xs text-muted-foreground font-cairo mt-0.5">
                                        {p.valid_from && p.valid_to
                                            ? `${fmtDate(p.valid_from)} → ${fmtDate(p.valid_to)}`
                                            : t('billing.discount.no_expiry')}
                                    </p>
                                </div>
                                <div className="text-end shrink-0">
                                    <p className="font-bold text-lg text-secondary font-mono">
                                        {p.discount_value}{p.discount_type === 'percentage' ? '%' : ' SAR'}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-cairo">
                                        {p.discount_type === 'percentage' ? t('billing.discount.percentage') : t('billing.discount.fixed')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEditing({ ...p, valid_from: p.valid_from || '', valid_to: p.valid_to || '' })}
                                    className="p-2 rounded hover:bg-muted/10"
                                >
                                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'quotes' | 'addons' | 'discounts'

export default function QuotesPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [activeTab, setActiveTab] = useState<Tab>('quotes')

    const tabs: Array<{ id: Tab; label: string; labelAr: string; icon: typeof FileText }> = [
        { id: 'quotes',    label: 'Quotes',            labelAr: 'عروض الأسعار',    icon: FileText },
        { id: 'addons',    label: 'Add-ons Catalog',   labelAr: 'كتالوج الإضافات', icon: Package },
        { id: 'discounts', label: 'Discount Policies', labelAr: 'سياسات الخصم',    icon: Tag },
    ]

    return (
        <div className="space-y-6 pb-8">
            {/* Page header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
                    <FileText className="w-7 h-7 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-primary">
                        {t('billing.quote.page_title')}
                    </h1>
                    <p className="text-sm text-muted-foreground font-cairo mt-0.5">
                        {t('billing.quote.page_subtitle')}
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-3 font-cairo text-sm font-medium border-b-2 transition-colors',
                            activeTab === tab.id
                                ? 'border-secondary text-secondary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        {isRTL ? tab.labelAr : tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {activeTab === 'quotes'    && <QuotesTab    isRTL={isRTL} />}
                {activeTab === 'addons'    && <AddOnsTab    isRTL={isRTL} />}
                {activeTab === 'discounts' && <DiscountsTab isRTL={isRTL} />}
            </div>
        </div>
    )
}
