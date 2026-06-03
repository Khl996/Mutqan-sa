import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
    Building2, User, Phone, FileText, Send, CheckCircle2,
    AlertTriangle, Loader2, ChevronDown, Camera, X, ExternalLink,
    Copy, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface LocationItem {
    id: string
    name: string
    name_ar: string
}

interface Floor extends LocationItem {
    building_id: string
}

interface Department extends LocationItem {
    building_id: string | null
    floor_id: string | null
}

interface IssueType {
    id: string
    code: string
    name: string
    name_ar: string
    icon: string | null
}

interface TenantData {
    tenant_id: string
    tenant_name: string
    buildings: LocationItem[]
    portal_settings?: { require_phone?: boolean }
    floors: Floor[]
    departments: Department[]
    issue_types: IssueType[]
}

interface SubmitResult {
    work_order_id: string
    code: string
    tracking_token: string
}

const OTHER_VALUE = '__other__'

// ── Helpers ────────────────────────────────────────────────────────────────────

function SelectField({
    label, required, value, onChange, children, placeholder,
}: {
    label: string
    required?: boolean
    value: string
    onChange: (v: string) => void
    children: React.ReactNode
    placeholder: string
}) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-gray-500">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
                <select
                    required={required}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={cn(
                        'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl',
                        'focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none',
                        !value && 'text-gray-400',
                    )}
                >
                    <option value="" disabled>{placeholder}</option>
                    {children}
                </select>
                <ChevronDown className="absolute top-3.5 left-3 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
        </div>
    )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PublicReportPage() {
    const { token } = useParams<{ token: string }>()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [loading, setLoading]       = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError]           = useState<string | null>(null)
    const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
    const [tenantData, setTenantData] = useState<TenantData | null>(null)
    const [copied, setCopied]         = useState(false)
    const [photoFile, setPhotoFile]   = useState<File | null>(null)
    const [photoPreview, setPhotoPreview] = useState<string | null>(null)
    const [uploadingPhoto, setUploadingPhoto] = useState(false)

    const [formData, setFormData] = useState({
        reporter_name:  '',
        reporter_phone: '',
        issue_type_id:  '',
        building_id:    '',   // UUID or OTHER_VALUE
        floor_id:       '',   // UUID or OTHER_VALUE
        department_id:  '',   // UUID or OTHER_VALUE
        location_note:  '',   // free text for "أخرى" in any level
        description:    '',
    })

    const requirePhone = tenantData?.portal_settings?.require_phone ?? false

    // Derived location lists (cascading)
    const availableFloors = tenantData?.floors.filter(
        f => !formData.building_id ||
             formData.building_id === OTHER_VALUE ||
             f.building_id === formData.building_id
    ) ?? []

    const availableDepts = tenantData?.departments.filter(d => {
        if (!formData.building_id || formData.building_id === OTHER_VALUE) return true
        const byBuilding = d.building_id === formData.building_id
        if (!formData.floor_id || formData.floor_id === OTHER_VALUE) return byBuilding
        return byBuilding && (d.floor_id === formData.floor_id || !d.floor_id)
    }) ?? []

    // ── Data loading ───────────────────────────────────────────────────────────

    useEffect(() => {
        if (token) loadTenantData()
    }, [token])

    const loadTenantData = async () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('get_public_tenant_data', {
                p_token: token,
            })
            if (error) throw error
            const result = Array.isArray(data) ? data[0] : data
            if (!result) {
                setError('الرابط غير صالح أو انتهت صلاحيته')
                return
            }
            setTenantData({
                ...result,
                floors:       result.floors       ?? [],
                departments:  result.departments  ?? [],
                issue_types:  result.issue_types  ?? [],
                buildings:    result.buildings    ?? [],
            })
        } catch (err) {
            console.error(err)
            setError('حدث خطأ أثناء التحقق من الرابط')
        } finally {
            setLoading(false)
        }
    }

    // ── Photo selection ────────────────────────────────────────────────────────

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) {
            toast.error('حجم الصورة يتجاوز 5 ميجابايت')
            return
        }
        setPhotoFile(file)
        setPhotoPreview(URL.createObjectURL(file))
    }

    const clearPhoto = () => {
        setPhotoFile(null)
        setPhotoPreview(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ── Form field helpers ─────────────────────────────────────────────────────

    const setField = (key: keyof typeof formData) => (value: string) => {
        setFormData(prev => {
            const next = { ...prev, [key]: value }
            // Cascade resets
            if (key === 'building_id') { next.floor_id = ''; next.department_id = '' }
            if (key === 'floor_id')    { next.department_id = '' }
            return next
        })
    }

    // ── Submit ─────────────────────────────────────────────────────────────────

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.reporter_name.trim() || !formData.description.trim()) {
            toast.error('يرجى تعبئة الحقول الإجبارية')
            return
        }
        if (requirePhone && !formData.reporter_phone.trim()) {
            toast.error('يرجى إدخال رقم الجوال')
            return
        }
        // Require location note if any location level is "other"
        const anyOther = [formData.building_id, formData.floor_id, formData.department_id]
            .some(v => v === OTHER_VALUE)
        if (anyOther && !formData.location_note.trim()) {
            toast.error('يرجى وصف الموقع في حقل "أخرى"')
            return
        }

        setSubmitting(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('submit_public_work_order', {
                p_token:          token,
                p_reporter_name:  formData.reporter_name.trim(),
                p_reporter_phone: formData.reporter_phone.trim() || null,
                p_description:    formData.description.trim(),
                // Pass UUID or null (omit for "other")
                p_building_id:    formData.building_id && formData.building_id !== OTHER_VALUE
                                      ? formData.building_id : null,
                p_floor_id:       formData.floor_id && formData.floor_id !== OTHER_VALUE
                                      ? formData.floor_id : null,
                p_department_id:  formData.department_id && formData.department_id !== OTHER_VALUE
                                      ? formData.department_id : null,
                p_issue_type_id:  formData.issue_type_id || null,
                p_location_note:  formData.location_note.trim() || null,
            })

            if (error) throw error

            const result: SubmitResult = data
            setSubmitResult(result)

            // Upload photo if selected (non-blocking — failure doesn't abort success screen)
            if (photoFile && result.tracking_token) {
                setUploadingPhoto(true)
                try {
                    await uploadPhoto(photoFile, result.tracking_token)
                } catch (photoErr) {
                    console.error('Photo upload failed (non-fatal):', photoErr)
                    toast.error('تم إرسال البلاغ لكن تعذّر رفع الصورة')
                } finally {
                    setUploadingPhoto(false)
                }
            }
        } catch (err) {
            console.error(err)
            toast.error('حدث خطأ أثناء إرسال البلاغ')
        } finally {
            setSubmitting(false)
        }
    }

    const uploadPhoto = async (file: File, trackingToken: string) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const edgeFnUrl   = `${supabaseUrl}/functions/v1/upload-report-photo`

        const body = new FormData()
        body.append('tracking_token', trackingToken)
        body.append('file', file)

        const res = await fetch(edgeFnUrl, { method: 'POST', body })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error ?? 'Upload failed')
        }
    }

    const copyTrackingLink = () => {
        if (!submitResult) return
        const link = `${window.location.origin}/track/${submitResult.tracking_token}`
        navigator.clipboard.writeText(link).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    // ── Loading / Error screens ────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
                        {error ?? 'نأسف، هذا الرابط غير صالح أو قد تم تعطيله من قبل المؤسسة.'}
                    </p>
                </div>
            </div>
        )
    }

    // ── Success screen ─────────────────────────────────────────────────────────

    if (submitResult) {
        const trackingUrl = `${window.location.origin}/track/${submitResult.tracking_token}`
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-cairo" dir="rtl">
                <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-green-100 animate-in fade-in zoom-in duration-300 space-y-6">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                        {uploadingPhoto
                            ? <Loader2 className="w-10 h-10 text-green-500 animate-spin" />
                            : <CheckCircle2 className="w-10 h-10 text-green-600" />
                        }
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">تم استلام البلاغ!</h1>
                        <p className="text-gray-500 text-sm">
                            شكراً {formData.reporter_name}.
                            سيتم التعامل مع بلاغك في{' '}
                            <span className="font-bold text-gray-800">{tenantData.tenant_name}</span>.
                        </p>
                    </div>

                    {/* Report number */}
                    <div className="bg-gray-50 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-400 mb-1">رقم البلاغ</p>
                        <p className="text-lg font-bold text-primary tracking-wider">{submitResult.code}</p>
                    </div>

                    {/* Tracking link */}
                    <div className="space-y-3">
                        <p className="text-xs text-gray-500">احفظ هذا الرابط لمتابعة حالة بلاغك</p>
                        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
                            <span className="text-xs text-gray-600 flex-1 truncate text-left" dir="ltr">
                                {trackingUrl}
                            </span>
                            <button
                                onClick={copyTrackingLink}
                                className="text-primary hover:text-primary/80 transition-colors flex-shrink-0"
                                title="نسخ الرابط"
                            >
                                {copied
                                    ? <Check className="w-4 h-4 text-green-600" />
                                    : <Copy className="w-4 h-4" />
                                }
                            </button>
                        </div>
                        <Link
                            to={`/track/${submitResult.tracking_token}`}
                            className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" />
                            تتبّع البلاغ الآن
                        </Link>
                    </div>

                    <button
                        onClick={() => window.location.reload()}
                        className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
                    >
                        تقديم بلاغ آخر
                    </button>
                </div>
            </div>
        )
    }

    // ── Intake form ────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gray-50 font-cairo" dir="rtl">
            <div className="max-w-lg mx-auto bg-white min-h-screen shadow-xl relative pb-10">

                {/* Header */}
                <div className="bg-primary px-6 py-12 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="relative z-10 text-center">
                        <h1 className="text-2xl font-bold mb-2">{tenantData.tenant_name}</h1>
                        <p className="text-white/80 text-sm">بوابة بلاغات الصيانة والخدمات</p>
                    </div>
                </div>

                {/* Form */}
                <div className="-mt-6 px-6 relative z-20">
                    <form
                        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6"
                        onSubmit={handleSubmit}
                    >

                        {/* ── Reporter info ───────────────────────────────────── */}
                        <section className="space-y-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <User className="w-5 h-5 text-primary" />
                                بيانات المُبلِّغ
                            </h2>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-500">
                                    الاسم الكامل <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <User className="absolute top-3 right-3 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        required
                                        className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        placeholder="اسمك الكريم"
                                        value={formData.reporter_name}
                                        onChange={e => setField('reporter_name')(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-500">
                                    رقم الجوال{' '}
                                    {requirePhone
                                        ? <span className="text-red-500">*</span>
                                        : <span className="text-gray-400">(اختياري)</span>
                                    }
                                </label>
                                <div className="relative">
                                    <Phone className="absolute top-3 right-3 w-5 h-5 text-gray-400" />
                                    <input
                                        type="tel"
                                        required={requirePhone}
                                        className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        placeholder="05xxxxxxxx"
                                        value={formData.reporter_phone}
                                        onChange={e => setField('reporter_phone')(e.target.value)}
                                    />
                                </div>
                            </div>
                        </section>

                        <hr className="border-gray-100" />

                        {/* ── Issue type ──────────────────────────────────────── */}
                        {tenantData.issue_types.length > 0 && (
                            <section className="space-y-4">
                                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-primary" />
                                    نوع البلاغ
                                </h2>
                                <SelectField
                                    label="نوع المشكلة"
                                    value={formData.issue_type_id}
                                    onChange={setField('issue_type_id')}
                                    placeholder="اختر نوع المشكلة..."
                                >
                                    {tenantData.issue_types.map(it => (
                                        <option key={it.id} value={it.id} className="text-gray-900">
                                            {it.name_ar || it.name}
                                        </option>
                                    ))}
                                </SelectField>
                            </section>
                        )}

                        <hr className="border-gray-100" />

                        {/* ── Location ────────────────────────────────────────── */}
                        <section className="space-y-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-primary" />
                                الموقع
                            </h2>

                            {/* Building */}
                            {tenantData.buildings.length > 0 && (
                                <SelectField
                                    label="المبنى"
                                    value={formData.building_id}
                                    onChange={setField('building_id')}
                                    placeholder="اختر المبنى..."
                                >
                                    {tenantData.buildings.map(b => (
                                        <option key={b.id} value={b.id} className="text-gray-900">
                                            {b.name_ar || b.name}
                                        </option>
                                    ))}
                                    <option value={OTHER_VALUE} className="text-gray-900">أخرى (غير مدرج)</option>
                                </SelectField>
                            )}

                            {/* Floor — only shown when building selected */}
                            {formData.building_id && availableFloors.length > 0 && (
                                <SelectField
                                    label="الدور / الطابق"
                                    value={formData.floor_id}
                                    onChange={setField('floor_id')}
                                    placeholder="اختر الدور... (اختياري)"
                                >
                                    {availableFloors.map(f => (
                                        <option key={f.id} value={f.id} className="text-gray-900">
                                            {f.name_ar || f.name}
                                        </option>
                                    ))}
                                    <option value={OTHER_VALUE} className="text-gray-900">أخرى</option>
                                </SelectField>
                            )}

                            {/* Department — only shown when building selected */}
                            {formData.building_id && availableDepts.length > 0 && (
                                <SelectField
                                    label="القسم / الوحدة"
                                    value={formData.department_id}
                                    onChange={setField('department_id')}
                                    placeholder="اختر القسم... (اختياري)"
                                >
                                    {availableDepts.map(d => (
                                        <option key={d.id} value={d.id} className="text-gray-900">
                                            {d.name_ar || d.name}
                                        </option>
                                    ))}
                                    <option value={OTHER_VALUE} className="text-gray-900">أخرى</option>
                                </SelectField>
                            )}

                            {/* "أخرى" free-text fallback */}
                            {[formData.building_id, formData.floor_id, formData.department_id]
                                .some(v => v === OTHER_VALUE) && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-500">
                                        وصف الموقع <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        placeholder="مثال: جناح الأطفال، الدور الثالث"
                                        value={formData.location_note}
                                        onChange={e => setField('location_note')(e.target.value)}
                                    />
                                </div>
                            )}
                        </section>

                        <hr className="border-gray-100" />

                        {/* ── Description ────────────────────────────────────── */}
                        <section className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-500">
                                    وصف المشكلة <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    required
                                    rows={4}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                                    placeholder="يرجى وصف العطل ومكانه بدقة..."
                                    value={formData.description}
                                    onChange={e => setField('description')(e.target.value)}
                                />
                            </div>
                        </section>

                        {/* ── Photo upload ────────────────────────────────────── */}
                        <section className="space-y-3">
                            <label className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                                <Camera className="w-4 h-4" />
                                صورة للعطل
                                <span className="text-gray-400">(اختياري — بحد أقصى 5 ميجابايت)</span>
                            </label>

                            {photoPreview ? (
                                <div className="relative inline-block">
                                    <img
                                        src={photoPreview}
                                        alt="صورة البلاغ"
                                        className="h-32 w-auto rounded-xl object-cover border border-gray-200"
                                    />
                                    <button
                                        type="button"
                                        onClick={clearPhoto}
                                        className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <label
                                    htmlFor="photo-input"
                                    className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-primary/50 hover:text-primary transition-all text-sm w-full justify-center cursor-pointer"
                                >
                                    <Camera className="w-5 h-5" />
                                    اضغط لإرفاق صورة
                                </label>
                            )}
                            <input
                                ref={fileInputRef}
                                id="photo-input"
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                                onChange={handlePhotoSelect}
                                className="hidden"
                            />
                        </section>

                        {/* ── Submit ──────────────────────────────────────────── */}
                        <button
                            type="submit"
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
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-xs text-gray-400">Powered by Mutqan Facility Management System</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
