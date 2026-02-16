import { forwardRef } from 'react'
import { WorkOrder, OperationLog } from '@/hooks/useWorkOrders'
import { format } from 'date-fns'

interface WorkOrderPrintViewProps {
    workOrder: WorkOrder
    logs: OperationLog[]
}

const WorkOrderPrintView = forwardRef<HTMLDivElement, WorkOrderPrintViewProps>(({ workOrder, logs }, ref) => {

    const formatDate = (date: string | null | undefined) => {
        if (!date) return '-'
        return format(new Date(date), 'yyyy-MM-dd HH:mm')
    }

    return (
        <div ref={ref} className="p-8 bg-white text-black font-cairo min-h-screen" style={{ direction: 'rtl' }}>
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-gray-800 pb-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold mb-2">تقرير أمر عمل</h1>
                    <div className="text-lg text-gray-600 bg-gray-100 px-3 py-1 rounded inline-block">
                        #{workOrder.code}
                    </div>
                </div>
                <div className="text-left">
                    <h2 className="text-2xl font-bold text-primary">نظام متقن</h2>
                    <p className="text-sm text-gray-500 mt-1">تاريخ الطباعة: {format(new Date(), 'yyyy-MM-dd HH:mm')}</p>
                </div>
            </div>

            {/* Main Info Grid */}
            <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4">بيانات البلاغ</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500 w-32">العنوان</td>
                                <td className="py-2 font-bold">{workOrder.title}</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500">الحالة</td>
                                <td className="py-2 font-bold">{workOrder.status}</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500">التصنيف</td>
                                <td className="py-2">{workOrder.issue_type || '-'}</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500">الأولوية</td>
                                <td className="py-2">{workOrder.priority}</td>
                            </tr>
                            <tr>
                                <td className="py-2 text-gray-500">تاريخ البلاغ</td>
                                <td className="py-2">{formatDate(workOrder.reported_at)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div>
                    <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4">الموقع والأصل</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500 w-32">المبنى</td>
                                <td className="py-2 font-bold">{workOrder.building?.name_ar || workOrder.building?.name || '-'}</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500">الأصل</td>
                                <td className="py-2 font-bold">{workOrder.asset?.name_ar || workOrder.asset?.name || '-'}</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500">كود الأصل</td>
                                <td className="py-2 font-mono">{workOrder.asset?.code || '-'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4 mt-6">فريق العمل</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500 w-32">المبلغ</td>
                                <td className="py-2">{workOrder.reporter?.full_name_ar || workOrder.reporter?.full_name}</td>
                            </tr>
                            <tr>
                                <td className="py-2 text-gray-500">الفني المسؤول</td>
                                <td className="py-2 font-bold">{workOrder.assignee?.full_name_ar || workOrder.assignee?.full_name || 'غير معين'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Description */}
            <div className="mb-8 p-4 bg-gray-50 rounded border border-gray-200">
                <h3 className="font-bold mb-2 text-gray-700">وصف المشكلة:</h3>
                <p className="text-gray-900 whitespace-pre-wrap text-sm leading-relaxed">
                    {workOrder.description || 'لا يوجد وصف'}
                </p>
            </div>

            {/* Logs Section */}
            <div className="mb-8">
                <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-4">سجل العمليات والنشاطات</h3>
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-gray-100 border-b border-gray-300 text-right">
                            <th className="p-2 border border-gray-200 text-right">التاريخ</th>
                            <th className="p-2 border border-gray-200 text-right">العملية</th>
                            <th className="p-2 border border-gray-200 text-right">المسؤول</th>
                            <th className="p-2 border border-gray-200 text-right">الملاحظات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs?.map((log, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="p-2 border border-gray-200 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                                <td className="p-2 border border-gray-200 font-bold">{log.type}</td>
                                <td className="p-2 border border-gray-200">{log.performer?.full_name_ar || log.performer?.full_name || log.technician_name}</td>
                                <td className="p-2 border border-gray-200">{log.description}</td>
                            </tr>
                        ))}
                        {(!logs || logs.length === 0) && (
                            <tr>
                                <td colSpan={4} className="p-4 text-center text-gray-500">لا توجد سجلات</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer Signatures */}
            <div className="mt-16 grid grid-cols-3 gap-8 text-center text-sm">
                <div>
                    <p className="font-bold mb-12">توقيع الفني</p>
                    <div className="border-t border-gray-300 w-3/4 mx-auto"></div>
                </div>
                <div>
                    <p className="font-bold mb-12">توقيع المشرف</p>
                    <div className="border-t border-gray-300 w-3/4 mx-auto"></div>
                </div>
                <div>
                    <p className="font-bold mb-12">توقيع المستلم/العميل</p>
                    <div className="border-t border-gray-300 w-3/4 mx-auto"></div>
                </div>
            </div>

            {/* Barcode/Footer */}
            <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
                تم انشاء هذا التقرير آلياً بواسطة نظام متقن لإدارة الأصول والمرافق
            </div>
        </div>
    )
})

WorkOrderPrintView.displayName = 'WorkOrderPrintView'
export default WorkOrderPrintView
