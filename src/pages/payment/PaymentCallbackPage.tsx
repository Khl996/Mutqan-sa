import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { usePayment } from '@/hooks/usePayment'
import { useTenant } from '@/contexts/TenantContext'

type PaymentStatus = 'loading' | 'success' | 'failed'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default function PaymentCallbackPage() {
    const [searchParams] = useSearchParams()
    const { verifyPayment } = usePayment()
    const { refreshTenant } = useTenant()

    const [status, setStatus] = useState<PaymentStatus>('loading')
    const [message, setMessage] = useState('')

    useEffect(() => {
        const tapId = searchParams.get('tap_id')

        if (!tapId) {
            setStatus('failed')
            setMessage('لم يتم العثور على معرف عملية الدفع.')
            return
        }

        let isMounted = true

        const verify = async () => {
            const result = await verifyPayment(tapId)
            if (!isMounted) return

            if (result.success) {
                for (let attempt = 0; attempt < 4; attempt++) {
                    await refreshTenant()

                    if (attempt < 3) {
                        await wait(750)
                    }
                }

                if (!isMounted) return

                setStatus('success')
                setMessage('تم تفعيل اشتراكك بنجاح، ويمكنك المتابعة إلى لوحة التحكم الآن.')
                return
            }

            setStatus('failed')
            setMessage(
                result.status === 'CANCELLED'
                    ? 'تم إلغاء عملية الدفع.'
                    : result.message || 'تعذر التحقق من عملية الدفع. حاول مرة أخرى أو تواصل مع الدعم.'
            )
        }

        void verify()

        return () => {
            isMounted = false
        }
    }, [refreshTenant, searchParams, verifyPayment])

    return (
        <div className="min-h-screen bg-slate-50 font-cairo flex items-center justify-center" dir="rtl">
            <div className="max-w-md w-full mx-4">
                <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 text-center space-y-6">
                    {status === 'loading' && (
                        <>
                            <div className="flex justify-center">
                                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
                                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">جارٍ التحقق من عملية الدفع...</h2>
                                <p className="text-slate-500 mt-2">نحدّث حالة الاشتراك ونزامن بيانات المنشأة قبل تحويلك للوحة التحكم.</p>
                            </div>
                        </>
                    )}

                    {status === 'success' && (
                        <>
                            <div className="flex justify-center">
                                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">تم الدفع بنجاح</h2>
                                <p className="text-slate-500 mt-2">{message}</p>
                            </div>
                            <Link
                                to="/dashboard"
                                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-colors"
                            >
                                الانتقال إلى لوحة التحكم
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </>
                    )}

                    {status === 'failed' && (
                        <>
                            <div className="flex justify-center">
                                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
                                    <XCircle className="w-10 h-10 text-red-600" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">تعذر إتمام العملية</h2>
                                <p className="text-slate-500 mt-2">{message}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Link
                                    to="/subscription"
                                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    العودة للاشتراكات
                                </Link>
                                <Link
                                    to="/dashboard"
                                    className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl font-bold transition-colors"
                                >
                                    العودة للوحة التحكم
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
