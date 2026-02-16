import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Building2, User, Phone, FileText, Send, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Building {
    id: string
    name: string
    name_ar: string
}

interface PortalSettings {
    require_phone?: boolean
    auto_assign_to_team?: boolean
    show_estimated_time?: boolean
}

interface TenantData {
    tenant_id: string
    tenant_name: string
    buildings: Building[]
    portal_settings?: PortalSettings
}

export default function PublicReportPage() {
    const { token } = useParams<{ token: string }>()
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [tenantData, setTenantData] = useState<TenantData | null>(null)

    // Form State
    const [formData, setFormData] = useState({
        reporter_name: '',
        reporter_phone: '',
        building_id: '',
        description: ''
    })

    // Get settings - default to false for require_phone
    const requirePhone = tenantData?.portal_settings?.require_phone ?? false

    // const isRTL = true // Check handled via CSS/HTML logic usually or context

    useEffect(() => {
        if (token) {
            validateToken()
        }
    }, [token])

    const validateToken = async () => {
        try {
            const { data, error } = await ((supabase as any).rpc('get_public_tenant_data', {
                p_token: token
            }))

            if (error) throw error

            // RPC returning TABLE results in an array of rows. We expect one row.
            // If data is array
            const result = Array.isArray(data) ? data[0] : data

            if (!result) {
                setError('الرابط غير صالح أو انتهت صلاحيته')
                return
            }

            setTenantData(result)
        } catch (err) {
            console.error(err)
            setError('حدث خطأ أثناء التحقق من الرابط')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.reporter_name || !formData.building_id || !formData.description) {
            toast.error('يرجى تعبئة الحقول الإجبارية')
            return
        }

        // Check phone requirement based on settings
        if (requirePhone && !formData.reporter_phone) {
            toast.error('يرجى إدخال رقم الجوال')
            return
        }

        setSubmitting(true)
        try {
            const { error } = await ((supabase as any).rpc('submit_public_work_order', {
                p_token: token,
                p_reporter_name: formData.reporter_name,
                p_reporter_phone: formData.reporter_phone,
                p_description: formData.description,
                p_building_id: formData.building_id
            }))

            if (error) throw error

            setSuccess(true)
            toast.success('تم إرسال البلاغ بنجاح')
        } catch (err) {
            console.error(err)
            toast.error('حدث خطأ أثناء إرسال البلاغ')
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error || !tenantData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-red-100">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold font-cairo mb-2 text-gray-900">رابط غير صالح</h1>
                    <p className="text-gray-500 font-cairo text-sm">
                        {error || 'نأسف، هذا الرابط غير صالح أو قد تم تعطيله من قبل المؤسسة.'}
                    </p>
                </div>
            </div>
        )
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white p-12 rounded-2xl shadow-sm text-center max-w-md w-full border border-green-100 animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-green-600" />
                    </div>
                    <h1 className="text-2xl font-bold font-cairo mb-3 text-gray-900">تم استلام البلاغ!</h1>
                    <p className="text-gray-500 font-cairo mb-8">
                        شكراً لك، {formData.reporter_name}.<br />
                        تم إرسال بلاغك إلى فريق الصيانة في <span className="font-bold text-gray-800">{tenantData.tenant_name}</span> وسيتم التعامل معه قريباً.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold font-cairo hover:bg-gray-200 transition-colors"
                    >
                        تقديم بلاغ آخر
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 font-cairo" dir="rtl">
            <div className="max-w-lg mx-auto bg-white min-h-screen shadow-xl relative pb-10">
                {/* Header Section */}
                <div className="bg-primary px-6 py-12 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="relative z-10 text-center">
                        <h1 className="text-2xl font-bold mb-2">{tenantData.tenant_name}</h1>
                        <p className="text-primary-foreground/80 text-sm">بوابة بلاغات الصيانة والخدمات</p>
                    </div>
                </div>

                {/* Form Section */}
                <div className="-mt-6 px-6 relative z-20">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">

                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-primary" />
                                بيانات المبلغ
                            </h2>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-500">الاسم الكامل <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <User className="absolute top-3 right-3 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        required
                                        className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        placeholder="اسمك الكريم"
                                        value={formData.reporter_name}
                                        onChange={e => setFormData({ ...formData, reporter_name: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-500">
                                    رقم الجوال {requirePhone ? <span className="text-red-500">*</span> : '(اختياري)'}
                                </label>
                                <div className="relative">
                                    <Phone className="absolute top-3 right-3 w-5 h-5 text-gray-400" />
                                    <input
                                        type="tel"
                                        required={requirePhone}
                                        className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        placeholder="05xxxxxxxx"
                                        value={formData.reporter_phone}
                                        onChange={e => setFormData({ ...formData, reporter_phone: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <hr className="border-gray-100" />

                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-primary" />
                                تفاصيل البلاغ
                            </h2>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-500">المبنى / الموقع <span className="text-red-500">*</span></label>
                                <select
                                    required
                                    className={cn(
                                        "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none",
                                        !formData.building_id && "text-gray-400"
                                    )}
                                    value={formData.building_id}
                                    onChange={e => setFormData({ ...formData, building_id: e.target.value })}
                                >
                                    <option value="" disabled>اختر المبنى...</option>
                                    {tenantData.buildings?.map(b => (
                                        <option key={b.id} value={b.id} className="text-gray-900">
                                            {b.name_ar || b.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-500">وصف المشكلة <span className="text-red-500">*</span></label>
                                <textarea
                                    required
                                    rows={4}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                                    placeholder="يرجى وصف العطل ومكانه بدقة..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    جاري الإرسال...
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5 rtl:rotate-180" />
                                    إرسال البلاغ
                                </>
                            )}
                        </button>

                    </div>

                    <div className="mt-8 text-center">
                        <p className="text-xs text-gray-400">Powered by Mutqan Facility Management System</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
