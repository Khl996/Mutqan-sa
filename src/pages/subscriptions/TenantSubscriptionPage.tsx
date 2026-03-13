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
import { useTenantSubscription, useSubscriptionPlans } from '@/hooks/useSubscription'
import { usePayment } from '@/hooks/usePayment'
import { useTenantUsage } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'

export default function TenantSubscriptionPage() {
    const { t, i18n } = useTranslation()
    const { user, profile } = useAuth()
    const { initiatePayment, isProcessing } = usePayment()
    const { data: usage } = useTenantUsage(profile?.tenant_id || '')


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
    const daysRemaining = endDate ? Math.max(0, Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : 0
    const isExpired = endDate ? endDate < new Date() : false

    // Handle Plan Selection / Payment
    const handleSubscribe = (plan: any) => {
        if (!profile?.tenant_id) return

        const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly

        initiatePayment({
            tenantId: profile.tenant_id,
            planId: plan.id,
            planName: isRTL ? (plan.name_ar || plan.name) : plan.name,
            billingCycle,
            amount: price,
            currency: plan.currency,
            customerEmail: user?.email || '',
            customerName: profile?.full_name || '',
        })
    }

    // Real usage statistics from database
    const usageStats = [
        {
            label: isRTL ? 'المستخدمين' : 'Users',
            current: usage?.users_count || 0,
            max: currentPlan?.max_users || 0,
            icon: Users,
            color: 'bg-blue-500'
        },
        {
            label: isRTL ? 'المباني' : 'Buildings',
            current: usage?.buildings_count || 0,
            max: currentPlan?.max_buildings || 0,
            icon: Building2,
            color: 'bg-green-500'
        },
        {
            label: isRTL ? 'الأصول' : 'Assets',
            current: usage?.assets_count || 0,
            max: currentPlan?.max_assets || 0,
            icon: Database,
            color: 'bg-purple-500'
        },
        {
            label: isRTL ? 'أوامر العمل' : 'Work Orders',
            current: usage?.work_orders_this_month || 0,
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
                    {plans?.filter((plan) => {
                        // Hide free plan if user is on a paid plan or has expired (was on a paid plan before)
                        if (plan.code === 'free' && subscription.status !== 'trial') return false
                        return true
                    }).map((plan) => {
                        const isCurrent = plan.id === currentPlan?.id
                        const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
                        const currentOrder = currentPlan?.display_order || 0
                        const isUpgrade = plan.display_order > currentOrder
                        const isDowngrade = plan.display_order < currentOrder

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
                                    disabled={isCurrent || isProcessing || isDowngrade}
                                    className={cn(
                                        "w-full h-10 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2",
                                        isCurrent
                                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                            : isDowngrade
                                                ? "bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-200"
                                                : "bg-secondary text-white hover:bg-secondary/90"
                                    )}
                                >
                                    {isProcessing && isUpgrade ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {isCurrent
                                        ? (isRTL ? 'مفعل' : 'Active')
                                        : isUpgrade
                                            ? (isRTL ? 'ترقية' : 'Upgrade')
                                            : (isRTL ? 'خطة أقل' : 'Lower Plan')}
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
