import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    CheckCircle2,
    Loader2,
    AlertCircle,
    RefreshCcw,
    PhoneCall,
    CreditCard,
    BadgeCheck,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantSubscriptionNew, useEngineCalculate, useBillingInvoices, formatSAR, type BillingCycle } from '@/hooks/useBillingEngine'
import { useSubscriptionPlans, type SubscriptionPlan } from '@/hooks/useSubscriptionPlans'
import { usePayment } from '@/hooks/usePayment'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined, locale: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
    })
}

function daysLeft(iso: string | null | undefined): number {
    if (!iso) return 0
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
    plan,
    billingCycle,
    isSelected,
    onSelect,
    isRTL,
    t,
}: {
    plan: SubscriptionPlan
    billingCycle: BillingCycle
    isSelected: boolean
    onSelect: () => void
    isRTL: boolean
    t: (key: string) => string
}) {
    const price = billingCycle === 'yearly' ? plan.price_yearly / 12 : plan.price_monthly
    const name = isRTL ? (plan.name_ar || plan.name) : plan.name
    const desc = isRTL ? (plan.description_ar || plan.description) : plan.description

    const limits = [
        { label: t('tenant.subscription.users'), val: plan.max_users },
        { label: t('tenant.subscription.buildings'), val: plan.max_buildings },
        { label: t('tenant.subscription.assets'), val: plan.max_assets },
        { label: t('tenant.subscription.work_orders_month'), val: plan.max_work_orders_monthly },
    ]

    return (
        <button
            onClick={onSelect}
            className={cn(
                'relative w-full text-start rounded-2xl border-2 p-5 transition-all duration-200',
                isSelected
                    ? 'border-secondary bg-secondary/5 shadow-md'
                    : 'border-gray-200 bg-white hover:border-secondary/50 hover:shadow-sm'
            )}
        >
            {plan.is_popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-secondary text-white text-xs font-bold rounded-full font-cairo">
                    {t('tenant.subscription.popular')}
                </span>
            )}

            {isSelected && (
                <BadgeCheck className="absolute top-4 end-4 w-5 h-5 text-secondary" />
            )}

            <h3 className="font-bold text-lg text-gray-900 font-cairo mb-1">{name}</h3>
            {desc && <p className="text-xs text-gray-500 font-cairo mb-3 line-clamp-2">{desc}</p>}

            <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-gray-900">
                    {formatSAR(price)}
                </span>
                <span className="text-sm text-gray-400 font-cairo">
                    {billingCycle === 'yearly'
                        ? t('tenant.subscription.per_month')
                        : t('tenant.subscription.per_month')}
                </span>
            </div>

            {billingCycle === 'yearly' && (
                <div className="mb-3 text-xs text-emerald-600 font-bold font-cairo">
                    {t('tenant.subscription.yearly_save')} · {formatSAR(plan.price_yearly)} {t('tenant.subscription.per_year_suffix')}
                </div>
            )}

            <div className="space-y-1.5">
                {limits.map(({ label, val }) => (
                    <div key={label} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-secondary shrink-0" />
                        <span className="font-cairo">
                            {val === -1
                                ? t('tenant.subscription.unlimited')
                                : val}{' '}
                            {label}
                        </span>
                    </div>
                ))}
            </div>
        </button>
    )
}

// ─── Pricing Preview ──────────────────────────────────────────────────────────

