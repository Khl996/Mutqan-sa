import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAsset, useUpdateAsset } from '@/hooks/useAssets'
import { useWorkOrders } from '@/hooks/useWorkOrders'
import {
    ArrowRight,
    ArrowLeft,
    Building2,
    MapPin,
    Calendar,
    Activity,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Archive,
    History,
    FileText,
    Wrench
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { toast } from 'sonner'

export default function AssetDetailsPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    const { data: asset, isLoading, error } = useAsset(id!)
    const updateAsset = useUpdateAsset()

    // Fetch related work orders
    const { data: allWorkOrders } = useWorkOrders()
    const assetWorkOrders = allWorkOrders?.filter(wo => wo.asset_id === id) || []

    const [isStatusChanging, setIsStatusChanging] = useState(false)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (error || !asset) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">{isRTL ? 'الأصل غير موجود' : 'Asset Not Found'}</h2>
                <button
                    onClick={() => navigate('/assets')}
                    className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                    {isRTL ? 'العودة للأصول' : 'Back to Assets'}
                </button>
            </div>
        )
    }

    const handleStatusChange = async (newStatus: 'operational' | 'under_maintenance' | 'out_of_service' | 'retired') => {
        if (newStatus === asset.status) return

        if (!confirm(isRTL ? 'هل أنت متأكد من تغيير حالة الأصل؟' : 'Are you sure you want to change asset status?')) return

        try {
            setIsStatusChanging(true)
            await updateAsset.mutateAsync({ id: asset.id, status: newStatus })
            toast.success(isRTL ? 'تم تحديث الحالة بنجاح' : 'Status updated successfully')
        } catch (error) {
            console.error(error)
            toast.error(isRTL ? 'فشل تحديث الحالة' : 'Failed to update status')
        } finally {
            setIsStatusChanging(false)
        }
    }

    const StatusButton = ({ status, icon: Icon, label, colorClass }: any) => (
        <button
            onClick={() => handleStatusChange(status)}
            disabled={isStatusChanging}
            className={cn(
                "flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all font-cairo",
                asset.status === status
                    ? `bg-${colorClass}-50 border-${colorClass}-500 text-${colorClass}-700 ring-2 ring-${colorClass}-200`
                    : "bg-card border-transparent hover:bg-muted/50 text-muted-foreground hover:border-border"
            )}
        >
            <div className={cn(
                "p-3 rounded-full",
                asset.status === status ? `bg-${colorClass}-200` : "bg-muted"
            )}>
                <Icon className={cn("w-6 h-6", asset.status === status && `text-${colorClass}-700`)} />
            </div>
            <span className="font-bold text-sm">{label}</span>
        </button>
    )

    return (
        <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => navigate('/assets')}
                    className="p-2 hover:bg-muted rounded-full transition-colors"
                >
                    {isRTL ? <ArrowRight className="w-6 h-6" /> : <ArrowLeft className="w-6 h-6" />}
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold font-cairo text-primary">{asset.name}</h1>
                        <span className="bg-muted px-2 py-1 rounded text-sm font-mono">{asset.code}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column (Details) */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Status Control Panel */}
                    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                        <h3 className="text-lg font-bold font-cairo mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            {isRTL ? 'حالة الأصل التشغيلية' : 'Operational Status'}
                        </h3>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <StatusButton
                                status="operational"
                                icon={CheckCircle2}
                                label={isRTL ? 'بالخدمة' : 'Operational'}
                                colorClass="green"
                            />
                            <StatusButton
                                status="under_maintenance"
                                icon={Wrench}
                                label={isRTL ? 'تحت الصيانة' : 'Maintenance'}
                                colorClass="yellow"
                            />
                            <StatusButton
                                status="out_of_service"
                                icon={XCircle}
                                label={isRTL ? 'خارج الخدمة' : 'Out of Service'}
                                colorClass="red"
                            />
                            <StatusButton
                                status="retired"
                                icon={Archive}
                                label={isRTL ? 'تالف / مكهن' : 'Retired'}
                                colorClass="gray"
                            />
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border space-y-6">
                        <h3 className="text-lg font-bold font-cairo border-b pb-2">
                            {isRTL ? 'تفاصيل الأصل' : 'Asset Details'}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <InfoItem
                                label={isRTL ? 'الموقع' : 'Location'}
                                value={asset.building?.name || '-'}
                                subValue={asset.room?.name}
                                icon={Building2}
                            />
                            <InfoItem
                                label={isRTL ? 'التصنيف' : 'Category'}
                                value={asset.category?.name || '-'}
                                icon={FileText}
                            />
                            <InfoItem
                                label={isRTL ? 'تاريخ الشراء' : 'Purchase Date'}
                                value={asset.purchase_date ? formatDate(asset.purchase_date) : '-'}
                                icon={Calendar}
                            />
                            <InfoItem
                                label={isRTL ? 'انتهاء الضمان' : 'Warranty Expiry'}
                                value={asset.warranty_expiry ? formatDate(asset.warranty_expiry) : '-'}
                                icon={CheckCircle2}
                            />
                        </div>

                        {asset.description && (
                            <div className="bg-muted/10 p-4 rounded-xl">
                                <p className="text-sm text-foreground/80 font-cairo">{asset.description}</p>
                            </div>
                        )}
                    </div>

                    {/* Work Orders History */}
                    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold font-cairo flex items-center gap-2">
                                <History className="w-5 h-5 text-primary" />
                                {isRTL ? 'سجل الصيانة والبلاغات' : 'Maintenance History'}
                            </h3>
                            <button
                                onClick={() => navigate('/work-orders')}
                                className="text-sm text-primary hover:underline font-cairo"
                            >
                                {isRTL ? 'عرض الكل' : 'View All'}
                            </button>
                        </div>

                        {assetWorkOrders.length > 0 ? (
                            <div className="space-y-3">
                                {assetWorkOrders.slice(0, 5).map(wo => (
                                    <div key={wo.id} onClick={() => navigate(`/work-orders/${wo.id}`)} className="flex items-center justify-between p-3 bg-muted/5 hover:bg-muted/10 rounded-lg cursor-pointer transition-colors border">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full",
                                                wo.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'
                                            )} />
                                            <div>
                                                <p className="font-bold text-sm text-primary font-cairo">{wo.title}</p>
                                                <p className="text-xs text-muted-foreground">{formatDate(wo.created_at)}</p>
                                            </div>
                                        </div>
                                        <div className="text-xs font-mono bg-background px-2 py-1 rounded border">
                                            {wo.code}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8 font-cairo">
                                {isRTL ? 'لا توجد بلاغات سابقة لهذا الأصل' : 'No maintenance history found'}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right Column (Image & Quick Stats) */}
                <div className="space-y-6">
                    {/* Asset Image */}
                    <div className="bg-card rounded-2xl overflow-hidden shadow-sm border border-border aspect-square relative group">
                        {asset.image_url ? (
                            <img src={asset.image_url} alt={asset.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                                <FileText className="w-20 h-20 text-muted-foreground/30" />
                            </div>
                        )}
                    </div>

                    {/* QR Code Placeholder */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-border text-center">
                        <div className="w-32 h-32 bg-black mx-auto mb-4 opacity-10" /> {/* Placeholder for real QR code */}
                        <p className="font-mono text-sm text-muted-foreground">{asset.barcode || 'NO-BARCODE'}</p>
                        <button className="mt-2 text-sm text-primary hover:underline font-cairo">
                            {isRTL ? 'طباعة الملصق' : 'Print Label'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function InfoItem({ label, value, subValue, icon: Icon }: any) {
    return (
        <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/5 rounded-lg text-primary mt-1">
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-sm text-muted-foreground font-cairo">{label}</p>
                <p className="font-bold text-primary font-cairo text-lg">{value}</p>
                {subValue && <p className="text-sm text-muted-foreground font-cairo">{subValue}</p>}
            </div>
        </div>
    )
}
