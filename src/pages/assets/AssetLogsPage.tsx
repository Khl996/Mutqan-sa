import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAssetLogs } from '@/hooks/useAssetOperations'
import { useTenantModules } from '@/hooks/useTenantModules'
import { isFeatureEnabled } from '@/config/modules'
import { format } from 'date-fns'
import {
    History,
    Search,
    Filter,
    User,
    Calendar,
    Clock,
    Box,
    ArrowRight,
    CheckCircle2,
    XCircle,
    Wrench,
    Power,
    Ban
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function AssetLogsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { data: tenantModules, isLoading: isModulesLoading } = useTenantModules()
    const { data: logs, isLoading } = useAssetLogs()
    const hasAssetHistoryAccess = isFeatureEnabled(tenantModules, 'assets', 'asset_history')

    const [searchQuery, setSearchQuery] = useState('')

    // Filter logs
    const filteredLogs = logs?.filter(log => {
        const matchesSearch =
            log.asset?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.performer?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.action_type.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesSearch
    }) || []

    const formatActionType = (type: string) => {
        const types: Record<string, string> = {
            'status_change': isRTL ? 'تغيير حالة' : 'Status Change',
            'create': isRTL ? 'إضافة' : 'Create',
            'edit': isRTL ? 'تعديل' : 'Edit',
            'delete': isRTL ? 'حذف' : 'Delete',
        }
        return types[type] || type
    }

    const formatStatus = (status: string | null) => {
        if (!status) return isRTL ? 'غير معروف' : 'Unknown'
        const statuses: Record<string, string> = {
            'operational': isRTL ? 'يعمل' : 'Operational',
            'out_of_service': isRTL ? 'خارج الخدمة' : 'Out of Service',
            'under_maintenance': isRTL ? 'تحت الصيانة' : 'Under Maintenance',
            'retired': isRTL ? 'متقاعد / تالف' : 'Retired',
        }
        return statuses[status] || status
    }

    const StatusIcon = ({ status }: { status: string | null }) => {
        if (!status) return <div className="w-2 h-2 rounded-full bg-muted-foreground" />
        switch (status) {
            case 'operational': return <CheckCircle2 className="w-4 h-4 text-success" />
            case 'out_of_service': return <XCircle className="w-4 h-4 text-destructive" />
            case 'under_maintenance': return <Wrench className="w-4 h-4 text-warning" />
            case 'retired': return <Ban className="w-4 h-4 text-muted-foreground" />
            default: return <div className="w-2 h-2 rounded-full bg-muted-foreground" />
        }
    }

    if (isModulesLoading || isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!hasAssetHistoryAccess) {
        return <Navigate to="/assets" replace />
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo">
                        {isRTL ? 'سجل الإجراءات' : 'Activity Logs'}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL
                            ? 'تتبع جميع العمليات والإجراءات التي تمت على الأصول'
                            : 'Track all operations and actions performed on assets'
                        }
                    </p>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className={cn(
                        'absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted',
                        isRTL ? 'right-3' : 'left-3'
                    )} />
                    <input
                        type="text"
                        placeholder={isRTL ? 'بحث باسم الأصل، الموكل، أو نوع الإجراء...' : 'Search by asset, user, or action...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cn(
                            'w-full py-2 bg-card border border-border rounded-lg focus:ring-1 focus:ring-secondary/20 focus:border-secondary outline-none font-cairo text-sm',
                            isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'
                        )}
                    />
                </div>
                <button className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-muted-foreground hover:text-primary transition-colors">
                    <Filter className="w-4 h-4" />
                    <span className="text-sm font-cairo">{isRTL ? 'تصفية' : 'Filter'}</span>
                </button>
            </div>

            {/* Logs List - Timeline Style */}
            <div className="relative space-y-4">
                {/* Vertical Line */}
                <div className={cn(
                    "absolute top-0 bottom-0  w-px bg-border",
                    isRTL ? "right-6" : "left-6"
                )} />

                {filteredLogs.length === 0 ? (
                    <div className="text-center py-12 text-muted">
                        <History className="w-12 h-12 mx-auto mb-3 text-muted/30" />
                        <p className="font-cairo">{isRTL ? 'لا توجد سجلات لعرضها' : 'No logs to display'}</p>
                    </div>
                ) : (
                    filteredLogs.map((log) => (
                        <div key={log.id} className="relative flex gap-6 group">
                            {/* Icon Bubble */}
                            <div className={cn(
                                "relative z-10 flex-shrink-0 w-12 h-12 rounded-full border-4 border-background flex items-center justify-center shadow-sm",
                                log.action_type === 'status_change' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                            )}>
                                {log.action_type === 'status_change' ? <Power className="w-5 h-5" /> : <Box className="w-5 h-5" />}
                            </div>

                            {/* Content Card */}
                            <div className="flex-1 bg-card border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-primary font-cairo">
                                            {formatActionType(log.action_type)}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground font-cairo" title={log.asset_id}>
                                            {log.asset?.name || (isRTL ? `أصل #${log.asset_id.slice(0, 8)}` : `Asset #${log.asset_id.slice(0, 8)}`)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted font-inter">
                                        <Calendar className="w-3 h-3" />
                                        <span>{format(new Date(log.created_at), 'dd/MM/yyyy')}</span>
                                        <Clock className="w-3 h-3 ml-2 rtl:mr-2 rtl:ml-0" />
                                        <span>{format(new Date(log.created_at), 'HH:mm')}</span>
                                    </div>
                                </div>

                                {/* Status Change Detail */}
                                {log.action_type === 'status_change' && (
                                    <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg mb-3">
                                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                            <StatusIcon status={log.previous_status} />
                                            <span className="font-cairo">{formatStatus(log.previous_status)}</span>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-muted rtl:rotate-180" />
                                        <div className="flex items-center gap-1.5 text-sm font-medium">
                                            <StatusIcon status={log.new_status} />
                                            <span className="font-cairo">{formatStatus(log.new_status)}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Notes */}
                                {log.notes && (
                                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 p-3 rounded-lg mb-3">
                                        <p className="text-sm text-amber-900 dark:text-amber-100 font-cairo leading-relaxed">
                                            "{log.notes}"
                                        </p>
                                    </div>
                                )}

                                {/* Footer: User */}
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dashed border-muted/50">
                                    <User className="w-3 h-3 text-muted" />
                                    <span className="text-xs text-muted font-cairo">
                                        {isRTL ? 'بواسطة:' : 'By:'} {log.performer?.full_name || (isRTL ? `مستخدم #${log.performed_by?.slice(0, 8) || '?'}` : `User #${log.performed_by?.slice(0, 8) || '?'}`)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
