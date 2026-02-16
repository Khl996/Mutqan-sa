import { useTranslation } from 'react-i18next'
import { AlertTriangle, Lock } from 'lucide-react'

export default function ServiceSuspended() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-200">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Lock className="w-10 h-10 text-red-500" />
                </div>

                <h1 className="text-2xl font-bold text-gray-900 mb-3 font-cairo">
                    {isRTL ? 'الخدمة متوقفة مؤقتاً' : 'Service Suspended'}
                </h1>

                <p className="text-gray-500 mb-8 leading-relaxed font-cairo">
                    {isRTL
                        ? 'عذراً، تم إيقاف الخدمة مؤقتاً بسبب انتهاء صلاحية الاشتراك. يرجى التواصل مع مسؤول النظام لتجديد الاشتراك.'
                        : 'Sorry, the service has been vertically suspended due to subscription expiration. Please contact your system administrator to renew the subscription.'}
                </p>

                <div className="bg-blue-50 p-4 rounded-xl flex items-start gap-3 text-start">
                    <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-blue-900 text-sm font-cairo mb-1">
                            {isRTL ? 'ملاحظة' : 'Note'}
                        </h4>
                        <p className="text-xs text-blue-700 font-cairo">
                            {isRTL
                                ? 'بياناتك محفوظة وآمنة. ستتمكن من الوصول إليها فور تجديد الاشتراك.'
                                : 'Your data is safe and secure. You will regain access immediately after renewal.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
