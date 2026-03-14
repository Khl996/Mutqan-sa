import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { usePlatformInvoices, useFinancialStats, useCreateInvoice, PlatformInvoice } from '@/hooks/usePlatformManagement'
import { useTenants } from '@/hooks/useTenants'
import { toast } from 'sonner'
import {
    DollarSign, TrendingUp, Receipt, Calendar, Download, Search,
    Building2, CheckCircle2, Clock, XCircle, Wallet, FileText, Loader2, Plus, Eye
} from 'lucide-react'

import { generateInvoicePDF } from '@/utils/invoiceGenerator'

const statusConfig = {
    paid: { label: { ar: 'مدفوع', en: 'Paid' }, color: 'bg-success/10 text-success', icon: CheckCircle2 },
    pending: { label: { ar: 'قيد الانتظار', en: 'Pending' }, color: 'bg-warning/10 text-warning', icon: Clock },
    overdue: { label: { ar: 'متأخر', en: 'Overdue' }, color: 'bg-destructive/10 text-destructive', icon: XCircle },
    draft: { label: { ar: 'مسودة', en: 'Draft' }, color: 'bg-muted/10 text-muted-foreground', icon: FileText },
    cancelled: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'bg-muted/10 text-muted-foreground', icon: XCircle },
    refunded: { label: { ar: 'مسترد', en: 'Refunded' }, color: 'bg-info/10 text-info', icon: Receipt },
}

