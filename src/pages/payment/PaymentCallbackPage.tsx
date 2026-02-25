import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react'
import { usePayment } from '@/hooks/usePayment'

export default function PaymentCallbackPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { verifyPayment } = usePayment()

    const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
    const [message, setMessage] = useState('')

    useEffect(() => {
        const tapId = searchParams.get('tap_id')

        if (!tapId) {
            setStatus('failed')
            setMessage('لم يتم العثور على معرّف العملية')
            return
        }

        const verify = async () => {
            const result = await verifyPayment(tapId)

            if (result.success) {
                setStatus('success')
                setMessage('تم الدفع بنجاح وتفعيل اشتراكك!')
            } else {
                setStatus('failed')
                setMessage(
                    result.status === 'CANCELLED'
                        ? 'تم إلغاء عملية الدفع'
                        : result.message || 'فشلت عملية الدفع. يرجى المحاولة مرة أخرى.'
                )
            }
        }

        verify()
    }, [searchParams])

    return (
        <div className="min-h-screen bg-slate-50 font-cairo flex items-center justify-center" dir="rtl">
            <div className="max-w-md w-full mx-4">
                <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 text-center space-y-6">

                    {/* Loading */}
                    {status === 'loading' && (
                        <>
                            <div className="flex justify-center">
                                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
                                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">جارٍ التحقق من الدفع...</h2>
                                <p className="text-slate-500 mt-2">يرجى الانتظار بينما نتحقق من عملية الدفع</p>
                            </div>
                        </>
                    )}

                    {/* Success */}
                    {status === 'success' && (
                        <>
                            <div className="flex justify-center">
                                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">تم بنجاح! 🎉</h2>
                                <p className="text-slate-500 mt-2">{message}</p>
                            </div>
                            <Link
                                to="/dashboard"
                                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-colors"
                            >
                                الذهاب إلى لوحة التحكم
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </>
                    )}

                    {/* Failed */}
                    {status === 'failed' && (
                        <>
                            <div className="flex justify-center">
                                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
                                    <XCircle className="w-10 h-10 text-red-500" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">لم تتم العملية</h2>
                                <p className="text-slate-500 mt-2">{message}</p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <Link
                                    to="/subscription"
                                    className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-colors"
                                >
                                    المحاولة مرة أخرى
                                </Link>
                                <Link
                                    to="/dashboard"
                                    className="text-slate-500 hover:text-slate-700 text-sm transition-colors"
                                >
                                    العودة للوحة التحكم
                                </Link>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-slate-400 text-xs mt-6">
                    الدفع مؤمّن بواسطة Tap Payments
                </p>
            </div>
        </div>
    )
}
