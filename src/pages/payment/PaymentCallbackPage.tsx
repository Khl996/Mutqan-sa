import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePayment } from '@/hooks/usePayment'
import { useTenant } from '@/contexts/TenantContext'

type PaymentStatus = 'loading' | 'success' | 'failed'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default function PaymentCallbackPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { verifyPayment } = usePayment()
    const { refreshTenant } = useTenant()
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    const [status, setStatus] = useState<PaymentStatus>('loading')
    const [message, setMessage] = useState('')
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const [countdown, setCountdown] = useState(3)

    useEffect(() => {
        const tapId = searchParams.get('tap_id')

        if (!tapId) {
            setStatus('failed')
            setMessage(t('payment.not_found'))
            return
        }

        let isMounted = true

        const verify = async () => {
            const result = await verifyPayment(tapId)
            if (!isMounted) return

            if (result.success) {
                for (let attempt = 0; attempt < 4; attempt++) {
                    await refreshTenant()
                    if (attempt < 3) await wait(750)
                }

                if (!isMounted) return

                setStatus('success')
                setMessage(t('payment.success_msg'))

                // Auto-redirect to /subscription after 3 seconds
                let secs = 3
                setCountdown(secs)
                countdownRef.current = setInterval(() => {
                    secs -= 1
                    setCountdown(secs)
                    if (secs <= 0) {
                        clearInterval(countdownRef.current!)
                        navigate('/subscription', { replace: true })
                    }
                }, 1000)
                return
            }

            setStatus('failed')
            setMessage(
                result.status === 'CANCELLED'
                    ? t('payment.cancelled')
                    : (result.message || t('payment.verify_failed'))
            )
        }

        void verify()

        return () => {
            isMounted = false
            if (countdownRef.current) clearInterval(countdownRef.current)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div
            className="min-h-screen bg-slate-50 font-cairo flex items-center justify-center"
            dir={isRTL ? 'rtl' : 'ltr'}
        >
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
                                <h2 className="text-2xl font-bold text-slate-800">
                                    {t('payment.verifying')}
                                </h2>
                                <p className="text-slate-500 mt-2">
                                    {t('payment.verifying_sub')}
                                </p>
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
                                <h2 className="text-2xl font-bold text-slate-800">
                                    {t('payment.success_title')}
                                </h2>
                                <p className="text-slate-500 mt-2">{message}</p>
                                <p className="text-slate-400 text-sm mt-3">
                                    {t('payment.redirecting', { count: countdown })}
                                </p>
                            </div>
                            <Link
                                to="/subscription"
                                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-colors"
                            >
                                {t('payment.go_to_subscription')}
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
                                <h2 className="text-2xl font-bold text-slate-800">
                                    {t('payment.failed_title')}
                                </h2>
                                <p className="text-slate-500 mt-2">{message}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Link
                                    to="/subscription"
                                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    {t('payment.back_to_subscription')}
                                </Link>
                                <Link
                                    to="/dashboard"
                                    className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl font-bold transition-colors"
                                >
                                    {t('payment.go_to_dashboard')}
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
