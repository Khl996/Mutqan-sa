import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Clock,
    CreditCard,
    Calendar,
    CheckCircle2,
    AlertCircle,
    ShieldCheck,
    Zap,
    Users,
    Building2,
    Database,
    FileText,
    ArrowUpRight,
    Loader2
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantSubscription, useSubscriptionPlans, useCancelSubscription, useResumeSubscription } from '@/hooks/useSubscription'
import { usePayment } from '@/hooks/usePayment'
import { cn } from '@/lib/utils'

export default function TenantSubscriptionPage() {
    const { t, i18n } = useTranslation()
    const { user, profile } = useAuth()
    const { initiatePayment, isProcessing } = usePayment()
    const cancelSubscription = useCancelSubscription()
    const resumeSubscription = useResumeSubscription()

    const handleCancelSubscription = () => {
        if (!profile?.tenant_id) return
        if (confirm(isRTL ? 'هل أنت متأكد من إلغاء التجديد التلقائي؟ ستستمر صلاحية اشتراكك حتى نهاية الفترة الحالية ولن يتم خصم أي مبالغ مستقبلاً.' : 'Are you sure you want to cancel auto-renewal? Your subscription will remain active until the end of the current period.')) {
            cancelSubscription.mutate(profile.tenant_id)
        }
    }

    const handleResumeSubscription = () => {
        if (!profile?.tenant_id) return
        resumeSubscription.mutate(profile.tenant_id)
    }

    const isRTL = i18n.language === 'ar'
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly')

    // Only fetch if we have a tenant ID
    const { data: subscription, isLoading: subLoading } = useTenantSubscription(profile?.tenant_id || '')
    const { data: plans, isLoading: plansLoading } = useSubscriptionPlans()

    if (subLoading || plansLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!subscription) {
        return (
            <div className="p-6 text-center">
                <AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
                <h3 className="text-xl font-bold">{isRTL ? 'لا يوجد اشتراك نشط' : 'No Active Subscription'}</h3>
                <p className="text-muted-foreground mt-2">
                    {isRTL ? 'يرجى التواصل مع الدعم الفني' : 'Please contact support'}
                </p>
            </div>
        )
    }

    const currentPlan = subscription.plan
    const endDate = subscription.current_period_end ? new Date(subscription.current_period_end) : null
    const daysRemaining = endDate ? Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0

    // Handle Plan Selection / Payment
    const handleSubscribe = (plan: any) => {
        if (!profile?.tenant_id) return

        const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly

        initiatePayment({
            tenantId: profile.tenant_id,
            planId: plan.id,
            billingCycle,
            amount: price,
            currency: plan.currency
        })
    }

    // Calculate usage percentage (mocked for now, can be real later)
    const usageStats = [
        {
            label: isRTL ? 'المستخدمين' : 'Users',
            current: 2,
            max: currentPlan?.max_users || 0,
            icon: Users,
            color: 'bg-blue-500'
        },
        {
            label: isRTL ? 'المباني' : 'Buildings',
            current: 1,
            max: currentPlan?.max_buildings || 0,
            icon: Building2,
            color: 'bg-green-500'
        },
        {
            label: isRTL ? 'الأصول' : 'Assets',
            current: 15,
            max: currentPlan?.max_assets || 0,
            icon: Database,
            color: 'bg-purple-500'
        },
        {
            label: isRTL ? 'أوامر العمل' : 'Work Orders',
            current: 8,
            max: currentPlan?.max_work_orders_monthly || 0,
            icon: FileText,
            color: 'bg-orange-500'
        },
    ]

    return (
        <div className="space-y-8 p-6 max-w-7xl mx-auto">

            {/* Header: Current Plan Status */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary to-primary" />

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold text-gray-900 font-cairo">
                                {isRTL ? currentPlan?.name_ar || currentPlan?.name : currentPlan?.name}
                            </h1>
                            <span className={cn(
                                "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                                subscription.status === 'active' ? "bg-green-100 text-green-700" :
                                    subscription.status === 'trial' ? "bg-blue-100 text-blue-700" :
                                        "bg-red-100 text-red-700"
                            )}>
                                {subscription.status === 'active' ? (isRTL ? 'نشط' : 'Active') :
                                    subscription.status === 'trial' ? (isRTL ? 'فترة تجريبية' : 'Trial') :
                                        subscription.status}
                            </span>
                        </div>
                        <p className="text-muted-foreground font-cairo max-w-xl">
                            {isRTL ? currentPlan?.description_ar || currentPlan?.description : currentPlan?.description}
                        </p>
                    </div>

                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border">
                        <div className="text-center px-4 border-r last:border-0 border-gray-200">
                            <p className="text-xs text-muted-foreground font-bold mb-1 uppercase tracking-wider">
                                {isRTL ? 'ينتهي في' : 'Expires On'}
                            </p>
                            <p className="font-mono font-bold text-lg text-secondary">
                                {endDate ? endDate.toLocaleDateString() : '-'}
                            </p>
                        </div>
                        <div className="text-center px-4">
                            <p className="text-xs text-muted-foreground font-bold mb-1 uppercase tracking-wider">
                                {isRTL ? 'الأيام المتبقية' : 'Days Left'}
                            </p>
                            <p className={cn("font-mono font-bold text-lg", daysRemaining < 7 ? "text-red-500" : "text-gray-900")}>
                                {daysRemaining}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Apple-style Cancellation Status */}
                {subscription.cancel_at_period_end && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 bg-orange-50/50 backdrop-blur-sm border border-orange-100 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm"
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-orange-100 rounded-full text-orange-600">
                                <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-orange-900 font-cairo">
                                    {isRTL ? 'إيقاف التجديد التلقائي' : 'Auto-renewal is Off'}
                                </h3>
                                <p className="text-orange-700/80 text-sm font-cairo mt-1 max-w-lg">
                                    {isRTL
                                        ? 'سينتهي اشتراكك في التاريخ الموضح أعلاه، وستحتفظ بصلاحياتك الكاملة حتى ذلك الحين.'
                                        : 'Your subscription will end on the date shown above. You retain full access until then.'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleResumeSubscription}
                            disabled={resumeSubscription.isPending}
                            className="px-6 py-2 bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                            {resumeSubscription.isPending && <Loader2 className="w-4 h-4 animate-spin inline-block me-2" />}
                            {isRTL ? 'استئناف الاشتراك' : 'Resume Subscription'}
                        </button>
                    </motion.div>
                )}

                {!subscription.cancel_at_period_end && subscription.status === 'active' && (
                    <div className="mt-4 flex justify-end px-2">
                        <button
                            onClick={handleCancelSubscription}
                            disabled={cancelSubscription.isPending}
                            className="text-sm text-gray-500 hover:text-red-600 transition-colors font-medium flex items-center gap-1 group"
                        >
                            <span className="group-hover:underline decoration-dotted underline-offset-4">
                                {cancelSubscription.isPending ? (isRTL ? 'جاري الإلغاء...' : 'Cancelling...') : (isRTL ? 'إلغاء التجديد التلقائي' : 'Cancel Auto-renewal')}
                            </span>
                        </button>
                    </div>
                )}

                {/* Progress Bar for Trial */}
                {subscription.status === 'trial' && (
                    <div className="mt-6">
                        <div className="flex justify-between text-xs mb-2 font-medium">
                            <span>{isRTL ? 'الفترة التجريبية' : 'Trial Period'}</span>
                            <span>{Math.round((14 - daysRemaining) / 14 * 100)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-500"
                                style={{ width: `${Math.round((14 - daysRemaining) / 14 * 100)}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Usage Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {usageStats.map((stat, index) => {
                    const percentage = stat.max === -1 ? 0 : Math.round((stat.current / stat.max) * 100)
                    const isUnlimited = stat.max === -1

                    return (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-white", stat.color)}>
                                    <stat.icon className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-muted-foreground bg-gray-50 px-2 py-1 rounded-md">
                                    {isUnlimited ? (isRTL ? 'غير محدود' : 'Unlimited') : `${percentage}%`}
                                </span>
                            </div>

                            <h3 className="text-sm font-medium text-muted-foreground mb-1">{stat.label}</h3>
                            <div className="flex items-baseline gap-1 mb-3">
                                <span className="text-2xl font-bold text-gray-900">{stat.current}</span>
                                <span className="text-sm text-gray-400">/ {isUnlimited ? '∞' : stat.max}</span>
                            </div>

                            {!isUnlimited && (
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={cn("h-full transition-all duration-500", stat.color)}
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            )}
                        </motion.div>
                    )
                })}
            </div>

            {/* Available Plans */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-500" />
                        {isRTL ? 'الخطط المتاحة (سنوي)' : 'Available Plans (Yearly)'}
                    </h2>

                    {/* Billing Cycle Toggle Hidden - Yearly Only */}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans?.map((plan) => {
                        const isCurrent = plan.id === currentPlan?.id
                        const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly

                        return (
                            <div
                                key={plan.id}
                                className={cn(
                                    "relative bg-white rounded-2xl border p-6 transition-all duration-300",
                                    isCurrent ? "border-secondary ring-2 ring-secondary/20 shadow-lg" : "hover:border-secondary/50 hover:shadow-md"
                                )}
                            >
                                {isCurrent && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-secondary text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                                        {isRTL ? 'الخطة الحالية' : 'Current Plan'}
                                    </div>
                                )}

                                <div className="text-center mb-6">
                                    <h3 className="text-lg font-bold mb-2">{isRTL ? plan.name_ar || plan.name : plan.name}</h3>
                                    <div className="flex items-center justify-center gap-1 mb-2">
                                        <span className="text-3xl font-bold text-gray-900">{price}</span>
                                        <span className="text-sm text-muted-foreground">{plan.currency} / {billingCycle === 'yearly' ? (isRTL ? 'سنوياً' : 'yr') : (isRTL ? 'شهرياً' : 'mo')}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground h-10 line-clamp-2">
                                        {isRTL ? plan.description_ar || plan.description : plan.description}
                                    </p>
                                </div>

                                <ul className="space-y-3 mb-8">
                                    {[
                                        { label: isRTL ? 'المستخدمين' : 'Users', val: plan.max_users },
                                        { label: isRTL ? 'المباني' : 'Buildings', val: plan.max_buildings },
                                        { label: isRTL ? 'الأصول' : 'Assets', val: plan.max_assets },
                                        { label: isRTL ? 'أوامر العمل' : 'Work Orders', val: plan.max_work_orders_monthly },
                                    ].map((feat, i) => (
                                        <li key={i} className="flex items-center gap-3 text-sm">
                                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                            <span className="text-gray-600">
                                                {feat.val === -1 ? (isRTL ? 'غير محدود' : 'Unlimited') : feat.val} {feat.label}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => handleSubscribe(plan)}
                                    disabled={isCurrent || isProcessing}
                                    className={cn(
                                        "w-full h-10 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2",
                                        isCurrent
                                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                            : "bg-secondary text-white hover:bg-secondary/90"
                                    )}
                                >
                                    {isProcessing && !isCurrent ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {isCurrent ? (isRTL ? 'مفعل' : 'Active') : (isRTL ? 'ترقية' : 'Upgrade')}
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
