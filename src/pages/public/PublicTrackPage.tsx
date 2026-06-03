import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
    Clock, Search, Wrench, CheckCircle2, XCircle, Ban,
    AlertTriangle, Loader2, Image as ImageIcon, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

type StatusKey = 'received' | 'in_review' | 'in_progress' | 'completed' | 'rejected' | 'cancelled'

interface TrackData {
    code: string
    display_status: string
    status_key: StatusKey
    created_at: string
    updated_at: string
    rejection_reason: string | null
    reporter_image_url: string | null
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusKey, {
    icon: React.ElementType
    color: string
    bg: string
    border: string
    badge: string
}> = {
    received: {
        icon: Clock,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        badge: 'bg-blue-100 text-blue-700',
    },
    in_review: {
        icon: Search,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        badge: 'bg-amber-100 text-amber-700',
    },
    in_progress: {
        icon: Wrench,
        color: 'text-indigo-600',
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        badge: 'bg-indigo-100 text-indigo-700',
    },
    completed: {
        icon: CheckCircle2,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
        badge: 'bg-green-100 text-green-700',
    },
    rejected: {
        icon: XCircle,
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
        badge: 'bg-red-100 text-red-700',
    },
    cancelled: {
        icon: Ban,
        color: 'text-gray-500',
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        badge: 'bg-gray-100 text-gray-600',
    },
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(iso))
    } catch {
        return iso
    }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PublicTrackPage() {
    const { token } = useParams<{ token: string }>()

    const [loading, setLoading] = useState(true)
    const [trackData, setTrackData] = useState<TrackData | null>(null)
    const [invalidToken, setInvalidToken] = useState(false)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)

    useEffect(() => {
        if (!token) {
            setInvalidToken(true)
            setLoading(false)
            return
        }

        async function fetchStatus() {
            setLoading(true)
            try {
                const { data, error } = await supabase.rpc('get_public_work_order_status', {
                    p_tracking_token: token,
                })

                if (error || data === null) {
                    setInvalidToken(true)
                    return
                }

                const result = data as TrackData
                setTrackData(result)

                // Fetch signed URL for reporter's photo if present
                if (result.reporter_image_url) {
                    const { data: signedData, error: signedError } = await supabase.storage
                        .from('public-report-photos')
                        .createSignedUrl(result.reporter_image_url, 3600)
                    if (!signedError && signedData?.signedUrl) {
                        setPhotoUrl(signedData.signedUrl)
                    }
                }
            } finally {
                setLoading(false)
            }
        }

        fetchStatus()
    }, [token])

    // ── Loading ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center font-cairo" dir="rtl">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-gray-500 text-sm">جارٍ التحقق من البلاغ…</p>
                </div>
            </div>
        )
    }

    // ── Invalid token ──────────────────────────────────────────────────────────

    if (invalidToken || !trackData) {
        return (
            <div className="min-h-screen bg-gray-50 font-cairo" dir="rtl">
                <div className="max-w-lg mx-auto bg-white min-h-screen shadow-xl">
                    <div className="bg-primary px-6 py-12 text-white text-center">
                        <h1 className="text-2xl font-bold">تتبّع البلاغ</h1>
                    </div>
                    <div className="px-6 py-12 flex flex-col items-center gap-6 text-center">
                        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 mb-2">رمز التتبّع غير صحيح</h2>
                            <p className="text-gray-500 text-sm leading-relaxed">
                                تعذّر إيجاد البلاغ المطلوب. تأكّد من صحّة الرابط أو تواصل مع الجهة المعنية.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ── Track view ─────────────────────────────────────────────────────────────

    const statusKey = (STATUS_CONFIG[trackData.status_key] ? trackData.status_key : 'received') as StatusKey
    const cfg = STATUS_CONFIG[statusKey]
    const StatusIcon = cfg.icon

    return (
        <div className="min-h-screen bg-gray-50 font-cairo" dir="rtl">
            <div className="max-w-lg mx-auto bg-white min-h-screen shadow-xl">

                {/* Header */}
                <div className="bg-primary px-6 py-12 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="relative z-10 text-center">
                        <h1 className="text-2xl font-bold mb-1">تتبّع البلاغ</h1>
                        <p className="text-white/80 text-sm">رقم البلاغ: {trackData.code}</p>
                    </div>
                </div>

                {/* Status card */}
                <div className="-mt-6 px-6 relative z-20 space-y-4">

                    <div className={cn(
                        'rounded-2xl border p-6 flex flex-col items-center gap-3 text-center shadow-sm',
                        cfg.bg, cfg.border
                    )}>
                        <div className={cn('w-14 h-14 rounded-full flex items-center justify-center', cfg.bg)}>
                            <StatusIcon className={cn('w-7 h-7', cfg.color)} />
                        </div>
                        <span className={cn('text-sm font-bold px-4 py-1.5 rounded-full', cfg.badge)}>
                            {trackData.display_status}
                        </span>
                    </div>

                    {/* Rejection reason */}
                    {trackData.status_key === 'rejected' && trackData.rejection_reason && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <p className="text-sm font-bold text-red-700 mb-1">سبب الرفض</p>
                            <p className="text-sm text-red-600 leading-relaxed">{trackData.rejection_reason}</p>
                        </div>
                    )}

                    {/* Dates */}
                    <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-100 shadow-sm">
                        <div className="flex items-center justify-between px-5 py-4">
                            <span className="text-sm text-gray-500">تاريخ التقديم</span>
                            <span className="text-sm font-medium text-gray-800">{formatDate(trackData.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-between px-5 py-4">
                            <span className="text-sm text-gray-500">آخر تحديث</span>
                            <span className="text-sm font-medium text-gray-800">{formatDate(trackData.updated_at)}</span>
                        </div>
                    </div>

                    {/* Reporter's photo */}
                    {photoUrl && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                                <ImageIcon className="w-4 h-4 text-primary" />
                                صورة البلاغ
                            </div>
                            <img
                                src={photoUrl}
                                alt="صورة البلاغ"
                                className="w-full rounded-xl object-cover max-h-64"
                            />
                        </div>
                    )}

                    {/* No photo placeholder — only shown if upload was attempted but signed URL failed */}
                    {trackData.reporter_image_url && !photoUrl && (
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center gap-3 text-gray-400">
                            <ImageIcon className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">الصورة غير متاحة مؤقتاً</span>
                        </div>
                    )}

                    {/* Footer action */}
                    <div className="pb-8 pt-2 flex flex-col gap-3">
                        <Link
                            to="/portal"
                            className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" />
                            تقديم بلاغ جديد
                        </Link>
                        <p className="text-center text-xs text-gray-400">
                            احتفظ بهذا الرابط لمتابعة حالة بلاغك في أي وقت
                        </p>
                    </div>

                </div>
            </div>
        </div>
    )
}
