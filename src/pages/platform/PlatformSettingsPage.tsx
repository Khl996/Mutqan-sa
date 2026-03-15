import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { InfoIcon } from 'lucide-react'

export default function PlatformSettingsPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-primary">
                    {isRTL ? 'إعدادات المنصة' : 'Platform Settings'}
                </h1>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2 text-primary">
                            <InfoIcon className="w-5 h-5" />
                            {isRTL ? 'بوابات الدفع (Tap Payments)' : 'Payment Gateways (Tap Payments)'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{isRTL ? 'مفتاح الـ API' : 'API Key'}</label>
                            <input type="password" value="sk_test_*************************" disabled className="w-full p-2 border rounded-md bg-muted/50" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{isRTL ? 'رقم التاجر' : 'Merchant ID'}</label>
                            <input type="text" value="MERCH_12345" disabled className="w-full p-2 border rounded-md bg-muted/50" />
                        </div>
                        <button disabled className="mt-2 bg-primary text-primary-foreground px-4 py-2 rounded-md opacity-50 cursor-not-allowed">
                            {isRTL ? 'تحديث' : 'Update'}
                        </button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2 text-primary">
                            <InfoIcon className="w-5 h-5" />
                            {isRTL ? 'إعدادات البريد (Resend)' : 'Email Settings (Resend)'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{isRTL ? 'مفتاح الـ API' : 'API Key'}</label>
                            <input type="password" value="re_test_*************************" disabled className="w-full p-2 border rounded-md bg-muted/50" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{isRTL ? 'البريد المرسل (From)' : 'Sender Email'}</label>
                            <input type="text" value="noreply@facility-management.space" disabled className="w-full p-2 border rounded-md bg-muted/50" />
                        </div>
                        <button disabled className="mt-2 bg-primary text-primary-foreground px-4 py-2 rounded-md opacity-50 cursor-not-allowed">
                            {isRTL ? 'تحديث' : 'Update'}
                        </button>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
