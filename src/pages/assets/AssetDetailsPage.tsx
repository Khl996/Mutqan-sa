import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'react-qr-code'
import { toast } from 'sonner'
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Building2,
    Calendar,
    CalendarClock,
    CheckCircle2,
    ClipboardList,
    Download,
    FileText,
    ImageIcon,
    Loader2,
    MapPin,
    Printer,
    ShieldAlert,
    Wrench,
    XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useAsset } from '@/hooks/useAssets'
import { useChangeAssetStatus } from '@/hooks/useAssetOperations'
import { useAssetMaintenance } from '@/hooks/useAssetMaintenance'
import { useWorkOrders, isPreventiveWorkOrder } from '@/hooks/useWorkOrders'
import { usePMSchedules } from '@/hooks/usePMFoundation'
import { usePermission } from '@/hooks/usePermission'
import { useModuleAccess } from '@/hooks/useTenantModules'
import { STATUS_DISPLAY, isOverdueWorkOrder } from '@/config/workOrderStatus'
import { getTaskStatusClass } from '@/lib/pm'
import { cn, formatDate } from '@/lib/utils'

type AssetStatus = 'operational' | 'under_maintenance' | 'out_of_service' | 'retired'

const STATUS_OPTIONS: Array<{
    value: AssetStatus
    icon: React.ElementType
    colorClass: string
    labelKey: string
}> = [
    { value: 'operational', icon: CheckCircle2, colorClass: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20', labelKey: 'assets.operational' },
    { value: 'under_maintenance', icon: Wrench, colorClass: 'bg-amber-500/15 text-amber-700 border-amber-500/20', labelKey: 'assets.underMaintenance' },
    { value: 'out_of_service', icon: AlertTriangle, colorClass: 'bg-rose-500/15 text-rose-700 border-rose-500/20', labelKey: 'assets.outOfService' },
    { value: 'retired', icon: XCircle, colorClass: 'bg-slate-200/70 text-slate-700 border-slate-300', labelKey: 'assets.retired' },
]

const CRITICALITY_CONFIG: Record<string, { colorClass: string; labelKey: string }> = {
    critical: { colorClass: 'bg-rose-500/15 text-rose-700 border-rose-500/20', labelKey: 'assets.critical' },
    high:     { colorClass: 'bg-orange-500/15 text-orange-700 border-orange-500/20', labelKey: 'assets.high' },
    medium:   { colorClass: 'bg-amber-500/15 text-amber-700 border-amber-500/20', labelKey: 'assets.medium' },
    low:      { colorClass: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20', labelKey: 'assets.low' },
}

const FREQUENCY_LABEL: Record<string, { en: string; ar: string }> = {
    daily:       { en: 'Daily', ar: 'يومي' },
    weekly:      { en: 'Weekly', ar: 'أسبوعي' },
    monthly:     { en: 'Monthly', ar: 'شهري' },
    quarterly:   { en: 'Quarterly', ar: 'ربع سنوي' },
    semi_annual: { en: 'Semi-Annual', ar: 'نصف سنوي' },
    annual:      { en: 'Annual', ar: 'سنوي' },
    custom:      { en: 'Custom', ar: 'مخصص' },
}

export default function AssetDetailsPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { t, i18n } = useTranslation()
    const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-US'
    const isRTL = i18n.language === 'ar'
    const qrWrapperRef = useRef<HTMLDivElement | null>(null)
    const { can } = usePermission()
    const maintenanceEnabled = useModuleAccess('maintenance')
    const canViewPm = maintenanceEnabled && can('maintenance.view')
    const [tab, setTab] = useState<'overview' | 'pm'>('overview')
    const [isStatusChanging, setIsStatusChanging] = useState(false)
    const [pendingStatus, setPendingStatus] = useState<AssetStatus | null>(null)
    const [historySearch, setHistorySearch] = useState('')
    const [historyStatusFilter, setHistoryStatusFilter] = useState('all')

    const { data: asset, isLoading, error } = useAsset(id!)
    const changeAssetStatus = useChangeAssetStatus()
    const { data: allWorkOrders } = useWorkOrders()
    const { data: allPMSchedules } = usePMSchedules()
    const { history, stats, isLoading: historyLoading } = useAssetMaintenance(id ?? '')

    const assetWorkOrders = useMemo(
        () => (allWorkOrders ?? []).filter((workOrder) => workOrder.asset_id === id),
        [allWorkOrders, id]
    )

    const assetPMSchedules = useMemo(
        () => (allPMSchedules ?? []).filter(s => s.assets?.some(a => a.asset_id === id)),
        [allPMSchedules, id]
    )

    const overdueWorkOrders = useMemo(
        () => assetWorkOrders.filter(wo => isOverdueWorkOrder(wo.due_date, wo.status)),
        [assetWorkOrders]
    )

    const openWorkOrders = useMemo(
        () => assetWorkOrders.filter(wo => !['completed', 'auto_closed', 'cancelled', 'rejected_by_technician', 'archived'].includes(wo.status)),
        [assetWorkOrders]
    )

    const filteredHistory = useMemo(() => {
        const query = historySearch.trim().toLowerCase()
        return history.filter((record) => {
            const matchesSearch =
                !query ||
                record.task_title.toLowerCase().includes(query) ||
                record.plan_name?.toLowerCase().includes(query) ||
                record.technician_name?.toLowerCase().includes(query)
            const matchesStatus = historyStatusFilter === 'all' || record.task_status === historyStatusFilter
            return matchesSearch && matchesStatus
        })
    }, [history, historySearch, historyStatusFilter])

    const qrValue = `${window.location.origin}/assets/${id}`

    const requestStatusChange = (newStatus: AssetStatus) => {
        if (!asset || newStatus === asset.status) return
        setPendingStatus(newStatus)
    }

    const handleStatusChange = async () => {
        if (!asset || !pendingStatus || pendingStatus === asset.status) return

        try {
            setIsStatusChanging(true)
            await changeAssetStatus.mutateAsync({ assetId: asset.id, newStatus: pendingStatus, notes: undefined })
            toast.success(t('pm.asset.status_updated'))
            setPendingStatus(null)
        } catch (statusError) {
            toast.error(statusError instanceof Error ? statusError.message : t('pm.asset.status_update_failed'))
        } finally {
            setIsStatusChanging(false)
        }
    }

    const handlePrintQr = () => {
        if (!asset) return
        const printWindow = window.open('', '_blank')
        const qrMarkup = qrWrapperRef.current?.innerHTML ?? ''
        if (!printWindow) return

        printWindow.document.write(`
            <html dir="${isRTL ? 'rtl' : 'ltr'}">
            <head>
                <title>${t('pm.asset.print_qr')}</title>
                <style>
                    body { font-family: sans-serif; padding: 32px; text-align: center; }
                    .qr { margin: 16px auto; width: 220px; }
                    .code { font-size: 14px; color: #666; }
                </style>
            </head>
            <body>
                <h1>${asset.name}</h1>
                <p class="code">${asset.code}</p>
                <div class="qr">${qrMarkup}</div>
                <p>${qrValue}</p>
                <script>window.print();</script>
            </body>
            </html>
        `)
        printWindow.document.close()
    }

    const handleDownloadQr = async () => {
        const svg = qrWrapperRef.current?.querySelector('svg')
        if (!svg || !asset) return

        try {
            const serializer = new XMLSerializer()
            const source = serializer.serializeToString(svg)
            const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const image = new Image()
            image.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = 512
                canvas.height = 512
                const context = canvas.getContext('2d')
                if (context) {
                    context.fillStyle = '#ffffff'
                    context.fillRect(0, 0, canvas.width, canvas.height)
                }
                context?.drawImage(image, 0, 0, canvas.width, canvas.height)
                URL.revokeObjectURL(url)

                const link = document.createElement('a')
                link.href = canvas.toDataURL('image/png')
                link.download = `asset-${asset.code}-qr.png`
                link.click()
                toast.success(t('pm.asset.download_qr'))
            }
            image.src = url
        } catch (downloadError) {
            toast.error(downloadError instanceof Error ? downloadError.message : t('common.error'))
        }
    }

    if (isLoading) {
        return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    }

    if (error || !asset) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
                    <p className="font-cairo text-muted-foreground">{t('common.noData')}</p>
                    <Button className="mt-4" onClick={() => navigate('/assets')}>{t('common.back')}</Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-4">
                <Button variant="outline" size="icon" onClick={() => navigate('/assets')}>
                    {isRTL ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                </Button>
                <div className="flex-1 space-y-3">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{asset.code}</Badge>
                                <Badge className={cn('border', STATUS_OPTIONS.find((option) => option.value === asset.status)?.colorClass)}>
                                    {t(STATUS_OPTIONS.find((option) => option.value === asset.status)?.labelKey ?? 'assets.operational')}
                                </Badge>
                                {asset.criticality && CRITICALITY_CONFIG[asset.criticality] && (
                                    <Badge className={cn('border', CRITICALITY_CONFIG[asset.criticality].colorClass)}>
                                        <ShieldAlert className="me-1 h-3 w-3" />
                                        {t(CRITICALITY_CONFIG[asset.criticality].labelKey)}
                                    </Badge>
                                )}
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold font-cairo text-primary">{isRTL ? asset.name_ar || asset.name : asset.name}</h1>
                                {asset.description ? <p className="mt-2 text-muted-foreground font-cairo">{asset.description}</p> : null}
                                {(asset.building || asset.floor || asset.room) && (
                                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground font-cairo">
                                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                                        {[
                                            isRTL ? asset.building?.name_ar || asset.building?.name : asset.building?.name,
                                            isRTL ? asset.floor?.name_ar || asset.floor?.name : asset.floor?.name,
                                            isRTL ? asset.room?.name_ar || asset.room?.name : asset.room?.name,
                                        ].filter(Boolean).join(' / ')}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {STATUS_OPTIONS.map((option) => (
                            <Button
                                key={option.value}
                                variant={asset.status === option.value ? 'default' : 'outline'}
                                className="justify-start"
                                disabled={isStatusChanging}
                                onClick={() => requestStatusChange(option.value)}
                            >
                                <option.icon className="me-2 h-4 w-4" />
                                {t(option.labelKey)}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            <ConfirmActionDialog
                open={!!pendingStatus}
                onOpenChange={(open) => !open && setPendingStatus(null)}
                title={t('pm.asset.change_status_confirm')}
                description={isRTL
                    ? 'سيتم تسجيل تغيير حالة الأصل ضمن السجل التشغيلي للأصل.'
                    : 'This asset status change will be recorded in the asset operation history.'}
                confirmLabel={t('common.confirm')}
                cancelLabel={t('common.cancel')}
                onConfirm={() => void handleStatusChange()}
                tone="default"
            />

            <Tabs value={tab} onValueChange={(value) => setTab(value as 'overview' | 'pm')} className="space-y-6">
                <TabsList className={cn('grid w-full', canViewPm ? 'grid-cols-2' : 'grid-cols-1')}>
                    <TabsTrigger value="overview">{t('common.details')}</TabsTrigger>
                    {canViewPm ? <TabsTrigger value="pm">{t('pm.asset.maintenance_tab')}</TabsTrigger> : null}
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                    {/* Attention Signals — only shown when there is something to act on */}
                    {(overdueWorkOrders.length > 0 || (asset.status === 'out_of_service' && openWorkOrders.length === 0)) && (
                        <div className="flex flex-wrap gap-3">
                            {overdueWorkOrders.length > 0 && (
                                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive font-cairo">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                    {isRTL
                                        ? `${overdueWorkOrders.length} ${overdueWorkOrders.length === 1 ? 'أمر عمل متأخر' : 'أوامر عمل متأخرة'} لهذا الأصل`
                                        : `${overdueWorkOrders.length} overdue work ${overdueWorkOrders.length === 1 ? 'order' : 'orders'} on this asset`}
                                </div>
                            )}
                            {asset.status === 'out_of_service' && openWorkOrders.length === 0 && (
                                <div className="flex items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-400/5 px-4 py-2.5 text-sm text-orange-700 font-cairo">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                    {isRTL ? 'الأصل خارج الخدمة ولا توجد أوامر عمل مفتوحة.' : 'Asset is out of service with no open work orders.'}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                        <div className="space-y-6">
                            {/* A. Asset Overview — identity, location, key metadata */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="font-cairo">{t('common.details')}</CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-4 md:grid-cols-2">
                                    <InfoLine
                                        label={t('assets.location')}
                                        value={[
                                            isRTL ? asset.building?.name_ar || asset.building?.name : asset.building?.name,
                                            isRTL ? asset.floor?.name_ar || asset.floor?.name : asset.floor?.name,
                                            isRTL ? asset.room?.name_ar || asset.room?.name : asset.room?.name,
                                        ].filter(Boolean).join(' / ') || t('common.none')}
                                        icon={Building2}
                                    />
                                    <InfoLine label={t('assets.category')} value={asset.category?.name || t('common.none')} icon={FileText} />
                                    <InfoLine
                                        label={t('assets.criticality')}
                                        value={asset.criticality ? t(`assets.${asset.criticality}`) : t('common.none')}
                                        icon={ShieldAlert}
                                    />
                                    <InfoLine label={t('assets.model')} value={asset.model || t('common.none')} icon={Wrench} />
                                    <InfoLine label={t('assets.serialNumber')} value={asset.serial_number || t('common.none')} icon={ClipboardList} />
                                    <InfoLine label={t('assets.purchaseDate')} value={asset.purchase_date ? formatDate(asset.purchase_date, locale) : t('common.none')} icon={Calendar} />
                                    <InfoLine label={t('assets.warrantyExpiry')} value={asset.warranty_expiry ? formatDate(asset.warranty_expiry, locale) : t('common.none')} icon={CheckCircle2} />
                                </CardContent>
                            </Card>

                            {/* C. Preventive Maintenance — linked PM schedules */}
                            {canViewPm && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 font-cairo">
                                            <CalendarClock className="h-5 w-5 text-info" />
                                            {isRTL ? 'جداول الصيانة الوقائية' : 'Preventive Maintenance Schedules'}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {assetPMSchedules.length === 0 ? (
                                            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground font-cairo">
                                                {isRTL
                                                    ? 'لا توجد جداول صيانة وقائية مرتبطة بهذا الأصل.'
                                                    : 'No preventive maintenance schedules are linked to this asset.'}
                                            </p>
                                        ) : (
                                            <div className="space-y-3">
                                                {assetPMSchedules.map((schedule) => {
                                                    const freqLabel = schedule.frequency_type
                                                        ? (isRTL ? FREQUENCY_LABEL[schedule.frequency_type]?.ar : FREQUENCY_LABEL[schedule.frequency_type]?.en) ?? schedule.frequency_type
                                                        : null
                                                    const schedName = isRTL ? schedule.name_ar || schedule.name : schedule.name
                                                    return (
                                                        <div
                                                            key={schedule.id}
                                                            className="rounded-xl border bg-muted/5 px-4 py-3 space-y-2"
                                                        >
                                                            <div className="flex items-start justify-between gap-2 flex-wrap">
                                                                <div>
                                                                    <p className="font-medium font-cairo">{schedName}</p>
                                                                    {schedule.code && (
                                                                        <p className="text-xs font-mono text-muted-foreground">{schedule.code}</p>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    {freqLabel && (
                                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/20 font-cairo">
                                                                            {freqLabel}
                                                                        </span>
                                                                    )}
                                                                    <span className={cn(
                                                                        'text-xs px-2 py-0.5 rounded-full border font-cairo',
                                                                        schedule.status === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-muted/10 text-muted-foreground border-muted/20'
                                                                    )}>
                                                                        {schedule.status === 'active'
                                                                            ? (isRTL ? 'نشط' : 'Active')
                                                                            : (isRTL ? schedule.status : schedule.status)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground font-cairo">
                                                                {schedule.next_due_date && (
                                                                    <span>
                                                                        {isRTL ? 'الاستحقاق التالي: ' : 'Next due: '}
                                                                        <span className="font-medium text-foreground">{formatDate(schedule.next_due_date, locale)}</span>
                                                                    </span>
                                                                )}
                                                                {schedule.last_generated_date && (
                                                                    <span>
                                                                        {isRTL ? 'آخر تنفيذ: ' : 'Last run: '}
                                                                        <span className="font-medium text-foreground">{formatDate(schedule.last_generated_date, locale)}</span>
                                                                    </span>
                                                                )}
                                                                {typeof schedule.compliance_rate === 'number' && (
                                                                    <span>
                                                                        {isRTL ? 'الامتثال: ' : 'Compliance: '}
                                                                        <span className={cn(
                                                                            'font-medium',
                                                                            schedule.compliance_rate >= 80 ? 'text-success' : schedule.compliance_rate >= 50 ? 'text-warning' : 'text-destructive'
                                                                        )}>
                                                                            {schedule.compliance_rate.toFixed(0)}%
                                                                        </span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* B. Operational Memory / Work History */}
                            <Card>
                                <CardHeader className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                    <CardTitle className="font-cairo">{t('workOrders.title')}</CardTitle>
                                    <Button variant="outline" onClick={() => navigate('/work-orders')}>{t('common.view')}</Button>
                                </CardHeader>
                                <CardContent>
                                    {assetWorkOrders.length === 0 ? (
                                        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground font-cairo">
                                            {t('common.noData')}
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {assetWorkOrders.slice(0, 8).map((workOrder) => {
                                                const statusConf = STATUS_DISPLAY[workOrder.status as keyof typeof STATUS_DISPLAY] ?? STATUS_DISPLAY.pending
                                                const preventive = isPreventiveWorkOrder(workOrder)
                                                const overdue = isOverdueWorkOrder(workOrder.due_date, workOrder.status)
                                                return (
                                                    <button
                                                        key={workOrder.id}
                                                        type="button"
                                                        className={cn(
                                                            'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-start transition hover:border-primary/40 hover:bg-muted/20',
                                                            overdue && 'border-destructive/30 bg-destructive/5'
                                                        )}
                                                        onClick={() => navigate(`/work-orders/${workOrder.id}`)}
                                                    >
                                                        <div className="flex-1 min-w-0 space-y-1">
                                                            <p className="font-medium font-cairo truncate">{workOrder.title}</p>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className={cn(
                                                                    'px-2 py-0.5 rounded-full text-[10px] font-cairo font-medium border',
                                                                    statusConf.bg, statusConf.color, statusConf.borderColor
                                                                )}>
                                                                    {isRTL ? statusConf.labelAr : t(`workOrders.${statusConf.label}`)}
                                                                </span>
                                                                <span className={cn(
                                                                    'px-2 py-0.5 rounded-full text-[10px] font-cairo font-medium border',
                                                                    preventive ? 'text-info bg-info/10 border-info/20' : 'text-muted-foreground bg-muted/10 border-muted/20'
                                                                )}>
                                                                    {preventive ? (isRTL ? 'وقائي' : 'Preventive') : (isRTL ? 'تصحيحي' : 'Corrective')}
                                                                </span>
                                                                {overdue && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-cairo font-medium border text-destructive bg-destructive/10 border-destructive/20">
                                                                        {isRTL ? 'متأخر' : 'Overdue'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex-shrink-0 text-end space-y-1">
                                                            <p className="text-xs font-mono text-muted-foreground">{workOrder.code}</p>
                                                            <p className="text-xs text-muted-foreground">{formatDate(workOrder.created_at, locale)}</p>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-6">
                            <Card className="overflow-hidden">
                                <CardContent className="p-0">
                                    {asset.image_url ? (
                                        <img src={asset.image_url} alt={asset.name} className="aspect-square w-full object-cover" />
                                    ) : (
                                        <div className="flex aspect-square items-center justify-center bg-muted">
                                            <ImageIcon className="h-16 w-16 text-muted-foreground/40" />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {canViewPm ? (
                    <TabsContent value="pm" className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <PmStatCard title={t('pm.asset.total_pm_tasks')} value={stats.total_tasks} />
                            <PmStatCard title={t('pm.plans.completed_tasks')} value={stats.completed_tasks} />
                            <PmStatCard title={t('pm.asset.open_tasks')} value={stats.open_tasks} />
                            <PmStatCard title={t('pm.asset.next_due')} value={stats.next_due ? formatDate(stats.next_due, locale) : t('common.none')} />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                            <Card>
                                <CardHeader className="gap-4">
                                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                        <CardTitle className="font-cairo">{t('pm.asset.history')}</CardTitle>
                                        <div className="grid gap-3 md:grid-cols-2 xl:flex xl:flex-wrap">
                                            <Input
                                                value={historySearch}
                                                onChange={(event) => setHistorySearch(event.target.value)}
                                                placeholder={t('common.search')}
                                                className="xl:w-[240px]"
                                            />
                                            <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
                                                <SelectTrigger className="xl:w-[180px]">
                                                    <SelectValue placeholder={t('common.status')} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">{t('common.all')}</SelectItem>
                                                    <SelectItem value="pending">{t('pm.tasks.status.pending')}</SelectItem>
                                                    <SelectItem value="in_progress">{t('pm.tasks.status.in_progress')}</SelectItem>
                                                    <SelectItem value="completed">{t('pm.tasks.status.completed')}</SelectItem>
                                                    <SelectItem value="cancelled">{t('pm.tasks.status.cancelled')}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {historyLoading ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                        </div>
                                    ) : filteredHistory.length === 0 ? (
                                        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground font-cairo">
                                            {t('common.noData')}
                                        </p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead className="bg-muted/40">
                                                    <tr>
                                                        <HistoryCell>{t('common.date')}</HistoryCell>
                                                        <HistoryCell>{t('pm.tasks.title')}</HistoryCell>
                                                        <HistoryCell>{t('common.status')}</HistoryCell>
                                                        <HistoryCell>{t('pm.tasks.technician')}</HistoryCell>
                                                        <HistoryCell>{t('pm.plans.title')}</HistoryCell>
                                                        <HistoryCell>{t('pm.execution.reference')}</HistoryCell>
                                                        <HistoryCell>{t('workOrders.title')}</HistoryCell>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {filteredHistory.map((record) => (
                                                        <tr key={record.task_id} className="hover:bg-muted/20">
                                                            <HistoryBodyCell dir="ltr">{formatDate(record.completed_at || record.due_date || record.created_at, locale)}</HistoryBodyCell>
                                                            <HistoryBodyCell>{record.task_title}</HistoryBodyCell>
                                                            <HistoryBodyCell>
                                                                <Badge className={cn('border', getTaskStatusClass(record.task_status))}>
                                                                    {t(`pm.tasks.status.${record.task_status}`)}
                                                                </Badge>
                                                            </HistoryBodyCell>
                                                            <HistoryBodyCell>{record.technician_name || t('common.none')}</HistoryBodyCell>
                                                            <HistoryBodyCell>{record.plan_name || t('common.none')}</HistoryBodyCell>
                                                            <HistoryBodyCell>
                                                                <div className="space-y-1">
                                                                    <span className="font-mono text-xs">{record.execution_reference || t('common.none')}</span>
                                                                    {record.latest_pdf_exported_at ? (
                                                                        <Badge variant="outline">{t('pm.execution.pdf_exported')}</Badge>
                                                                    ) : null}
                                                                </div>
                                                            </HistoryBodyCell>
                                                            <HistoryBodyCell>
                                                                {record.related_work_order_id ? (
                                                                    <Button variant="link" className="px-0" onClick={() => navigate(`/work-orders/${record.related_work_order_id}`)}>
                                                                        {t('common.view')}
                                                                    </Button>
                                                                ) : (
                                                                    t('common.none')
                                                                )}
                                                            </HistoryBodyCell>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="font-cairo">{t('pm.asset.qr_code')}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div ref={qrWrapperRef} className="rounded-2xl border bg-white p-4">
                                        <QRCode value={qrValue} size={220} className="h-auto w-full" />
                                    </div>
                                    <div className="space-y-1 text-center">
                                        <p className="font-medium">{asset.name}</p>
                                        <p className="font-mono text-sm text-muted-foreground">{asset.code}</p>
                                        <p className="text-xs text-muted-foreground break-all">{qrValue}</p>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Button variant="outline" onClick={handlePrintQr}>
                                            <Printer className="me-2 h-4 w-4" />
                                            {t('pm.asset.print_qr')}
                                        </Button>
                                        <Button variant="outline" onClick={() => void handleDownloadQr()}>
                                            <Download className="me-2 h-4 w-4" />
                                            {t('pm.asset.download_qr')}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                ) : null}
            </Tabs>
        </div>
    )
}

function InfoLine({
    label,
    value,
    icon: Icon,
}: {
    label: string
    value: string
    icon: React.ElementType
}) {
    return (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Icon className="h-4 w-4" />
            </div>
            <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-cairo">{label}</p>
                <p className="font-medium">{value}</p>
            </div>
        </div>
    )
}

function PmStatCard({ title, value }: { title: string; value: string | number }) {
    return (
        <Card>
            <CardContent className="space-y-1 p-5">
                <p className="text-sm text-muted-foreground font-cairo">{title}</p>
                <p className="text-2xl font-bold" dir={typeof value === 'number' ? 'ltr' : undefined}>{value}</p>
            </CardContent>
        </Card>
    )
}

function HistoryCell({ children }: { children: React.ReactNode }) {
    return <th className="px-4 py-3 text-start font-semibold font-cairo">{children}</th>
}

function HistoryBodyCell({
    children,
    dir,
}: {
    children: React.ReactNode
    dir?: 'ltr' | 'rtl'
}) {
    return <td className="px-4 py-3 align-top" dir={dir}>{children}</td>
}
