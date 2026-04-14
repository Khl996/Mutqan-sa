import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
    useBillingInvoices,
    useBillingStats,
    invoiceStatusColor,
    formatSAR,
    fmtDate,
    type BillingInvoice,
    type BillingInvoiceStatus,
} from '@/hooks/useBillingEngine'
import { toast } from 'sonner'
import {
    DollarSign, TrendingUp, Receipt, Download, Search,
    Building2, CheckCircle2, Clock, XCircle, Wallet, FileText, Loader2,
    CreditCard,
} from 'lucide-react'
import { generateInvoicePDF } from '@/utils/invoiceGenerator'

const statusConfig: Record<BillingInvoiceStatus, {
    label: { ar: string; en: string }
    icon: React.ElementType
}> = {
    paid:  { label: { ar: 'مدفوع', en: 'Paid' },    icon: CheckCircle2 },
    draft: { label: { ar: 'مسودة', en: 'Draft' },   icon: FileText },
    void:  { label: { ar: 'ملغي',  en: 'Void' },    icon: XCircle },
}

export default function FinancialsPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    const [selectedStatus, setSelectedStatus] = useState<BillingInvoiceStatus | 'all'>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [viewInvoice, setViewInvoice] = useState<BillingInvoice | null>(null)

    const { data: invoices = [], isLoading: invoicesLoading } = useBillingInvoices(
        selectedStatus !== 'all' ? { status: selectedStatus } : undefined
    )
    const { data: stats, isLoading: statsLoading } = useBillingStats()

    const isLoading = invoicesLoading || statsLoading

    const filteredInvoices = invoices.filter(inv => {
        const tenantName = inv.tenant?.name || inv.tenant?.name_ar || ''
        return (
            tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })

    const handleDownloadInvoice = async (invoice: BillingInvoice) => {
        const toastId = toast.loading(t('billing.financials.generating'))
        try {
            const tenantName = isRTL ? invoice.tenant?.name_ar || invoice.tenant?.name : invoice.tenant?.name
            await generateInvoicePDF(invoice, tenantName || 'Unknown Tenant', null)
            toast.dismiss(toastId)
            toast.success(t('billing.financials.downloaded'))
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            toast.dismiss(toastId)
            toast.error(isRTL ? `فشل التحميل: ${msg}` : `Download failed: ${msg}`)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
                        <DollarSign className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-primary font-cairo">
                            {t('billing.financials.title')}
                        </h1>
                        <p className="text-muted-foreground font-cairo">
                            {t('billing.financials.subtitle')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FinancialCard
                    title={t('billing.financials.total_revenue')}
                    value={stats?.total_revenue || 0}
                    icon={Wallet} color="success" isCurrency isLoading={isLoading}
                />
                <FinancialCard
                    title={t('billing.financials.active_subscriptions')}
                    value={stats?.active_subscriptions || 0}
                    icon={TrendingUp} color="info" isLoading={isLoading}
                />
                <FinancialCard
                    title={t('billing.financials.on_trial')}
                    value={stats?.trial_subscriptions || 0}
                    icon={Clock} color="warning" isLoading={isLoading}
                />
                <FinancialCard
                    title={t('billing.financials.expired')}
                    value={stats?.expired_subscriptions || 0}
                    icon={XCircle} color="destructive" isLoading={isLoading}
                />
            </div>

            {/* Invoices Table */}
            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 flex flex-col sm:flex-row gap-4 border-b bg-muted/5">
                    <div className="relative flex-1">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={t('common.search')}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full ps-10 pe-4 py-2.5 bg-card border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo"
                        />
                    </div>
                    <select
                        value={selectedStatus}
                        onChange={e => setSelectedStatus(e.target.value as BillingInvoiceStatus | 'all')}
                        className="px-4 py-2.5 bg-card border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo"
                    >
                        <option value="all">{t('common.all')}</option>
                        <option value="paid">{t('billing.invoice.status.paid')}</option>
                        <option value="draft">{t('billing.invoice.status.draft')}</option>
                        <option value="void">{t('billing.invoice.status.void')}</option>
                    </select>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-secondary mx-auto" />
                    </div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="p-12 text-center">
                        <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                        <p className="text-muted-foreground font-cairo">
                            {t('billing.financials.no_invoices')}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b bg-muted/5">
                                    <th className="text-start p-4 text-muted-foreground font-cairo text-sm font-medium">{t('billing.financials.col_invoice')}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo text-sm font-medium">{t('billing.financials.col_tenant')}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo text-sm font-medium">{t('billing.financials.col_amount')}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo text-sm font-medium">{t('billing.financials.col_payment')}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo text-sm font-medium">{t('billing.financials.col_paid_at')}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo text-sm font-medium">{t('billing.financials.col_status')}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo text-sm font-medium">{t('billing.financials.col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInvoices.map(inv => {
                                    const cfg = statusConfig[inv.status] ?? statusConfig.draft
                                    const StatusIcon = cfg.icon
                                    return (
                                        <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/5 transition-colors">
                                            <td className="p-4 font-mono font-medium text-sm">{inv.invoice_number}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 font-cairo text-sm">
                                                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                                                    {isRTL ? inv.tenant?.name_ar || inv.tenant?.name : inv.tenant?.name || '—'}
                                                </div>
                                            </td>
                                            <td className="p-4 font-bold text-primary font-mono">{formatSAR(inv.total)}</td>
                                            <td className="p-4">
                                                {inv.payment_method ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted/20 text-muted-foreground font-cairo capitalize">
                                                        <CreditCard className="w-3 h-3" />
                                                        {inv.payment_method}
                                                    </span>
                                                ) : <span className="text-muted-foreground text-sm">—</span>}
                                            </td>
                                            <td className="p-4 text-sm text-muted-foreground font-cairo">
                                                {fmtDate(inv.paid_at)}
                                            </td>
                                            <td className="p-4">
                                                <span className={cn(
                                                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                                                    invoiceStatusColor(inv.status)
                                                )}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {isRTL ? cfg.label.ar : cfg.label.en}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => setViewInvoice(inv)}
                                                        className="p-2 hover:bg-muted/10 rounded-lg transition-colors text-muted-foreground hover:text-primary"
                                                        title={t('billing.financials.view')}
                                                    >
                                                        <Receipt className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownloadInvoice(inv)}
                                                        className="p-2 hover:bg-muted/10 rounded-lg transition-colors text-muted-foreground hover:text-primary"
                                                        title={t('billing.financials.download_pdf')}
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* View Invoice Modal */}
            {viewInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-card border rounded-xl w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="text-lg font-bold font-cairo flex items-center gap-2">
                                <Receipt className="w-5 h-5 text-secondary" />
                                {t('billing.financials.details_title')}
                            </h2>
                            <button
                                onClick={() => setViewInvoice(null)}
                                className="p-2 hover:bg-muted/10 rounded-lg text-muted-foreground"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Number + status */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-muted-foreground font-cairo mb-0.5">{t('billing.financials.invoice_no')}</p>
                                    <p className="text-xl font-bold font-mono">{viewInvoice.invoice_number}</p>
                                </div>
                                <span className={cn(
                                    'px-3 py-1 rounded-full text-xs font-bold',
                                    invoiceStatusColor(viewInvoice.status)
                                )}>
                                    {isRTL ? statusConfig[viewInvoice.status]?.label.ar : statusConfig[viewInvoice.status]?.label.en}
                                </span>
                            </div>

                            {/* Tenant */}
                            <div className="bg-muted/5 p-4 rounded-xl border">
                                <p className="text-xs text-muted-foreground font-cairo mb-1">{t('billing.financials.bill_to')}</p>
                                <p className="font-bold">
                                    {isRTL ? viewInvoice.tenant?.name_ar || viewInvoice.tenant?.name : viewInvoice.tenant?.name || '—'}
                                </p>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-muted/5 p-3 rounded-lg">
                                    <p className="text-xs text-muted-foreground font-cairo">{t('billing.financials.issue_date')}</p>
                                    <p className="font-medium font-mono text-sm">{fmtDate(viewInvoice.created_at)}</p>
                                </div>
                                <div className="bg-muted/5 p-3 rounded-lg">
                                    <p className="text-xs text-muted-foreground font-cairo">{t('billing.financials.col_paid_at')}</p>
                                    <p className="font-medium font-mono text-sm">{fmtDate(viewInvoice.paid_at)}</p>
                                </div>
                                {(viewInvoice.billing_period_start || viewInvoice.billing_period_end) && (
                                    <div className="col-span-2 bg-muted/5 p-3 rounded-lg">
                                        <p className="text-xs text-muted-foreground font-cairo">{t('billing.financials.billing_period')}</p>
                                        <p className="font-medium font-mono text-sm">
                                            {fmtDate(viewInvoice.billing_period_start)} → {fmtDate(viewInvoice.billing_period_end)}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Pricing breakdown */}
                            <div className="bg-muted/5 rounded-xl p-4 space-y-2 text-sm font-cairo border">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>{t('billing.financials.subtotal')}</span>
                                    <span className="font-mono">{formatSAR(viewInvoice.subtotal)}</span>
                                </div>
                                {viewInvoice.discount_amount > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span>{t('billing.financials.discount')}</span>
                                        <span className="font-mono">-{formatSAR(viewInvoice.discount_amount)}</span>
                                    </div>
                                )}
                                {viewInvoice.tax_amount > 0 && (
                                    <div className="flex justify-between text-muted-foreground">
                                        <span>{isRTL ? `ضريبة القيمة المضافة ${Math.round(viewInvoice.tax_rate * 100)}%` : `VAT ${Math.round(viewInvoice.tax_rate * 100)}%`}</span>
                                        <span className="font-mono">{formatSAR(viewInvoice.tax_amount)}</span>
                                    </div>
                                )}
                                <div className="border-t pt-2 flex justify-between font-bold text-base">
                                    <span>{t('billing.financials.total')}</span>
                                    <span className="text-secondary font-mono">{formatSAR(viewInvoice.total)}</span>
                                </div>
                            </div>

                            {viewInvoice.payment_reference && (
                                <div className="text-xs font-cairo">
                                    <span className="text-muted-foreground">{t('billing.financials.payment_ref')}: </span>
                                    <span className="font-mono">{viewInvoice.payment_reference}</span>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2 border-t">
                                <button
                                    onClick={() => handleDownloadInvoice(viewInvoice)}
                                    className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors flex items-center gap-2 font-cairo text-sm"
                                >
                                    <Download className="w-4 h-4" />
                                    {t('billing.financials.download_pdf')}
                                </button>
                                <button
                                    onClick={() => setViewInvoice(null)}
                                    className="px-4 py-2 hover:bg-muted/10 rounded-lg transition-colors font-cairo text-sm"
                                >
                                    {t('billing.financials.close')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function FinancialCard({ title, value, icon: Icon, color, isCurrency = false, isLoading = false }: {
    title: string
    value: number
    icon: React.ElementType
    color: 'success' | 'warning' | 'destructive' | 'info'
    isCurrency?: boolean
    isLoading?: boolean
}) {
    const colorClasses = {
        success:     'bg-success/10 text-success',
        warning:     'bg-warning/10 text-warning',
        destructive: 'bg-destructive/10 text-destructive',
        info:        'bg-info/10 text-info',
    }

    return (
        <div className="bg-card border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
                <div className={cn('p-3 rounded-lg', colorClasses[color])}>
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                    {isLoading ? (
                        <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                    ) : (
                        <p className="text-2xl font-bold text-primary font-inter">
                            {isCurrency ? formatSAR(value) : value.toLocaleString()}
                        </p>
                    )}
                    <p className="text-muted-foreground text-sm font-cairo mt-1">{title}</p>
                </div>
            </div>
        </div>
    )
}
