import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from '@/hooks/useTenantQuery'
import { useTenantModules } from '@/hooks/useTenantModules'
import { isFeatureEnabled } from '@/config/modules'
import QRCode from 'react-qr-code'
import { Copy, Printer, RefreshCw, Power, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'

export default function PortalSettingsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const tenantId = useCurrentTenantId()
    const { data: tenantModules, isLoading: isModulesLoading } = useTenantModules()
    const [loading, setLoading] = useState(true)
    const [token, setToken] = useState<string | null>(null)
    const [tokenId, setTokenId] = useState<string | null>(null)
    const [portalConfirm, setPortalConfirm] = useState<null | 'deactivate' | 'regenerate'>(null)
    const hasPublicPortalAccess =
        isFeatureEnabled(tenantModules, 'public_portal', 'qr_portal') &&
        isFeatureEnabled(tenantModules, 'public_portal', 'public_submission')

    const fetchToken = async () => {
        if (!tenantId) return

        setLoading(true)

        try {
            const { data, error } = await (supabase.from('tenant_access_tokens') as any)
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('name', 'Main QR Code')
                .single()

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching token:', error)
            }

            if (data) {
                setToken(data.token)
                setTokenId(data.id)
            } else {
                setToken(null)
                setTokenId(null)
            }
        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!tenantId || isModulesLoading || !hasPublicPortalAccess) {
            return
        }

        void fetchToken()
    }, [tenantId, isModulesLoading, hasPublicPortalAccess])

    const generateToken = async () => {
        if (!tenantId) return

        setLoading(true)

        try {
            const randomBytes = new Uint8Array(32)
            crypto.getRandomValues(randomBytes)
            const newToken = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

            const { data, error } = await (supabase.from('tenant_access_tokens') as any)
                .insert({
                    tenant_id: tenantId,
                    token: newToken,
                    name: 'Main QR Code',
                    is_active: true,
                })
                .select()
                .single()

            if (error) throw error

            setToken(data.token)
            setTokenId(data.id)
            toast.success(isRTL ? 'تم إنشاء كود البوابة بنجاح' : 'Portal code generated successfully')
        } catch (error) {
            console.error('Error:', error)
            toast.error(isRTL ? 'حدث خطأ أثناء إنشاء الكود' : 'Error generating code')
        } finally {
            setLoading(false)
        }
    }

    const deactivateToken = async () => {
        if (!tokenId) return

        setLoading(true)

        try {
            const { error } = await (supabase.from('tenant_access_tokens') as any)
                .delete()
                .eq('id', tokenId)

            if (error) throw error

            setToken(null)
            setTokenId(null)
            toast.success(isRTL ? 'تم تعطيل الرابط' : 'Link disabled')
        } catch (error) {
            console.error('Error:', error)
            toast.error(isRTL ? 'تعذر تعطيل الرابط' : 'Failed to disable link')
        } finally {
            setLoading(false)
        }
    }

    const handlePortalConfirm = () => {
        if (portalConfirm === 'deactivate') {
            void deactivateToken()
        }

        if (portalConfirm === 'regenerate') {
            void deactivateToken().then(generateToken)
        }

        setPortalConfirm(null)
    }

    const portalUrl = token ? `${window.location.origin}/portal/${token}` : ''

    const handleCopy = () => {
        navigator.clipboard.writeText(portalUrl)
        toast.success(isRTL ? 'تم نسخ الرابط' : 'Link copied')
    }

    const handlePrint = () => {
        const printWindow = window.open('', '_blank')

        if (!printWindow) return

        printWindow.document.write(`
            <html dir="${isRTL ? 'rtl' : 'ltr'}">
            <head>
                <title>${isRTL ? 'طباعة رمز QR' : 'Print QR Code'}</title>
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 40px; }
                    h1 { color: #333; margin-bottom: 10px; }
                    .qr { margin: 20px auto; }
                    .url { color: #666; font-size: 14px; margin-top: 10px; }
                    .note { margin-top: 30px; font-size: 12px; color: #999; }
                </style>
            </head>
            <body>
                <h1>${isRTL ? 'امسح الكود لتقديم بلاغ صيانة' : 'Scan to Report Issue'}</h1>
                <p>${isRTL ? 'امسح الكود أدناه لتقديم طلب صيانة جديد' : 'Scan the QR code below to submit a new work request'}</p>
                <div class="qr">
                    ${document.getElementById('qr-code-svg')?.outerHTML || ''}
                </div>
                <p class="url">${portalUrl}</p>
                <div class="note">Powered by Mutqan</div>
                <script>window.print();</script>
            </body>
            </html>
        `)
        printWindow.document.close()
    }

    if (isModulesLoading) {
        return <div className="p-8 font-cairo text-center">{isRTL ? 'جارٍ التحميل...' : 'Loading...'}</div>
    }

    if (!hasPublicPortalAccess) {
        return <Navigate to="/settings" replace />
    }

    if (loading && !token) {
        return <div className="p-8 font-cairo text-center">{isRTL ? 'جارٍ التحميل...' : 'Loading...'}</div>
    }

    return (
        <div className="container max-w-4xl mx-auto p-6 space-y-8 font-cairo">
            <div>
                <h1 className="text-3xl font-bold mb-2">{isRTL ? 'بوابة البلاغات العامة' : 'Public Reporting Portal'}</h1>
                <p className="text-muted-foreground">
                    {isRTL
                        ? 'إدارة الرابط العام ورمز QR لتمكين الموظفين والزوار من تقديم البلاغات دون تسجيل دخول.'
                        : 'Manage public link and QR code to allow employees and guests to report issues without login.'}
                </p>
            </div>

            {!token ? (
                <div className="bg-white p-12 rounded-xl border-2 border-dashed border-gray-300 text-center space-y-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Power className="w-8 h-8 text-gray-400" />
                    </div>
                    <h2 className="text-xl font-bold">{isRTL ? 'البوابة غير مفعلة' : 'Portal Not Active'}</h2>
                    <p className="text-gray-500 max-w-md mx-auto">
                        {isRTL
                            ? 'قم بتوليد رابط جديد للبدء في استقبال البلاغات من خارج النظام.'
                            : 'Generate a new link to start receiving reports from outside the system.'}
                    </p>
                    <button
                        onClick={generateToken}
                        disabled={loading}
                        className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-bold"
                    >
                        {isRTL ? 'تفعيل البوابة وتوليد QR Code' : 'Activate Portal & Generate QR'}
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center space-y-6">
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100" id="qr-code-wrapper">
                            <QRCode
                                id="qr-code-svg"
                                value={portalUrl}
                                size={200}
                                level="H"
                            />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-sm font-mono bg-gray-50 p-2 rounded border border-gray-200 break-all select-all">
                                {portalUrl}
                            </p>
                        </div>
                        <div className="flex gap-3 w-full">
                            <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                                <Copy className="w-4 h-4" />
                                {isRTL ? 'نسخ' : 'Copy'}
                            </button>
                            <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                                <Printer className="w-4 h-4" />
                                {isRTL ? 'طباعة الملصق' : 'Print Label'}
                            </button>
                        </div>
                        <div className="pt-4 border-t border-gray-100 w-full text-center">
                            <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm flex items-center justify-center gap-1 hover:underline">
                                {isRTL ? 'فتح الرابط' : 'Open Portal'} <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm space-y-6 self-start">
                        <div>
                            <h3 className="text-lg font-bold mb-2">{isRTL ? 'إعدادات البوابة' : 'Portal Settings'}</h3>
                            <p className="text-sm text-gray-500">
                                {isRTL
                                    ? 'التحكم في صلاحية الوصول وإعادة تعيين الرابط.'
                                    : 'Control access and reset link.'}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                                <div className="flex items-center gap-3">
                                    <RefreshCw className="w-5 h-5 text-yellow-600" />
                                    <div className="text-sm">
                                        <p className="font-bold text-yellow-800">{isRTL ? 'تجديد الرابط' : 'Regenerate Link'}</p>
                                        <p className="text-yellow-600 text-xs">{isRTL ? 'سيتوقف الرابط السابق فورًا' : 'Old link will stop working'}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setPortalConfirm('regenerate')}
                                    className="px-3 py-1 text-xs bg-white border border-yellow-200 text-yellow-700 rounded hover:bg-yellow-100"
                                >
                                    {isRTL ? 'تجديد' : 'Reset'}
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
                                <div className="flex items-center gap-3">
                                    <Power className="w-5 h-5 text-red-600" />
                                    <div className="text-sm">
                                        <p className="font-bold text-red-800">{isRTL ? 'إيقاف البوابة' : 'Deactivate Portal'}</p>
                                        <p className="text-red-600 text-xs">{isRTL ? 'منع استقبال أي بلاغات جديدة' : 'Stop receiving new reports'}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setPortalConfirm('deactivate')}
                                    className="px-3 py-1 text-xs bg-white border border-red-200 text-red-700 rounded hover:bg-red-100"
                                >
                                    {isRTL ? 'إيقاف' : 'Turn Off'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmActionDialog
                open={!!portalConfirm}
                onOpenChange={(open) => !open && setPortalConfirm(null)}
                title={portalConfirm === 'regenerate'
                    ? (isRTL ? 'تجديد رابط البوابة' : 'Regenerate Portal Link')
                    : (isRTL ? 'إيقاف البوابة العامة' : 'Deactivate Public Portal')}
                description={portalConfirm === 'regenerate'
                    ? (isRTL ? 'سيتم إيقاف الرابط الحالي فورًا وإنشاء رابط جديد ورمز QR جديد.' : 'The current link will stop working immediately and a new link and QR code will be generated.')
                    : (isRTL ? 'سيتم إيقاف الرابط الحالي ولن يتم استقبال بلاغات جديدة عبره.' : 'The current link will be disabled and new reports cannot be submitted through it.')}
                confirmLabel={portalConfirm === 'regenerate' ? (isRTL ? 'تجديد' : 'Regenerate') : (isRTL ? 'إيقاف' : 'Deactivate')}
                cancelLabel={isRTL ? 'إلغاء' : 'Cancel'}
                onConfirm={handlePortalConfirm}
            />
        </div>
    )
}
