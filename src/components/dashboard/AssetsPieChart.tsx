import { useTranslation } from 'react-i18next'
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'

interface AssetsData {
    active: number
    underMaintenance: number
    outOfService: number
}

interface AssetsPieChartProps {
    data: AssetsData
}

export function AssetsPieChart({ data }: AssetsPieChartProps) {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    const chartData = [
        { name: isRTL ? 'نشط' : 'Active', value: data.active, color: '#1e7a3e' },
        { name: isRTL ? 'تحت الصيانة' : 'Maintenance', value: data.underMaintenance, color: '#f59e0b' },
        { name: isRTL ? 'خارج الخدمة' : 'Out of Service', value: data.outOfService, color: '#ef4444' },
    ].filter(item => item.value > 0)

    return (
        <div className="h-full rounded-lg border bg-card p-5 shadow-card sm:p-6">
            <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-bold text-primary font-cairo">
                    {isRTL ? 'توزيع جاهزية الأصول' : 'Asset Readiness Distribution'}
                </h3>
            </div>

            <div className="h-[300px] w-full relative" dir="ltr">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 0, right: 0, bottom: 20, left: 0 }}>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="40%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend
                                layout="horizontal"
                                verticalAlign="bottom"
                                align="center"
                                wrapperStyle={{ paddingTop: '20px', fontFamily: 'Cairo', fontSize: '13px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted font-cairo">
                        {isRTL ? 'لا توجد بيانات' : 'No data available'}
                    </div>
                )}

                {/* Center Text */}
                {chartData.length > 0 && (
                    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                        <span className="text-3xl font-bold text-primary">
                            {data.active + data.underMaintenance + data.outOfService}
                        </span>
                        <p className="text-xs text-muted font-cairo">{isRTL ? 'الإجمالي' : 'Total'}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