export default function FinancialsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [selectedStatus, setSelectedStatus] = useState('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [newInvoice, setNewInvoice] = useState<Partial<PlatformInvoice>>({
        status: 'pending',
        currency: 'SAR',
        due_date: new Date().toISOString().split('T')[0]
    })

    // Fetch data
    const { data: invoices, isLoading: invoicesLoading } = usePlatformInvoices({ status: selectedStatus !== 'all' ? selectedStatus : undefined })
    const { data: stats, isLoading: statsLoading } = useFinancialStats()
    const { data: tenants, isLoading: tenantsLoading } = useTenants()

    const [viewInvoice, setViewInvoice] = useState<PlatformInvoice | null>(null)

    const handleDownloadInvoice = async (invoice: PlatformInvoice) => {
        const toastId = toast.loading(isRTL ? 'جاري تحضير الفاتورة...' : 'Generating Invoice...');
        try {
            const tenantName = isRTL ? invoice.tenant?.name_ar || invoice.tenant?.name : invoice.tenant?.name
            // @ts-expect-error - address is fetched but typed loosely in hook return
            const tenantAddress = invoice.tenant?.address
            await generateInvoicePDF(invoice, tenantName || 'Unknown Tenant', tenantAddress)
            toast.dismiss(toastId);
            toast.success(isRTL ? 'تم تحميل الفاتورة' : 'Invoice downloaded')
        } catch (e: any) {
            console.error('PDF Generation Error:', e)
            toast.dismiss(toastId);
            toast.error(isRTL ? `فشل التحميل: ${e.message}` : `Download failed: ${e.message}`)
        }
    }

    const handleViewInvoice = (invoice: PlatformInvoice) => {
        setViewInvoice(invoice)
    }

    // Mutations
    const createInvoice = useCreateInvoice()

    const handleCreateInvoice = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await createInvoice.mutateAsync({
                ...newInvoice,
                // Ensure number conversion
                total: Number(newInvoice.total),
                subtotal: Number(newInvoice.total), // Simplified for now
                created_at: new Date().toISOString()
            })
            toast.success(isRTL ? 'تم إنشاء الفاتورة بنجاح' : 'Invoice created successfully')
            setIsCreateModalOpen(false)
            setNewInvoice({
                status: 'pending',
                currency: 'SAR',
                due_date: new Date().toISOString().split('T')[0],
                invoice_number: '',
                total: 0,
                tenant_id: ''
            })
        } catch (error: any) {
            toast.error(isRTL ? 'فشل إنشاء الفاتورة' : 'Failed to create invoice')
        }
    }

    const filteredInvoices = (invoices || []).filter(inv => {
        const tenantName = inv.tenant?.name || inv.tenant?.name_ar || ''
        const matchesSearch = tenantName.toLowerCase().includes(searchQuery.toLowerCase()) || inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesSearch
    })

    const isLoading = invoicesLoading || statsLoading

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
                        <DollarSign className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-primary font-cairo">{isRTL ? 'الإدارة المالية' : 'Financial Management'}</h1>
                        <p className="text-muted-foreground font-cairo">{isRTL ? 'الإيرادات والفواتير' : 'Revenue and invoices'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-secondary/90 text-white rounded-xl transition-all font-cairo"
                    >
                        <Plus className="w-5 h-5" />
                        {isRTL ? 'إنشاء فاتورة' : 'Create Invoice'}
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2.5 bg-card border text-primary rounded-xl hover:bg-muted/10 transition-all font-cairo">
                        <Download className="w-5 h-5" />
                        {isRTL ? 'تصدير' : 'Export'}
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FinancialCard title={isRTL ? 'إجمالي الإيرادات' : 'Total Revenue'} value={stats?.totalRevenue || 0} icon={Wallet} color="success" isCurrency isLoading={isLoading} />
                <FinancialCard title={isRTL ? 'المبالغ المعلقة' : 'Pending'} value={stats?.pendingAmount || 0} icon={Clock} color="warning" isCurrency isLoading={isLoading} />
                <FinancialCard title={isRTL ? 'المبالغ المتأخرة' : 'Overdue'} value={stats?.overdueAmount || 0} icon={XCircle} color="destructive" isCurrency isLoading={isLoading} />
                <FinancialCard title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'} value={stats?.collectionRate || 0} icon={TrendingUp} color="info" isPercentage isLoading={isLoading} />
            </div>

            {/* Invoices Table */}
            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 flex flex-col sm:flex-row gap-4 border-b bg-muted/5">
                    <div className="relative flex-1">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input type="text" placeholder={isRTL ? 'بحث...' : 'Search...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full ps-10 pe-4 py-2.5 bg-card border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo" />
                    </div>
                    <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                        className="px-4 py-2.5 bg-card border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo">
                        <option value="all">{isRTL ? 'الكل' : 'All'}</option>
                        <option value="paid">{isRTL ? 'مدفوع' : 'Paid'}</option>
                        <option value="pending">{isRTL ? 'معلق' : 'Pending'}</option>
                        <option value="overdue">{isRTL ? 'متأخر' : 'Overdue'}</option>
                    </select>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-secondary mx-auto" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'الفاتورة' : 'Invoice'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'المنشأة' : 'Tenant'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'الباقة' : 'Plan'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'المبلغ' : 'Amount'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'الحالة' : 'Status'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'الإجراءات' : 'Actions'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInvoices.map(inv => {
                                    const status = statusConfig[inv.status as keyof typeof statusConfig] || statusConfig.pending
                                    const StatusIcon = status.icon
                                    return (
                                        <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/5 transition-colors">
                                            <td className="p-4 font-mono font-medium">{inv.invoice_number}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-cairo">{isRTL ? inv.tenant?.name_ar || inv.tenant?.name : inv.tenant?.name || 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="px-2 py-1 bg-secondary/10 text-secondary rounded-lg text-sm">{inv.plan_name || '-'}</span>
                                            </td>
                                            <td className="p-4 font-bold text-primary">{Number(inv.total || 0).toLocaleString()} SAR</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                                    <Calendar className="w-4 h-4" />
                                                    {inv.due_date || '-'}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', status.color)}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {isRTL ? status.label.ar : status.label.en}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleViewInvoice(inv)}
                                                        className="p-2 hover:bg-muted/10 rounded-lg transition-colors text-muted-foreground hover:text-primary">
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownloadInvoice(inv)}
                                                        className="p-2 hover:bg-muted/10 rounded-lg transition-colors text-muted-foreground hover:text-primary">
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

                {!isLoading && filteredInvoices.length === 0 && (
                    <div className="p-12 text-center">
                        <Receipt className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground font-cairo">{isRTL ? 'لا توجد فواتير' : 'No invoices found'}</p>
                    </div>
                )}
            </div>
            {/* Create Invoice Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-card border rounded-xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-xl font-bold font-cairo">
                                {isRTL ? 'إنشاء فاتورة جديدة' : 'Create New Invoice'}
                            </h2>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="text-muted-foreground hover:text-primary transition-colors"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateInvoice} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 font-cairo">
                                    {isRTL ? 'المنشأة' : 'Tenant'}
                                </label>
                                <select
                                    required
                                    value={newInvoice.tenant_id || ''}
                                    onChange={(e) => setNewInvoice({ ...newInvoice, tenant_id: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo"
                                >
                                    <option value="">{isRTL ? 'ختر المنشأة...' : 'Select Tenant...'}</option>
                                    {tenantsLoading ? (
                                        <option disabled>{isRTL ? 'جاري التحميل...' : 'Loading...'}</option>
                                    ) : (
                                        (tenants || []).map((tenant: any) => (
                                            <option key={tenant.id} value={tenant.id}>
                                                {isRTL ? tenant.name_ar || tenant.name : tenant.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1 font-cairo">
                                        {isRTL ? 'رقم الفاتورة' : 'Invoice Number'}
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={newInvoice.invoice_number || ''}
                                        onChange={(e) => setNewInvoice({ ...newInvoice, invoice_number: e.target.value })}
                                        placeholder="INV-000"
                                        className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1 font-cairo">
                                        {isRTL ? 'المبلغ (SAR)' : 'Amount (SAR)'}
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        step="0.01"
                                        value={newInvoice.total || 0}
                                        onChange={(e) => setNewInvoice({ ...newInvoice, total: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1 font-cairo">
                                        {isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={newInvoice.due_date || ''}
                                        onChange={(e) => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
                                        className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1 font-cairo">
                                        {isRTL ? 'الحالة' : 'Status'}
                                    </label>
                                    <select
                                        value={newInvoice.status || 'pending'}
                                        onChange={(e) => setNewInvoice({ ...newInvoice, status: e.target.value as any })}
                                        className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo"
                                    >
                                        <option value="draft">{isRTL ? 'مسودة' : 'Draft'}</option>
                                        <option value="pending">{isRTL ? 'معلق' : 'Pending'}</option>
                                        <option value="paid">{isRTL ? 'مدفوع' : 'Paid'}</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 font-cairo">
                                    {isRTL ? 'الوصف' : 'Description'}
                                </label>
                                <textarea
                                    value={newInvoice.notes || ''}
                                    onChange={(e) => setNewInvoice({ ...newInvoice, notes: e.target.value })}
                                    rows={3}
                                    className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo"
                                    placeholder={isRTL ? 'وصف للفاتورة...' : 'Invoice description...'}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 hover:bg-muted/10 rounded-lg transition-colors font-cairo"
                                >
                                    {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={createInvoice.isPending}
                                    className="px-6 py-2 bg-secondary hover:bg-secondary/90 text-white font-bold rounded-lg transition-colors font-cairo disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {createInvoice.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isRTL ? 'إنشاء الفاتورة' : 'Create Invoice'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Invoice Modal */}
            {viewInvoice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-card border rounded-xl w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-xl font-bold font-cairo flex items-center gap-2">
                                <Receipt className="w-5 h-5 text-secondary" />
                                {isRTL ? 'تفاصيل الفاتورة' : 'Invoice Details'}
                            </h2>
                            <button
                                onClick={() => setViewInvoice(null)}
                                className="text-muted-foreground hover:text-primary transition-colors"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Header Info */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-muted-foreground font-cairo">{isRTL ? 'رقم الفاتورة' : 'Invoice No.'}</p>
                                    <p className="text-xl font-bold">{viewInvoice.invoice_number}</p>
                                </div>
                                <div className="text-end">
                                    <span className={cn(
                                        'px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-2',
                                        statusConfig[viewInvoice.status as keyof typeof statusConfig]?.color
                                    )}>
                                        {isRTL ? statusConfig[viewInvoice.status as keyof typeof statusConfig]?.label.ar : statusConfig[viewInvoice.status as keyof typeof statusConfig]?.label.en}
                                    </span>
                                </div>
                            </div>

                            {/* Tenant Info */}
                            <div className="bg-muted/5 p-4 rounded-xl border">
                                <h3 className="text-sm font-bold text-muted-foreground mb-2 font-cairo">{isRTL ? 'المنشأة' : 'Bill To'}</h3>
                                <p className="font-bold text-lg">{isRTL ? viewInvoice.tenant?.name_ar || viewInvoice.tenant?.name : viewInvoice.tenant?.name}</p>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-muted/5 p-3 rounded-lg">
                                    <p className="text-xs text-muted-foreground font-cairo">{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</p>
                                    <p className="font-medium font-mono">{new Date(viewInvoice.created_at).toLocaleDateString()}</p>
                                </div>
                                <div className="bg-muted/5 p-3 rounded-lg">
                                    <p className="text-xs text-muted-foreground font-cairo">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</p>
                                    <p className="font-medium font-mono">{viewInvoice.due_date ? new Date(viewInvoice.due_date).toLocaleDateString() : '-'}</p>
                                </div>
                            </div>

                            {/* Items Table (Simplified) */}
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-start py-2 font-cairo text-sm text-muted-foreground">{isRTL ? 'الوصف' : 'Description'}</th>
                                        <th className="text-end py-2 font-cairo text-sm text-muted-foreground">{isRTL ? 'المبلغ' : 'Amount'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    <tr>
                                        <td className="py-3">
                                            <p className="font-medium">{viewInvoice.plan_name || (isRTL ? 'اشتراك منصة متقن' : 'Mutqan Platform Subscription')}</p>
                                            {viewInvoice.notes && <p className="text-sm text-muted-foreground">{viewInvoice.notes}</p>}
                                        </td>
                                        <td className="py-3 text-end font-medium">
                                            {Number(viewInvoice.total).toLocaleString()} {viewInvoice.currency}
                                        </td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr className="border-t">
                                        <td className="py-4 font-bold font-cairo">{isRTL ? 'الإجمالي' : 'Total'}</td>
                                        <td className="py-4 text-end font-bold text-lg text-primary">
                                            {Number(viewInvoice.total).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{viewInvoice.currency}</span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                    onClick={() => handleDownloadInvoice(viewInvoice)}
                                    className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors flex items-center gap-2 font-cairo"
                                >
                                    <Download className="w-4 h-4" />
                                    {isRTL ? 'تحميل PDF' : 'Download PDF'}
                                </button>
                                <button
                                    onClick={() => setViewInvoice(null)}
                                    className="px-4 py-2 hover:bg-muted/10 rounded-lg transition-colors font-cairo"
                                >
                                    {isRTL ? 'إغلاق' : 'Close'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function FinancialCard({ title, value, icon: Icon, color, isCurrency = false, isPercentage = false, isLoading = false }: {
    title: string; value: number; icon: React.ElementType; color: 'success' | 'warning' | 'destructive' | 'info'; isCurrency?: boolean; isPercentage?: boolean; isLoading?: boolean
}) {
    const colorClasses = {
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        destructive: 'bg-destructive/10 text-destructive',
        info: 'bg-info/10 text-info',
    }

    return (
        <div className="bg-card border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
                <div className={cn("p-3 rounded-lg", colorClasses[color])}>
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                    {isLoading ? (
                        <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                    ) : (
                        <p className="text-2xl font-bold text-primary font-inter">
                            {isCurrency && `${value.toLocaleString()} SAR`}
                            {isPercentage && `${value}%`}
                            {!isCurrency && !isPercentage && value.toLocaleString()}
                        </p>
                    )}
                    <p className="text-muted-foreground text-sm font-cairo mt-1">{title}</p>
                </div>
            </div>
        </div>
    )
}
