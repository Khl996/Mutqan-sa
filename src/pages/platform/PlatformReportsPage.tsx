import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
    BarChart3, FileText, Download, Building2, TrendingUp,
    Users, DollarSign, Activity, PieChart, ArrowRight, ArrowLeft,
} from 'lucide-react'

const reportTypes = [
    { id: 'revenue', name: { ar: 'تقرير الإيرادات', en: 'Revenue Report' }, icon: DollarSign, color: 'bg-green-500/10 text-green-500' },
    { id: 'tenants', name: { ar: 'تقرير المنشآت', en: 'Tenants Report' }, icon: Building2, color: 'bg-blue-500/10 text-blue-500' },
    { id: 'subscriptions', name: { ar: 'تقرير الاشتراكات', en: 'Subscriptions Report' }, icon: TrendingUp, color: 'bg-purple-500/10 text-purple-500' },
    { id: 'users', name: { ar: 'تقرير المستخدمين', en: 'Users Report' }, icon: Users, color: 'bg-amber-500/10 text-amber-500' },
    { id: 'activity', name: { ar: 'تقرير النشاط', en: 'Activity Report' }, icon: Activity, color: 'bg-slate-500/10 text-slate-500' },
    { id: 'performance', name: { ar: 'تقرير الأداء', en: 'Performance Report' }, icon: BarChart3, color: 'bg-rose-500/10 text-rose-500' },
]

const recentReports = [
    { id: 1, name: 'تقرير الإيرادات - يناير 2026', name_en: 'Revenue Report - Jan 2026', type: 'revenue', date: '2026-01-15', size: '2.4 MB' },
    { id: 2, name: 'تقرير المنشآت النشطة', name_en: 'Active Tenants Report', type: 'tenants', date: '2026-01-14', size: '1.8 MB' },
    { id: 3, name: 'تقرير الاشتراكات الشهري', name_en: 'Monthly Subscriptions', type: 'subscriptions', date: '2026-01-10', size: '890 KB' },
    { id: 4, name: 'تقرير نشاط المستخدمين', name_en: 'User Activity Report', type: 'activity', date: '2026-01-08', size: '3.2 MB' },
]

export default function PlatformReportsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [selectedPeriod, setSelectedPeriod] = useState('month')
    const ArrowIcon = isRTL ? ArrowLeft : ArrowRight

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
                        <BarChart3 className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-primary font-cairo">{isRTL ? 'تقارير المنصة' : 'Platform Reports'}</h1>
                        <p className="text-muted-foreground font-cairo">{isRTL ? 'إنشاء وتصدير التقارير' : 'Generate and export reports'}</p>
                    </div>
                </div>
                <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}
                    className="px-4 py-2.5 bg-card border rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo">
                    <option value="week">{isRTL ? 'هذا الأسبوع' : 'This Week'}</option>
                    <option value="month">{isRTL ? 'هذا الشهر' : 'This Month'}</option>
                    <option value="quarter">{isRTL ? 'هذا الربع' : 'This Quarter'}</option>
                    <option value="year">{isRTL ? 'هذا العام' : 'This Year'}</option>
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reportTypes.map(report => (
                    <button key={report.id} className="group bg-card border rounded-xl p-5 hover:shadow-lg transition-all text-start">
                        <div className="flex items-start justify-between">
                            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', report.color)}>
                                <report.icon className="w-6 h-6" />
                            </div>
                            <ArrowIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <h3 className="text-primary font-semibold mt-4 font-cairo">{isRTL ? report.name.ar : report.name.en}</h3>
                        <p className="text-muted-foreground text-sm mt-1 font-cairo">{isRTL ? 'انقر لإنشاء التقرير' : 'Click to generate'}</p>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-card border rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-primary font-cairo mb-4 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-secondary" />
                        {isRTL ? 'توزيع التقارير' : 'Reports Distribution'}
                    </h3>
                    <div className="space-y-4">
                        {reportTypes.slice(0, 4).map((report, idx) => {
                            const counts = [35, 28, 22, 15]
                            return (
                                <div key={report.id}>
                                    <div className="flex items-center justify-between text-sm mb-1">
                                        <span className="text-primary font-cairo">{isRTL ? report.name.ar : report.name.en}</span>
                                        <span className="text-muted-foreground">{counts[idx]}%</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div className={cn('h-full rounded-full', report.color.split(' ')[1].replace('text-', 'bg-'))} style={{ width: `${counts[idx]}%` }} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="bg-card border rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-primary font-cairo mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-secondary" />
                        {isRTL ? 'التقارير الأخيرة' : 'Recent Reports'}
                    </h3>
                    <div className="space-y-3">
                        {recentReports.map(report => (
                            <div key={report.id} className="flex items-center justify-between p-3 bg-muted/5 rounded-lg hover:bg-muted/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                                        <FileText className="w-5 h-5 text-secondary" />
                                    </div>
                                    <div>
                                        <p className="font-medium font-cairo text-sm">{isRTL ? report.name : report.name_en}</p>
                                        <p className="text-muted-foreground text-xs">{report.date} • {report.size}</p>
                                    </div>
                                </div>
                                <button className="p-2 hover:bg-muted/20 rounded-lg transition-colors text-muted-foreground hover:text-primary">
                                    <Download className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-primary font-cairo mb-4">{isRTL ? 'إنشاء تقرير مخصص' : 'Generate Custom Report'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-muted-foreground text-sm font-cairo block mb-2">{isRTL ? 'نوع التقرير' : 'Report Type'}</label>
                        <select className="w-full px-4 py-2.5 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo">
                            {reportTypes.map(r => <option key={r.id} value={r.id}>{isRTL ? r.name.ar : r.name.en}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-muted-foreground text-sm font-cairo block mb-2">{isRTL ? 'من تاريخ' : 'From Date'}</label>
                        <input type="date" className="w-full px-4 py-2.5 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20" />
                    </div>
                    <div>
                        <label className="text-muted-foreground text-sm font-cairo block mb-2">{isRTL ? 'إلى تاريخ' : 'To Date'}</label>
                        <input type="date" className="w-full px-4 py-2.5 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/20" />
                    </div>
                </div>
                <button className="mt-4 flex items-center gap-2 px-6 py-2.5 bg-secondary text-white rounded-xl hover:bg-secondary/90 transition-all font-cairo">
                    <BarChart3 className="w-5 h-5" />
                    {isRTL ? 'إنشاء التقرير' : 'Generate Report'}
                </button>
            </div>
        </div>
    )
}