function PricingPreview({
    planId,
    billingCycle,
    t,
    onPay,
    isProcessing,
}: {
    planId: string
    billingCycle: BillingCycle
    t: (key: string) => string
    onPay: () => void
    isProcessing: boolean
}) {
    const { data: pricing, isLoading } = useEngineCalculate({ planId, billingCycle })

    if (isLoading) {
        return (
            <div className="bg-gray-50 rounded-xl border p-5 flex items-center gap-3 text-gray-500 font-cairo text-sm">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                {t('tenant.subscription.loading_price')}
            </div>
        )
    }

    if (!pricing) return null

    return (
        <div className="bg-gray-50 rounded-xl border p-5 space-y-3">
            <h4 className="font-bold text-gray-800 font-cairo text-sm uppercase tracking-wide">
                {t('tenant.subscription.pricing_preview')}
            </h4>
            <div className="space-y-2 text-sm font-cairo">
                <div className="flex justify-between text-gray-600">
                    <span>{t('tenant.subscription.subtotal')}</span>
                    <span>{formatSAR(pricing.subtotal)}</span>
                </div>
                {pricing.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                        <span>{t('billing.discount_amount') || 'Discount'}</span>
                        <span>-{formatSAR(pricing.discount_amount)}</span>
                    </div>
                )}
                {pricing.tax_amount > 0 && (
                    <div className="flex justify-between text-gray-600">
                        <span>{t('tenant.subscription.vat')}</span>
                        <span>{formatSAR(pricing.tax_amount)}</span>
                    </div>
                )}
                <div className="h-px bg-gray-200" />
                <div className="flex justify-between font-bold text-base text-gray-900">
                    <span>{t('tenant.subscription.total')}</span>
                    <span className="text-secondary">{formatSAR(pricing.total)}</span>
                </div>
            </div>
            <button
                onClick={onPay}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 disabled:opacity-60 text-white py-3 rounded-xl font-bold font-cairo transition-colors"
            >
                {isProcessing ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('tenant.subscription.processing')}
                    </>
                ) : (
                    <>
                        <CreditCard className="w-4 h-4" />
                        {t('tenant.subscription.pay_now')} · {formatSAR(pricing.total)}
                    </>
                )}
            </button>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantSubscriptionPage() {
    const { t, i18n } = useTranslation()
    const { profile } = useAuth()
    const isRTL = i18n.language === 'ar'
    const tenantId = profile?.tenant_id || ''

    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')

    const { data: subscription, isLoading: subLoading } = useTenantSubscriptionNew(tenantId)
    const { data: allPlans = [], isLoading: plansLoading } = useSubscriptionPlans()
    const { data: invoices = [] } = useBillingInvoices({ tenantId })
    const { initiatePayment, isProcessing } = usePayment()

    const activePlans = allPlans.filter(p => p.is_active)
    const recentInvoices = invoices.slice(0, 5)

    // ─── Loading ──────────────────────────────────────────────────────────────
    if (subLoading || plansLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <Loader2 className="w-8 h-8 animate-spin text-secondary" />
            </div>
        )
    }

    // ─── No Subscription ──────────────────────────────────────────────────────
    if (!subscription) {
        return (
            <div className="p-6 text-center max-w-md mx-auto mt-12">
                <AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
                <h3 className="text-xl font-bold font-cairo">{t('tenant.subscription.no_subscription')}</h3>
                <a
                    href="mailto:info@mutqan-sa.com"
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg font-cairo text-sm hover:bg-secondary/90"
                >
                    <PhoneCall className="w-4 h-4" />
                    {t('tenant.subscription.contact_support')}
                </a>
            </div>
        )
    }

    const status = subscription.status
    const plan = subscription.plan
    // Full plan record (has max_users, max_buildings etc.)
    const fullPlan = allPlans.find(p => p.id === subscription.plan_id) ?? null
    const isActive = status === 'active'
    const isTrial = status === 'trial'
    const isReadOnly = status === 'expired' || status === 'cancelled'
    const showPlanSelection = isTrial || isReadOnly

    const periodEnd = subscription.current_period_end
    const trialEnd = subscription.trial_ends_at
    const endDate = isTrial ? (trialEnd || periodEnd) : periodEnd
    const days = daysLeft(endDate)

    // Trial progress
    const trialStartDate = subscription.current_period_start ? new Date(subscription.current_period_start) : null
    const trialEndDate = trialEnd ? new Date(trialEnd) : (periodEnd ? new Date(periodEnd) : null)
    const trialTotalDays = trialStartDate && trialEndDate
        ? Math.max(1, Math.ceil((trialEndDate.getTime() - trialStartDate.getTime()) / 86_400_000))
        : 14
    const trialProgress = Math.min(100, Math.max(0, Math.round(((trialTotalDays - days) / trialTotalDays) * 100)))

    // Payment handler
    const handlePay = async () => {
        if (!selectedPlanId) return
        const selectedPlan = activePlans.find(p => p.id === selectedPlanId)
        if (!selectedPlan) return
        const amount = billingCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly
        await initiatePayment({
            planId: selectedPlanId,
            planName: selectedPlan.name,
            billingCycle,
            amount,
            currency: 'SAR',
            tenantId,
            customerEmail: (profile as any)?.email,
            customerName: (profile as any)?.full_name,
        })
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">

            {/* ── Status Header Card ─────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 relative overflow-hidden">
                <div className="absolute top-0 start-0 w-full h-1 bg-gradient-to-r from-secondary to-primary" />

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                            <h1 className="text-xl font-bold text-gray-900 font-cairo">
                                {isRTL ? (plan?.name_ar || plan?.name) : plan?.name}
                            </h1>
                            <span className={cn(
                                'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide',
                                status === 'active'   ? 'bg-green-100 text-green-700' :
                                status === 'trial'    ? 'bg-blue-100 text-blue-700' :
                                status === 'expired'  ? 'bg-orange-100 text-orange-700' :
                                status === 'cancelled'? 'bg-gray-100 text-gray-600' :
                                                       'bg-yellow-100 text-yellow-700'
                            )}>
                                {t(`tenant.status.${status}`)}
                            </span>
                        </div>
                        {isActive && !isReadOnly && (
                            <p className="text-sm text-gray-500 font-cairo flex items-center gap-1.5">
                                <RefreshCcw className="w-3.5 h-3.5" />
                                {t('tenant.subscription.renewal_manual')}
                            </p>
                        )}
                        {isReadOnly && (
                            <p className="text-sm text-amber-600 font-cairo mt-1">
                                {t('tenant.subscription.expired_locked_msg')}
                            </p>
                        )}
                    </div>

                    {/* Dates panel */}
                    {!isReadOnly && endDate && (
                        <div className="flex items-stretch bg-gray-50 rounded-xl border overflow-hidden shrink-0 divide-x divide-gray-200 rtl:divide-x-reverse">
                            {subscription.current_period_start && (
                                <div className="text-center px-4 py-3">
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1 font-cairo">
                                        {t('tenant.subscription.start_date')}
                                    </p>
                                    <p className="font-mono font-bold text-sm text-gray-700">
                                        {fmtDate(subscription.current_period_start, i18n.language)}
                                    </p>
                                </div>
                            )}
                            <div className="text-center px-4 py-3">
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1 font-cairo">
                                    {t('tenant.subscription.end_date')}
                                </p>
                                <p className="font-mono font-bold text-sm text-secondary">
                                    {fmtDate(endDate, i18n.language)}
                                </p>
                            </div>
                            <div className="text-center px-4 py-3">
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1 font-cairo">
                                    {t('tenant.subscription.days_left')}
                                </p>
                                <p className={cn('font-mono font-bold text-lg', days <= 7 ? 'text-red-500' : 'text-gray-900')}>
                                    {days}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Trial progress bar */}
                {isTrial && (
                    <div className="mt-5">
                        <div className="flex justify-between text-xs mb-1.5 font-cairo font-medium">
                            <span>{t('tenant.subscription.trial_period')}</span>
                            <span className={cn(days <= 3 ? 'text-red-600 font-bold' : 'text-gray-500')}>
                                {t('tenant.subscription.days_remaining').replace('{{count}}', String(days))}
                            </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={cn('h-full transition-all duration-500 rounded-full', trialProgress > 80 ? 'bg-red-400' : 'bg-blue-500')}
                                style={{ width: `${trialProgress}%` }}
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-2 font-cairo">
                            {t('tenant.subscription.trial_note')}
                        </p>
                    </div>
                )}
            </div>

            {/* ── Plan Selection (trial or expired/cancelled) ───────────── */}
            {showPlanSelection && activePlans.length > 0 && (
                <div className="space-y-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 font-cairo">
                            {t('tenant.subscription.choose_plan')}
                        </h2>
                        {isReadOnly && (
                            <p className="text-sm text-gray-500 font-cairo mt-0.5">
                                {t('tenant.subscription.data_safe_msg')}
                            </p>
                        )}
                    </div>

                    {/* Billing cycle toggle */}
                    <div className="inline-flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setBillingCycle('monthly')}
                            className={cn(
                                'px-4 py-1.5 rounded-lg text-sm font-bold font-cairo transition-all',
                                billingCycle === 'monthly'
                                    ? 'bg-white shadow text-gray-900'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            {t('tenant.subscription.monthly')}
                        </button>
                        <button
                            onClick={() => setBillingCycle('yearly')}
                            className={cn(
                                'px-4 py-1.5 rounded-lg text-sm font-bold font-cairo transition-all flex items-center gap-1.5',
                                billingCycle === 'yearly'
                                    ? 'bg-white shadow text-gray-900'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            {t('tenant.subscription.yearly')}
                            <span className="text-xs text-emerald-600 font-bold">{t('tenant.subscription.yearly_save')}</span>
                        </button>
                    </div>

                    {/* Plan cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                        {activePlans.map(p => (
                            <PlanCard
                                key={p.id}
                                plan={p}
                                billingCycle={billingCycle}
                                isSelected={selectedPlanId === p.id}
                                onSelect={() => setSelectedPlanId(prev => prev === p.id ? null : p.id)}
                                isRTL={isRTL}
                                t={t}
                            />
                        ))}
                    </div>

                    {/* Pricing preview + pay button */}
                    {selectedPlanId && (
                        <PricingPreview
                            planId={selectedPlanId}
                            billingCycle={billingCycle}
                            t={t}
                            onPay={handlePay}
                            isProcessing={isProcessing}
                        />
                    )}
                </div>
            )}

            {/* ── Active Subscription Details ───────────────────────────── */}
            {isActive && fullPlan && (
                <>
                    {/* What's included */}
                    <div className="bg-white rounded-xl border p-5">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 font-cairo">
                            {t('tenant.subscription.plan_includes')}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[
                                { label: t('tenant.subscription.users'), val: fullPlan.max_users },
                                { label: t('tenant.subscription.buildings'), val: fullPlan.max_buildings },
                                { label: t('tenant.subscription.assets'), val: fullPlan.max_assets },
                                { label: t('tenant.subscription.work_orders_month'), val: fullPlan.max_work_orders_monthly },
                            ].map(({ label, val }) => (
                                <div key={label} className="flex items-center gap-2 text-sm">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                    <span className="font-cairo text-gray-700">
                                        {val === -1
                                            ? t('tenant.subscription.unlimited')
                                            : val}{' '}
                                        {label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Invoices */}
                    <div className="bg-white rounded-xl border p-5">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 font-cairo">
                            {t('tenant.subscription.recent_invoices')}
                        </h2>
                        {recentInvoices.length === 0 ? (
                            <p className="text-sm text-gray-400 font-cairo">{t('tenant.subscription.no_invoices')}</p>
                        ) : (
                            <div className="divide-y">
                                {recentInvoices.map(inv => (
                                    <div key={inv.id} className="py-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-gray-800 font-cairo">#{inv.invoice_number}</p>
                                            <p className="text-xs text-gray-400 font-cairo">
                                                {fmtDate(inv.created_at, i18n.language)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={cn(
                                                'text-xs px-2 py-0.5 rounded-full font-bold font-cairo',
                                                inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                                                inv.status === 'void' ? 'bg-red-100 text-red-600' :
                                                'bg-gray-100 text-gray-500'
                                            )}>
                                                {inv.status}
                                            </span>
                                            <span className="font-bold text-gray-800 font-cairo text-sm">
                                                {formatSAR(inv.total)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Contact CTA ────────────────────────────────────────────── */}
            <div className="bg-gray-50 border rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h3 className="font-bold font-cairo text-gray-900">
                        {t('tenant.subscription.need_help')}
                    </h3>
                    <p className="text-sm text-gray-500 font-cairo mt-0.5">
                        {t('tenant.subscription.support_msg')}
                    </p>
                </div>
                <a
                    href="mailto:info@mutqan-sa.com"
                    className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-xl font-cairo text-sm font-bold hover:bg-secondary/90 transition-colors"
                >
                    <PhoneCall className="w-4 h-4" />
                    {t('tenant.subscription.contact_us')}
                </a>
            </div>
        </div>
    )
}
