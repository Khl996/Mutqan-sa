import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
    CheckCircle2,
    AlertCircle,
    ShieldOff,
    Users,
    Building2,
    Database,
    FileText,
    PhoneCall,
    RefreshCcw,
    Gift,
    Infinity,
    Loader2,
    XCircle,
    AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantSubscription, useSubscriptionPlans, useTenantUsage, OverrideType, SubscriptionStatus } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined, locale: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
    })
}

function daysLeft(iso: string | null | undefined): number {
    if (!iso) return 0
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

function isEffectivelyForever(iso: string | null | undefined): boolean {
    if (!iso) return false
    return new Date(iso).getFullYear() >= 2099
}

// ─── Status Config ─────────────────────────────────────────────────────────────

interface StatusConfig {
    badge: string        // tailwind classes for badge
    badgeLabelAr: string
    badgeLabel: string
    bannerClass?: string // if set, show a banner
    bannerIcon?: typeof AlertCircle
    bannerMsgAr?: string
    bannerMsg?: string
}

function getStatusConfig(
    status: SubscriptionStatus,
    overrideType: OverrideType,
    isRTL: boolean
): StatusConfig {
    // Override types take precedence on badge display
    if (overrideType === 'free_forever') {
        return {
            badge: 'bg-purple-100 text-purple-700',
            badgeLabelAr: 'مجاني دائم',
            badgeLabel: 'Free Forever',
        }
    }
    if (overrideType === 'complimentary') {
        return {
            badge: 'bg-emerald-100 text-emerald-700',
            badgeLabelAr: 'مجاني',
            badgeLabel: 'Complimentary',
        }
    }

    switch (status) {
        case 'active':
            return {
                badge: 'bg-green-100 text-green-700',
                badgeLabelAr: 'نشط',
                badgeLabel: 'Active',
            }
        case 'trial':
            return {
                badge: 'bg-blue-100 text-blue-700',
                badgeLabelAr: 'فترة تجريبية',
                badgeLabel: 'Trial',
            }
        case 'expired':
            return {
                badge: 'bg-red-100 text-red-700',
                badgeLabelAr: 'منتهي',
                badgeLabel: 'Expired',
                bannerClass: 'bg-red-50 border-red-200 text-red-800',
                bannerIcon: AlertCircle,
                bannerMsgAr: 'انتهت صلاحية اشتراكك. الوصول إلى الخدمة محدود. يرجى التواصل معنا لتجديد الاشتراك.',
                bannerMsg: 'Your subscription has expired. Access to the service is limited. Please contact us to renew.',
            }
        case 'suspended':
            return {
                badge: 'bg-orange-100 text-orange-700',
                badgeLabelAr: 'معلق',
                badgeLabel: 'Suspended',
                bannerClass: 'bg-orange-50 border-orange-200 text-orange-800',
                bannerIcon: ShieldOff,
                bannerMsgAr: 'حسابك معلق مؤقتاً. يرجى التواصل مع الدعم لمعرفة السبب والحل.',
                bannerMsg: 'Your account has been temporarily suspended. Please contact support to resolve this.',
            }
        case 'cancelled':
            return {
                badge: 'bg-gray-100 text-gray-600',
                badgeLabelAr: 'ملغي',
                badgeLabel: 'Cancelled',
                bannerClass: 'bg-gray-50 border-gray-200 text-gray-700',
                bannerIcon: XCircle,
                bannerMsgAr: 'تم إلغاء اشتراكك. يمكنك التواصل معنا لاستئناف الخدمة.',
                bannerMsg: 'Your subscription has been cancelled. Contact us to resume service.',
            }
        default:
            return {
                badge: 'bg-gray-100 text-gray-600',
                badgeLabelAr: status,
                badgeLabel: status,
            }
    }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TenantSubscriptionPage() {
    const { i18n } = useTranslation()
    const { profile } = useAuth()

    const isRTL = i18n.language === 'ar'
    const tenantId = profile?.tenant_id || ''

    const { data: subscription, isLoading: subLoading } = useTenantSubscription(tenantId)
    const { data: plans, isLoading: plansLoading } = useSubscriptionPlans()
    const { data: usage } = useTenantUsage(tenantId)

    // ─── Loading ──────────────────────────────────────────────────────────
    if (subLoading || plansLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <Loader2 className="w-8 h-8 animate-spin text-secondary" />
            </div>
        )
    }

    // ─── No Subscription ──────────────────────────────────────────────────
    if (!subscription) {
        return (
            <div className="p-6 text-center max-w-md mx-auto mt-12">
                <AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
                <h3 className="text-xl font-bold font-cairo">
                    {isRTL ? 'لا يوجد اشتراك مسجل' : 'No Subscription Found'}
                </h3>
                <p className="text-muted-foreground mt-2 font-cairo">
                    {isRTL
                        ? 'لا يوجد اشتراك مرتبط بهذه المنشأة. يرجى التواصل مع الدعم.'
                        : 'No subscription is linked to this account. Please contact support.'}
                </p>
                <a
                    href="mailto:info@mutqan-sa.com"
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg font-cairo text-sm hover:bg-secondary/90"
                >
                    <PhoneCall className="w-4 h-4" />
                    {isRTL ? 'التواصل مع الدعم' : 'Contact Support'}
                </a>
            </div>
        )
    }

    const currentPlan = subscription.plan
    const status = subscription.status
    const overrideType = subscription.override_type || 'none'
    const statusConfig = getStatusConfig(status, overrideType, isRTL)

    const periodEnd = subscription.current_period_end
    const periodStart = subscription.current_period_start
    const days = daysLeft(periodEnd)
    const forever = isEffectivelyForever(periodEnd)

    // Trial progress
    const trialStartDate = periodStart ? new Date(periodStart) : null
    const trialEndDate = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : (periodEnd ? new Date(periodEnd) : null)
    const trialTotalDays = trialStartDate && trialEndDate
        ? Math.max(1, Math.ceil((trialEndDate.getTime() - trialStartDate.getTime()) / 86_400_000))
        : 14
    const trialElapsedDays = trialTotalDays - days
    const trialProgress = Math.min(100, Math.max(0, Math.round((trialElapsedDays / trialTotalDays) * 100)))

    // Access is blocked for expired/suspended/cancelled
    const accessBlocked = ['expired', 'suspended', 'cancelled'].includes(status)

    // Usage stats (real data)
    const usageStats = [
        {
            labelAr: 'المستخدمين',
            label: 'Users',
            current: usage?.users_count ?? 0,
            max: currentPlan?.max_users ?? 0,
            icon: Users,
            color: 'bg-blue-500'
        },
        {
            labelAr: 'المباني',
            label: 'Buildings',
            current: usage?.buildings_count ?? 0,
            max: currentPlan?.max_buildings ?? 0,
            icon: Building2,
            color: 'bg-green-500'
        },
        {
            labelAr: 'الأصول',
            label: 'Assets',
            current: usage?.assets_count ?? 0,
            max: currentPlan?.max_assets ?? 0,
            icon: Database,
            color: 'bg-purple-500'
        },
        {
            labelAr: 'أوامر العمل (الشهر)',
            label: 'Work Orders (Month)',
            current: usage?.work_orders_this_month ?? 0,
            max: currentPlan?.max_work_orders_monthly ?? 0,
            icon: FileText,
            color: 'bg-orange-500'
        },
    ]

    return (
        <div className="space-y-6 p-6 max-w-5xl mx-auto">

            {/* ── Status Banner (expired / suspended / cancelled) ─────────── */}
            {statusConfig.bannerClass && (
                <div className={cn('flex items-start gap-3 p-4 rounded-xl border font-cairo', statusConfig.bannerClass)}>
                    {statusConfig.bannerIcon && <statusConfig.bannerIcon className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div className="flex-1">
                        <p className="text-sm font-medium">
                            {isRTL ? statusConfig.bannerMsgAr : statusConfig.bannerMsg}
                        </p>
                    </div>
                    <a
                        href="mailto:info@mutqan-sa.com"
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white rounded-lg border text-xs font-bold transition-colors"
                    >
                        <PhoneCall className="w-3.5 h-3.5" />
                        {isRTL ? 'تواصل معنا' : 'Contact Us'}
                    </a>
                </div>
            )}

            {/* ── Current Plan Card ──────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary to-primary" />

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h1 className="text-2xl font-bold text-gray-900 font-cairo">
                                {isRTL ? currentPlan?.name_ar || currentPlan?.name : currentPlan?.name}
                            </h1>
                            <span className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider', statusConfig.badge)}>
                                {isRTL ? statusConfig.badgeLabelAr : statusConfig.badgeLabel}
                            </span>
                            {overrideType === 'free_forever' && (
                                <span className="flex items-center gap-1 text-purple-600 text-xs font-medium">
                                    <Infinity className="w-3.5 h-3.5" />
                                    {isRTL ? 'لا تاريخ انتهاء' : 'No expiry'}
                                </span>
                            )}
                            {overrideType === 'complimentary' && (
                                <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                                    <Gift className="w-3.5 h-3.5" />
                                    {isRTL ? 'مقدم من متقن' : 'Complimentary'}
                                </span>
                            )}
                        </div>
                        <p className="text-muted-foreground font-cairo max-w-lg text-sm">
                            {isRTL ? currentPlan?.description_ar || currentPlan?.description : currentPlan?.description}
                        </p>
                        {/* Manual renewal notice */}
                        {(status === 'active' || status === 'trial') && !forever && overrideType === 'none' && (
                            <p className="mt-2 text-xs text-muted-foreground font-cairo flex items-center gap-1.5">
                                <RefreshCcw className="w-3.5 h-3.5" />
                                {isRTL
                                    ? 'التجديد يدوي — لا يتجدد الاشتراك تلقائياً'
                                    : 'Manual renewal — subscription does not auto-renew'}
                            </p>
                        )}
                    </div>

                    {/* Dates Panel */}
                    {!accessBlocked && !forever && (
                        <div className="flex items-center gap-0 bg-gray-50 rounded-xl border overflow-hidden shrink-0">
                            {periodStart && (
                                <div className="text-center px-5 py-4 border-r border-gray-200">
                                    <p className="text-xs text-muted-foreground font-bold mb-1 uppercase tracking-wider font-cairo">
                                        {isRTL ? 'تاريخ البداية' : 'Start Date'}
                                    </p>
                                    <p className="font-mono font-bold text-sm text-gray-700">
                                        {formatDate(periodStart, i18n.language)}
                                    </p>
                                </div>
                            )}
                            <div className="text-center px-5 py-4 border-r border-gray-200">
                                <p className="text-xs text-muted-foreground font-bold mb-1 uppercase tracking-wider font-cairo">
                                    {isRTL ? 'تاريخ الانتهاء' : 'End Date'}
                                </p>
                                <p className="font-mono font-bold text-sm text-secondary">
                                    {formatDate(periodEnd, i18n.language)}
                                </p>
                            </div>
                            <div className="text-center px-5 py-4">
                                <p className="text-xs text-muted-foreground font-bold mb-1 uppercase tracking-wider font-cairo">
                                    {isRTL ? 'الأيام المتبقية' : 'Days Left'}
                                </p>
                                <p className={cn('font-mono font-bold text-lg', days <= 7 ? 'text-red-500' : 'text-gray-900')}>
                                    {days}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Forever badge */}
                    {forever && (
                        <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-5 py-4 shrink-0">
                            <Infinity className="w-5 h-5 text-purple-600" />
                            <span className="text-sm font-bold text-purple-700 font-cairo">
                                {isRTL ? 'اشتراك دائم' : 'Permanent Subscription'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Trial Progress Bar */}
                {status === 'trial' && (
                    <div className="mt-6">
                        <div className="flex justify-between text-xs mb-2 font-medium font-cairo">
                            <span>{isRTL ? 'الفترة التجريبية' : 'Trial Period'}</span>
                            <span className={cn(days <= 3 ? 'text-red-600 font-bold' : '')}>
                                {isRTL ? `${days} يوم متبقي` : `${days} days remaining`}
                            </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={cn('h-full transition-all duration-500', trialProgress > 80 ? 'bg-red-400' : 'bg-blue-500')}
                                style={{ width: `${trialProgress}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 font-cairo">
                            {isRTL
                                ? 'تنتهي الفترة التجريبية تلقائياً، ولا يتم خصم أي مبلغ. للاستمرار، يرجى الترقية قبل انتهاء الفترة.'
                                : 'The trial ends automatically with no charge. To continue using the service, please upgrade before it expires.'}
                        </p>
                    </div>
                )}

                {/* Days warning for active subscriptions */}
                {status === 'active' && days <= 14 && days > 0 && overrideType === 'none' && (
                    <div className="mt-4 flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm font-cairo text-yellow-800">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {isRTL
                            ? `اشتراكك ينتهي خلال ${days} يوم. يرجى التواصل معنا للتجديد.`
                            : `Your subscription expires in ${days} days. Please contact us to renew.`}
                    </div>
                )}
            </div>

            {/* ── Usage Statistics ─────────────────────────────────────────── */}
            {!accessBlocked && (
                <div>
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 font-cairo px-1">
                        {isRTL ? 'الاستخدام الحالي' : 'Current Usage'}
                    </h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {usageStats.map((stat, index) => {
                            const isUnlimited = stat.max === -1
                            const percentage = isUnlimited || stat.max === 0 ? 0 : Math.min(100, Math.round((stat.current / stat.max) * 100))
                            const isNearLimit = !isUnlimited && percentage >= 90

                            return (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.07 }}
                                    className="bg-white p-4 rounded-xl border shadow-sm"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-white', stat.color)}>
                                            <stat.icon className="w-4 h-4" />
                                        </div>
                                        {isUnlimited ? (
                                            <span className="text-xs font-medium bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md font-cairo">
                                                {isRTL ? 'غير محدود' : 'Unlimited'}
                                            </span>
                                        ) : (
                                            <span className={cn('text-xs font-bold px-2 py-0.5 rounded-md', isNearLimit ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500')}>
                                                {percentage}%
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-xs text-muted-foreground font-cairo mb-1">
                                        {isRTL ? stat.labelAr : stat.label}
                                    </p>
                                    <div className="flex items-baseline gap-1 mb-2">
                                        <span className="text-xl font-bold text-gray-900">{stat.current}</span>
                                        <span className="text-sm text-gray-400">
                                            / {isUnlimited ? '∞' : stat.max}
                                        </span>
                                    </div>

                                    {!isUnlimited && stat.max > 0 && (
                                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={cn('h-full transition-all duration-500', isNearLimit ? 'bg-red-400' : stat.color)}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    )}
                                </motion.div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Plan Features (for non-blocked subscriptions) ────────────── */}
            {!accessBlocked && currentPlan && (
                <div className="bg-white rounded-xl border p-5">
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 font-cairo">
                        {isRTL ? 'ما تتضمنه باقتك' : 'What\'s Included in Your Plan'}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            { labelAr: 'المستخدمين', label: 'Users', val: currentPlan.max_users },
                            { labelAr: 'المباني', label: 'Buildings', val: currentPlan.max_buildings },
                            { labelAr: 'الأصول', label: 'Assets', val: currentPlan.max_assets },
                            { labelAr: 'أوامر العمل شهرياً', label: 'Work Orders / Month', val: currentPlan.max_work_orders_monthly },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                <span className="font-cairo text-gray-700">
                                    {item.val === -1
                                        ? (isRTL ? 'غير محدود' : 'Unlimited')
                                        : item.val
                                    }{' '}
                                    {isRTL ? item.labelAr : item.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── CTA Section ──────────────────────────────────────────────── */}
            <div className="bg-gray-50 border rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h3 className="font-bold font-cairo text-gray-900">
                        {status === 'trial'
                            ? (isRTL ? 'هل أنت مستعد للترقية؟' : 'Ready to Upgrade?')
                            : status === 'active'
                                ? (isRTL ? 'هل تحتاج إلى تجديد؟' : 'Need to Renew?')
                                : (isRTL ? 'هل تريد استئناف الخدمة؟' : 'Want to Resume Service?')
                        }
                    </h3>
                    <p className="text-sm text-muted-foreground font-cairo mt-1">
                        {status === 'trial'
                            ? (isRTL
                                ? 'تواصل معنا لتفعيل اشتراكك الكامل والاستمرار بدون انقطاع.'
                                : 'Contact us to activate your full subscription and continue without interruption.')
                            : (isRTL
                                ? 'التجديد يدوي. تواصل مع فريقنا وسنساعدك في إتمام العملية.'
                                : 'Renewal is manual. Contact our team and we\'ll help you complete the process.')
                        }
                    </p>
                </div>
                <a
                    href="mailto:info@mutqan-sa.com"
                    className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-xl font-cairo text-sm font-bold hover:bg-secondary/90 transition-colors"
                >
                    <PhoneCall className="w-4 h-4" />
                    {isRTL ? 'تواصل معنا' : 'Contact Us'}
                </a>
            </div>
        </div>
    )
}
