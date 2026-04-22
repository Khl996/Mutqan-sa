import { useTranslation } from 'react-i18next'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'

interface ChartData {
    date: string
    created: number
    completed: number
}

interface WorkOrderChartProps {
    data: ChartData[]
}

export function WorkOrderChart({ data }: WorkOrderChartProps) {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    return (
        <div className="h-full rounded-lg border bg-card p-5 shadow-card sm:p-6">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-primary font-cairo">
                    {isRTL ? 'حركة أوامر العمل خلال 7 أيام' : 'Work Orders Activity, Last 7 Days'}
                </h3>
            </div>

            <div className="h-[300px] w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{
                            top: 5,
                            right: 30,
                            left: 20,
                            bottom: 5,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis
                            dataKey="date"
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip
                            cursor={{ fill: '#f3f4f6' }}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar
                            name={isRTL ? 'تم إنشاؤها' : 'Created'}
                            dataKey="created"
                            fill="#0d466c"
                            radius={[4, 4, 0, 0]}
                            barSize={30}
                        />
                        <Bar
                            name={isRTL ? 'تم إنجازها' : 'Completed'}
                            dataKey="completed"
                            fill="#1e7a3e"
                            radius={[4, 4, 0, 0]}
                            barSize={30}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
