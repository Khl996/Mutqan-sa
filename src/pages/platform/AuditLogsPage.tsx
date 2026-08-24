import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuditLogs, useAuditLogStats } from '@/hooks/usePlatformManagement'
import {
    Activity, Search, Download, Calendar, Building2, Shield, Settings,
    AlertTriangle, CheckCircle2, Eye, Clock, Loader2, FileText,
} from 'lucide-react'

const typeConfig = {
    auth: { label: { ar: 'مصادقة', en: 'Auth' }, color: 'bg-info/10 text-info', icon: Shield },
    create: { label: { ar: 'إنشاء', en: 'Create' }, color: 'bg-success/10 text-success', icon: CheckCircle2 },
    update: { label: { ar: 'تحديث', en: 'Update' }, color: 'bg-warning/10 text-warning', icon: Settings },
    delete: { label: { ar: 'حذف', en: 'Delete' }, color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
    read: { label: { ar: 'قراءة', en: 'Read' }, color: 'bg-muted/20 text-muted-foreground', icon: Eye },
    export: { label: { ar: 'تصدير', en: 'Export' }, color: 'bg-secondary/10 text-secondary', icon: FileText },
    import: { label: { ar: 'استيراد', en: 'Import' }, color: 'bg-secondary/10 text-secondary', icon: FileText },
    config: { label: { ar: 'إعدادات', en: 'Config' }, color: 'bg-info/10 text-info', icon: Settings },
    warning: { label: { ar: 'تحذير', en: 'Warning' }, color: 'bg-warning/10 text-warning', icon: AlertTriangle },
    error: { label: { ar: 'خطأ', en: 'Error' }, color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
}

export default function AuditLogsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedType, setSelectedType] = useState('all')

    // Fetch data from database
    const { data: logs, isLoading } = useAuditLogs({ actionType: selectedType !== 'all' ? selectedType : undefined, limit: 100 })
    const { data: stats } = useAuditLogStats()

    const filteredLogs = (logs || []).filter(log => {
        const matchesSearch = log.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.target_name?.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesSearch
    })

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
                        <Activity className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-primary font-cairo">{isRTL ? 'سجلات النظام' : 'Audit Logs'}</h1>
                        <p className="text-muted-foreground font-cairo">{isRTL ? 'تتبع جميع العمليات والأحداث' : 'Track all operations and events'}</p>
                    </div>
                </div>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-primary font-cairo hover:bg-muted/10 transition-colors">
                    <Download className="w-5 h-5 text-muted-foreground" />
                    {isRTL ? 'تصدير' : 'Export'}
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title={isRTL ? 'إجمالي السجلات' : 'Total Logs'} value={stats?.total || 0} icon={Activity} color="info" />
                <StatCard title={isRTL ? 'اليوم' : 'Today'} value={stats?.today || 0} icon={Calendar} color="success" />
                <StatCard title={isRTL ? 'إنشاء' : 'Creates'} value={stats?.byType?.create || 0} icon={CheckCircle2} color="warning" />
                <StatCard title={isRTL ? 'تحديث' : 'Updates'} value={stats?.byType?.update || 0} icon={Settings} color="destructive" />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input type="text" placeholder={isRTL ? 'بحث...' : 'Search...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full ps-10 pe-4 py-2.5 bg-card border rounded-xl placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo" />
                </div>
                <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
                    className="px-4 py-2.5 bg-card border rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo">
                    <option value="all">{isRTL ? 'جميع الأنواع' : 'All Types'}</option>
                    {Object.entries(typeConfig).map(([key, cfg]) => (
                        <option key={key} value={key}>{isRTL ? cfg.label.ar : cfg.label.en}</option>
                    ))}
                </select>
            </div>

            {/* Logs Table */}
            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                {isLoading ? (
                    <div className="p-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-secondary mx-auto" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b bg-muted/5">
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'الوقت' : 'Time'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'المستخدم' : 'User'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'الإجراء' : 'Action'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'الهدف' : 'Target'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">{isRTL ? 'النوع' : 'Type'}</th>
                                    <th className="text-start p-4 text-muted-foreground font-cairo">IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.map(log => {
                                    const type = typeConfig[log.action_type as keyof typeof typeConfig] || typeConfig.read
                                    const TypeIcon = type.icon
                                    return (
                                        <tr key={log.id} className="border-b last:border-0 hover:bg-muted/5 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                                    <Clock className="w-4 h-4" />
                                                    {new Date(log.created_at).toLocaleString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary text-sm font-bold">
                                                        {(log.user_name || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <span className="text-primary font-cairo block">{log.user_name || 'Unknown'}</span>
                                                        <span className="text-muted-foreground text-xs">{log.user_email}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-primary font-cairo">{log.action}</td>
                                            <td className="p-4">
                                                {log.target_name ? (
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <Building2 className="w-4 h-4" />
                                                        {log.target_name}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground/50">-</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', type.color)}>
                                                    <TypeIcon className="w-3 h-3" />
                                                    {isRTL ? type.label.ar : type.label.en}
                                                </span>
                                            </td>
                                            <td className="p-4 text-muted-foreground font-mono text-sm">{log.ip_address || '-'}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {!isLoading && filteredLogs.length === 0 && (
                    <div className="p-12 text-center">
                        <Activity className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground font-cairo">{isRTL ? 'لا توجد سجلات' : 'No logs found'}</p>
                        <p className="text-muted-foreground/80 text-sm mt-2">{isRTL ? 'ستظهر السجلات عند تنفيذ العمليات' : 'Logs will appear when actions are performed'}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: React.ElementType; color: 'info' | 'success' | 'warning' | 'destructive' }) {
    const colorClasses: Record<string, string> = {
        info: 'bg-info/10 text-info',
        success: 'bg-success/10 text-success',
        destructive: 'bg-destructive/10 text-destructive',
        warning: 'bg-warning/10 text-warning',
    }
    return (
        <div className="bg-card rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-3">
                <div className={cn("p-3 rounded-lg", colorClasses[color] || colorClasses.info)}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-primary font-inter">{value}</p>
                    <p className="text-xs text-muted-foreground font-cairo">{title}</p>
                </div>
            </div>
        </div>
    )
}
