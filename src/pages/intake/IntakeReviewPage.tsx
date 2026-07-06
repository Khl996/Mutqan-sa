import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from '@/hooks/useTenantQuery'
import {
    useIntakeDrafts,
    useIntakeMessages,
    useIntakeStats,
    useApproveIntakeDraft,
    useRejectIntakeDraft,
    useMergeIntakeDraft,
    useCreateManualIntakeDraft,
    type IntakeDraft,
    type IntakeMessage,
} from '@/hooks/useIntake'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import {
    MessageSquareText,
    CheckCircle2,
    XCircle,
    GitMerge,
    Inbox,
    Clock,
    Search,
    ChevronDown,
    ChevronUp,
    User,
    Users,
    RotateCcw,
    Paperclip,
    ExternalLink,
} from 'lucide-react'

// وارد واتساب — review queue for intake drafts (Hospital Lite).
// Every action goes through the intake_* RPCs; approval reuses the existing
// audited work-order creation path server-side.

const PRIORITY_META: Record<string, { label: string; className: string }> = {
    urgent: { label: 'عاجلة', className: 'bg-red-100 text-red-700 border-red-200' },
    high: { label: 'عالية', className: 'bg-orange-100 text-orange-700 border-orange-200' },
    medium: { label: 'متوسطة', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    low: { label: 'منخفضة', className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const REVIEW_STATUS_META: Record<string, { label: string; className: string }> = {
    approved: { label: 'معتمد', className: 'bg-green-100 text-green-700 border-green-200' },
    rejected: { label: 'متجاهل', className: 'bg-gray-100 text-gray-600 border-gray-200' },
    merged: { label: 'مدموج', className: 'bg-purple-100 text-purple-700 border-purple-200' },
}

const SOURCE_LABELS: Record<string, string> = {
    whatsapp: 'واتساب',
    form: 'نموذج',
    email: 'بريد',
    manual: 'يدوي',
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—'
    return new Date(value).toLocaleString('ar-SA', {
        dateStyle: 'short',
        timeStyle: 'short',
    })
}

interface OpenWorkOrderOption {
    id: string
    code: string
    title: string
    status: string
}

function MergeDialog({
    draft,
    onClose,
    onMerged,
}: {
    draft: IntakeDraft
    onClose: () => void
    onMerged: () => void
}) {
    const tenantId = useCurrentTenantId()
    const [search, setSearch] = useState('')
    const [results, setResults] = useState<OpenWorkOrderOption[]>([])
    const [searching, setSearching] = useState(false)
    const [selected, setSelected] = useState<OpenWorkOrderOption | null>(null)
    const mergeMutation = useMergeIntakeDraft()

    const runSearch = async (term: string) => {
        setSearching(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase.from('work_orders') as any)
                .select('id, code, title, status')
                .in('status', [
                    'pending',
                    'assigned',
                    'in_progress',
                    'pending_supervisor_approval',
                    'pending_engineer_review',
                    'pending_reporter_closure',
                    'rejected_by_technician',
                ])
            if (tenantId) query = query.eq('tenant_id', tenantId)
            if (term.trim()) query = query.or(`title.ilike.%${term.trim()}%,code.ilike.%${term.trim()}%`)

            const { data, error } = await query.order('created_at', { ascending: false }).limit(15)
            if (error) throw error
            setResults((data ?? []) as OpenWorkOrderOption[])
        } catch {
            toast.error('تعذر البحث في أوامر العمل')
        } finally {
            setSearching(false)
        }
    }

    const handleMerge = () => {
        if (!selected) return
        mergeMutation.mutate(
            { draftId: draft.id, workOrderId: selected.id },
            {
                onSuccess: () => {
                    toast.success(`تم دمج البلاغ مع أمر العمل ${selected.code}`)
                    onMerged()
                },
                onError: (err) => toast.error(err.message || 'تعذر تنفيذ الدمج'),
            }
        )
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="font-cairo max-w-lg" dir="rtl">
                <DialogHeader>
                    <DialogTitle>دمج مع أمر عمل قائم</DialogTitle>
                    <DialogDescription>
                        سيُضاف نص الرسالة الأصلية كملاحظة على أمر العمل المختار، وتُغلق هذه المسودة كمدموجة.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && runSearch(search)}
                            placeholder="ابحث بعنوان أو رقم أمر العمل..."
                            className="w-full border border-border rounded-lg py-2 pr-9 pl-3 text-sm bg-background"
                        />
                    </div>
                    <button
                        onClick={() => runSearch(search)}
                        disabled={searching}
                        className="w-full py-2 text-sm border border-border rounded-lg hover:bg-muted/10"
                    >
                        {searching ? 'جارٍ البحث...' : 'بحث في أوامر العمل المفتوحة'}
                    </button>

                    <div className="max-h-56 overflow-y-auto space-y-2">
                        {results.map((wo) => (
                            <button
                                key={wo.id}
                                onClick={() => setSelected(wo)}
                                className={`w-full text-right p-3 rounded-lg border text-sm transition-colors ${
                                    selected?.id === wo.id
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:bg-muted/10'
                                }`}
                            >
                                <span className="font-mono text-xs text-muted-foreground ml-2">{wo.code}</span>
                                <span className="font-semibold">{wo.title}</span>
                            </button>
                        ))}
                        {!searching && results.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                اضغط "بحث" لعرض أوامر العمل المفتوحة
                            </p>
                        )}
                    </div>

                    <button
                        onClick={handleMerge}
                        disabled={!selected || mergeMutation.isPending}
                        className="w-full py-2.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50"
                    >
                        {mergeMutation.isPending ? 'جارٍ الدمج...' : selected ? `دمج مع ${selected.code}` : 'اختر أمر عمل أولاً'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function OriginalMessage({ message }: { message: IntakeMessage | undefined }) {
    const [expanded, setExpanded] = useState(false)
    if (!message) return null

    return (
        <div className="bg-muted/10 rounded-lg border border-border">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground"
            >
                <span className="flex items-center gap-1">
                    <MessageSquareText className="w-3.5 h-3.5" />
                    النص الأصلي للرسالة
                </span>
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {expanded && (
                <div className="px-3 pb-3 space-y-2">
                    <p className="text-sm whitespace-pre-wrap">{message.message_text}</p>
                    {message.media_urls.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {message.media_urls.map((url, i) => (
                                <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                    <Paperclip className="w-3 h-3" />
                                    مرفق {i + 1}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function SenderLine({ message }: { message: IntakeMessage | undefined }) {
    if (!message) return null
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {message.sender_name || 'غير معروف'}
            </span>
            {message.group_name && (
                <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {message.group_name}
                </span>
            )}
            <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDateTime(message.sent_at || message.created_at)}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                {SOURCE_LABELS[message.source] ?? message.source}
            </span>
        </div>
    )
}

export default function IntakeReviewPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [tab, setTab] = useState<'pending' | 'processed' | 'recovery'>('pending')
    const [rejectTarget, setRejectTarget] = useState<IntakeDraft | null>(null)
    const [approveTarget, setApproveTarget] = useState<IntakeDraft | null>(null)
    const [mergeTarget, setMergeTarget] = useState<IntakeDraft | null>(null)

    const { data: pendingDrafts, isLoading: pendingLoading } = useIntakeDrafts('pending')
    const { data: allDrafts } = useIntakeDrafts('all')
    const { data: recoveryMessages, isLoading: recoveryLoading } = useIntakeMessages(['ignored', 'failed'])
    const { data: stats } = useIntakeStats()

    const approveMutation = useApproveIntakeDraft()
    const rejectMutation = useRejectIntakeDraft()
    const manualDraftMutation = useCreateManualIntakeDraft()

    const processedDrafts = useMemo(
        () => (allDrafts ?? []).filter((d) => d.review_status !== 'pending'),
        [allDrafts]
    )

    const handleApprove = () => {
        if (!approveTarget) return
        approveMutation.mutate(
            { draftId: approveTarget.id },
            {
                onSuccess: (result) => {
                    toast.success(`تم اعتماد البلاغ وإنشاء أمر العمل ${result.code}`)
                    setApproveTarget(null)
                },
                onError: (err) => {
                    toast.error(err.message || 'تعذر اعتماد المسودة')
                    setApproveTarget(null)
                },
            }
        )
    }

    const handleReject = () => {
        if (!rejectTarget) return
        rejectMutation.mutate(rejectTarget.id, {
            onSuccess: () => {
                toast.success('تم تجاهل البلاغ')
                setRejectTarget(null)
            },
            onError: (err) => {
                toast.error(err.message || 'تعذر تجاهل المسودة')
                setRejectTarget(null)
            },
        })
    }

    const handleRecover = (message: IntakeMessage) => {
        manualDraftMutation.mutate(message.id, {
            onSuccess: () => {
                toast.success('تم تحويل الرسالة إلى مسودة للمراجعة')
                setTab('pending')
            },
            onError: (err) => toast.error(err.message || 'تعذر تحويل الرسالة'),
        })
    }

    const tabs = [
        { key: 'pending' as const, label: 'بانتظار المراجعة', count: stats?.pending ?? pendingDrafts?.length ?? 0 },
        { key: 'processed' as const, label: 'المعالجة', count: processedDrafts.length },
        { key: 'recovery' as const, label: 'المتجاهلة والفاشلة', count: recoveryMessages?.length ?? 0 },
    ]

    return (
        <div className="container max-w-5xl mx-auto p-6 space-y-6 font-cairo" dir={isRTL ? 'rtl' : 'ltr'}>
            <div>
                <h1 className="text-3xl font-bold mb-2">وارد واتساب</h1>
                <p className="text-muted-foreground">
                    ملاحظات الصيانة الواردة من قنوات الالتقاط الخارجية — راجعها واعتمدها قبل إنشاء أي أمر عمل.
                </p>
            </div>

            {/* Counters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Inbox className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold leading-none">{stats?.pending ?? '—'}</p>
                        <p className="text-xs text-muted-foreground mt-1">بانتظار المراجعة</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold leading-none">{stats?.convertedThisWeek ?? '—'}</p>
                        <p className="text-xs text-muted-foreground mt-1">محوّلة هذا الأسبوع</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <XCircle className="w-5 h-5 text-gray-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold leading-none">{stats?.ignoredThisWeek ?? '—'}</p>
                        <p className="text-xs text-muted-foreground mt-1">متجاهلة هذا الأسبوع</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                            tab === t.key
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t.label}
                        <span className="mr-1.5 px-1.5 py-0.5 rounded-full bg-muted/20 text-xs">{t.count}</span>
                    </button>
                ))}
            </div>

            {/* Pending drafts */}
            {tab === 'pending' && (
                <div className="space-y-4">
                    {pendingLoading && <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p>}
                    {!pendingLoading && (pendingDrafts?.length ?? 0) === 0 && (
                        <div className="bg-card rounded-xl border-2 border-dashed border-border p-12 text-center">
                            <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                            <p className="font-bold">لا توجد بلاغات بانتظار المراجعة</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                البلاغات الجديدة الواردة من واتساب ستظهر هنا تلقائياً.
                            </p>
                        </div>
                    )}
                    {pendingDrafts?.map((draft) => {
                        const priority = PRIORITY_META[draft.suggested_priority] ?? PRIORITY_META.medium
                        return (
                            <div key={draft.id} className="bg-card rounded-xl border border-border p-5 space-y-3 shadow-sm">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="space-y-1">
                                        <h3 className="font-bold text-lg">{draft.suggested_title}</h3>
                                        <SenderLine message={draft.message} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded-md border text-xs font-semibold ${priority.className}`}>
                                            {priority.label}
                                        </span>
                                        {draft.suggested_category && (
                                            <span className="px-2 py-1 rounded-md border border-border text-xs text-muted-foreground">
                                                {draft.suggested_category}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {draft.suggested_description && (
                                    <p className="text-sm text-foreground/90">{draft.suggested_description}</p>
                                )}
                                {draft.suggested_location && (
                                    <p className="text-xs text-muted-foreground">الموقع: {draft.suggested_location}</p>
                                )}

                                <OriginalMessage message={draft.message} />

                                <div className="flex gap-2 pt-1 flex-wrap">
                                    <button
                                        onClick={() => setApproveTarget(draft)}
                                        disabled={approveMutation.isPending}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                        اعتماد
                                    </button>
                                    <button
                                        onClick={() => setMergeTarget(draft)}
                                        className="flex items-center gap-1.5 px-4 py-2 border border-purple-200 text-purple-700 rounded-lg text-sm font-bold hover:bg-purple-50"
                                    >
                                        <GitMerge className="w-4 h-4" />
                                        دمج
                                    </button>
                                    <button
                                        onClick={() => setRejectTarget(draft)}
                                        disabled={rejectMutation.isPending}
                                        className="flex items-center gap-1.5 px-4 py-2 border border-border text-muted-foreground rounded-lg text-sm font-bold hover:bg-muted/10 disabled:opacity-50"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        تجاهل
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Processed drafts (audit) */}
            {tab === 'processed' && (
                <div className="space-y-3">
                    {processedDrafts.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">لا توجد بلاغات معالجة بعد.</p>
                    )}
                    {processedDrafts.map((draft) => {
                        const meta = REVIEW_STATUS_META[draft.review_status]
                        return (
                            <div key={draft.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="space-y-1">
                                        <h3 className="font-bold">{draft.suggested_title}</h3>
                                        <SenderLine message={draft.message} />
                                    </div>
                                    <span className={`px-2 py-1 rounded-md border text-xs font-semibold ${meta?.className ?? ''}`}>
                                        {meta?.label ?? draft.review_status}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    <span>
                                        بواسطة: {draft.reviewer?.full_name_ar || draft.reviewer?.full_name || '—'}
                                    </span>
                                    <span>بتاريخ: {formatDateTime(draft.reviewed_at)}</span>
                                    {draft.created_work_order_id && (
                                        <Link
                                            to={`/work-orders/${draft.created_work_order_id}`}
                                            className="flex items-center gap-1 text-primary hover:underline"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                            أمر العمل المرتبط
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Recovery: ignored / failed messages */}
            {tab === 'recovery' && (
                <div className="space-y-3">
                    {recoveryLoading && <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p>}
                    {!recoveryLoading && (recoveryMessages?.length ?? 0) === 0 && (
                        <p className="text-center text-muted-foreground py-8">
                            لا توجد رسائل متجاهلة أو فاشلة التصنيف.
                        </p>
                    )}
                    {recoveryMessages?.map((message) => (
                        <div key={message.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <p className="text-sm whitespace-pre-wrap flex-1">{message.message_text}</p>
                                <span
                                    className={`px-2 py-1 rounded-md border text-xs font-semibold shrink-0 ${
                                        message.status === 'failed'
                                            ? 'bg-red-50 text-red-700 border-red-200'
                                            : 'bg-gray-100 text-gray-600 border-gray-200'
                                    }`}
                                >
                                    {message.status === 'failed' ? 'فشل التصنيف' : 'متجاهلة'}
                                </span>
                            </div>
                            <SenderLine message={message} />
                            {message.failure_reason && (
                                <p className="text-xs text-red-600/80">{message.failure_reason}</p>
                            )}
                            <button
                                onClick={() => handleRecover(message)}
                                disabled={manualDraftMutation.isPending}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-bold hover:bg-muted/10 disabled:opacity-50"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                تحويل إلى مسودة للمراجعة
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Approve confirmation */}
            <ConfirmActionDialog
                open={!!approveTarget}
                onOpenChange={(open) => !open && setApproveTarget(null)}
                title="اعتماد البلاغ"
                description={`سيتم إنشاء أمر عمل جديد بعنوان "${approveTarget?.suggested_title ?? ''}" عبر مسار الإنشاء المعتمد. هل تريد المتابعة؟`}
                confirmLabel="اعتماد وإنشاء أمر العمل"
                cancelLabel="إلغاء"
                onConfirm={handleApprove}
                tone="default"
            />

            {/* Reject confirmation */}
            <ConfirmActionDialog
                open={!!rejectTarget}
                onOpenChange={(open) => !open && setRejectTarget(null)}
                title="تجاهل البلاغ"
                description="سيتم وضع هذا البلاغ ضمن المتجاهلة. يمكنك استعادته لاحقاً من تبويب المتجاهلة والفاشلة."
                confirmLabel="تجاهل"
                cancelLabel="إلغاء"
                onConfirm={handleReject}
            />

            {/* Merge dialog */}
            {mergeTarget && (
                <MergeDialog
                    draft={mergeTarget}
                    onClose={() => setMergeTarget(null)}
                    onMerged={() => setMergeTarget(null)}
                />
            )}
        </div>
    )
}
