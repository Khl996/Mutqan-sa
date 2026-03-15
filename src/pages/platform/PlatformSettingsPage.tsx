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

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2 text-primary">
                        <InfoIcon className="w-5 h-5" />
                        {isRTL ? 'معلومات الإعدادات' : 'Settings Information'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        {isRTL
                            ? 'إعدادات المنصة العامة (بوابات الدفع، إعدادات البريد الإلكتروني، إعدادات النظام) سيتم إتاحتها هنا قريباً.'
                            : 'Global platform settings (Payment gateways, Email configuration, System preferences) will be available here soon.'}
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
