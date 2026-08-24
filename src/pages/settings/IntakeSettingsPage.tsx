import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    useIntakeSources,
    useCreateIntakeSource,
    useUpdateIntakeSource,
    useRegenerateIntakeSecret,
    type IntakeSourceConfig,
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
    Inbox,
    KeyRound,
    Copy,
    Plus,
    Trash2,
    Power,
    Save,
    ShieldAlert,
} from 'lucide-react'

// إعدادات الوارد — intake capture-source configuration.
// The capture layer polls GET /api/intake/config, so every change here
// (allowlist, phone, kill switch) applies within one poll cycle without
// server access. Secrets are shown exactly once on create/regenerate.

const SOURCE_TYPE_LABELS: Record<string, string> = {
    whatsapp_baileys: 'واتساب (خدمة التقاط خاصة)',
    whatsapp_cloud: 'واتساب (واجهة رسمية)',
    form: 'نموذج',
    email: 'بريد إلكتروني',
}

function SecretRevealDialog({ secret, onClose }: { secret: string; onClose: () => void }) {
    const handleCopy = () => {
        navigator.clipboard.writeText(secret)
        toast.success('تم نسخ المفتاح')
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="font-cairo max-w-md" dir="rtl">
                <DialogHeader>
                    <DialogTitle>مفتاح الوارد الجديد</DialogTitle>
                    <DialogDescription>
                        انسخ هذا المفتاح الآن وضعه في خدمة الالتقاط الخارجية — لن يظهر مرة أخرى بعد إغلاق هذه النافذة.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                    <code className="text-xs break-all select-all flex-1">{secret}</code>
                </div>
                <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90"
                >
                    <Copy className="w-4 h-4" />
                    نسخ المفتاح
                </button>
            </DialogContent>
        </Dialog>
    )
}

function SourceCard({
    source,
    onSecretRevealed,
}: {
    source: IntakeSourceConfig
    onSecretRevealed: (secret: string) => void
}) {
    const [displayName, setDisplayName] = useState(source.display_name)
    const [phoneNumber, setPhoneNumber] = useState(source.phone_number ?? '')
    const [groups, setGroups] = useState(source.allowed_groups)
    const [newGroupName, setNewGroupName] = useState('')
    const [newGroupJid, setNewGroupJid] = useState('')
    const [confirmRegenerate, setConfirmRegenerate] = useState(false)

    const updateMutation = useUpdateIntakeSource()
    const regenerateMutation = useRegenerateIntakeSecret()

    const isWhatsApp = source.source_type.startsWith('whatsapp')

    const handleToggleActive = () => {
        updateMutation.mutate(
            { sourceId: source.id, isActive: !source.is_active },
            {
                onSuccess: () =>
                    toast.success(
                        source.is_active
                            ? 'تم إيقاف الوارد — ستتوقف خدمة الالتقاط خلال دقيقة'
                            : 'تم تفعيل الوارد'
                    ),
                onError: (err) => toast.error(err.message || 'تعذر تحديث الحالة'),
            }
        )
    }

    const handleSave = () => {
        updateMutation.mutate(
            {
                sourceId: source.id,
                displayName: displayName.trim() || undefined,
                phoneNumber,
                allowedGroups: groups,
            },
            {
                onSuccess: () => toast.success('تم حفظ إعدادات المصدر'),
                onError: (err) => toast.error(err.message || 'تعذر حفظ الإعدادات'),
            }
        )
    }

    const handleAddGroup = () => {
        const name = newGroupName.trim()
        const jid = newGroupJid.trim()
        if (!name || !jid) {
            toast.error('أدخل اسم المجموعة ومعرّفها (JID)')
            return
        }
        if (groups.some((g) => g.jid === jid)) {
            toast.error('هذه المجموعة مضافة مسبقاً')
            return
        }
        setGroups([...groups, { jid, name }])
        setNewGroupName('')
        setNewGroupJid('')
    }

    const handleRegenerate = () => {
        regenerateMutation.mutate(source.id, {
            onSuccess: (result) => onSecretRevealed(result.secret),
            onError: (err) => toast.error(err.message || 'تعذر توليد مفتاح جديد'),
        })
        setConfirmRegenerate(false)
    }

    return (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="font-bold text-lg">{source.display_name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {SOURCE_TYPE_LABELS[source.source_type] ?? source.source_type}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            source.is_active
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                    >
                        <span
                            className={`w-2 h-2 rounded-full ${source.is_active ? 'bg-green-500' : 'bg-gray-400'}`}
                        />
                        {source.is_active ? 'متصل' : 'موقف'}
                    </span>
                    <button
                        onClick={handleToggleActive}
                        disabled={updateMutation.isPending}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                            source.is_active
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                    >
                        <Power className="w-3.5 h-3.5" />
                        {source.is_active ? 'إيقاف الاستقبال' : 'تفعيل الاستقبال'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold mb-1.5">اسم المصدر</label>
                    <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full border border-border rounded-lg py-2 px-3 text-sm bg-background"
                    />
                </div>
                {isWhatsApp && (
                    <div>
                        <label className="block text-sm font-semibold mb-1.5">رقم الجوال</label>
                        <input
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="+9665xxxxxxxx"
                            dir="ltr"
                            className="w-full border border-border rounded-lg py-2 px-3 text-sm bg-background text-left"
                        />
                    </div>
                )}
            </div>

            {isWhatsApp && (
                <div className="space-y-3">
                    <div>
                        <h4 className="text-sm font-semibold">المجموعات المسموح بها</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            تُلتقط الرسائل من هذه المجموعات فقط. خدمة الالتقاط تسجّل معرّفات (JID) المجموعات
                            الجديدة التي تراها لتسهيل نسخها هنا.
                        </p>
                    </div>

                    {groups.length > 0 && (
                        <div className="space-y-2">
                            {groups.map((group) => (
                                <div
                                    key={group.jid}
                                    className="flex items-center justify-between gap-2 p-2.5 bg-muted/10 rounded-lg border border-border"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold truncate">{group.name}</p>
                                        <p className="text-xs text-muted-foreground font-mono truncate" dir="ltr">
                                            {group.jid}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setGroups(groups.filter((g) => g.jid !== group.jid))}
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg shrink-0"
                                        title="إزالة المجموعة"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="اسم المجموعة"
                            className="flex-1 border border-border rounded-lg py-2 px-3 text-sm bg-background"
                        />
                        <input
                            value={newGroupJid}
                            onChange={(e) => setNewGroupJid(e.target.value)}
                            placeholder="xxxxx@g.us"
                            dir="ltr"
                            className="flex-1 border border-border rounded-lg py-2 px-3 text-sm bg-background text-left font-mono"
                        />
                        <button
                            onClick={handleAddGroup}
                            className="flex items-center justify-center gap-1.5 px-4 py-2 border border-border rounded-lg text-sm font-bold hover:bg-muted/10"
                        >
                            <Plus className="w-4 h-4" />
                            إضافة
                        </button>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border flex-wrap">
                <button
                    onClick={() => setConfirmRegenerate(true)}
                    disabled={regenerateMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 rounded-lg text-sm font-bold hover:bg-amber-50 disabled:opacity-50"
                >
                    <KeyRound className="w-4 h-4" />
                    توليد مفتاح جديد
                </button>
                <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {updateMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
                </button>
            </div>

            <ConfirmActionDialog
                open={confirmRegenerate}
                onOpenChange={setConfirmRegenerate}
                title="توليد مفتاح جديد"
                description="سيتوقف المفتاح الحالي عن العمل فوراً، ويجب تحديث خدمة الالتقاط الخارجية بالمفتاح الجديد. هل تريد المتابعة؟"
                confirmLabel="توليد المفتاح"
                cancelLabel="إلغاء"
                onConfirm={handleRegenerate}
            />
        </div>
    )
}

export default function IntakeSettingsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { data: sources, isLoading } = useIntakeSources()
    const createMutation = useCreateIntakeSource()
    const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
    const [showCreate, setShowCreate] = useState(false)
    const [newName, setNewName] = useState('')
    const [newPhone, setNewPhone] = useState('')
    const [newType, setNewType] = useState<IntakeSourceConfig['source_type']>('whatsapp_baileys')

    const handleCreate = () => {
        if (!newName.trim()) {
            toast.error('أدخل اسم المصدر')
            return
        }
        createMutation.mutate(
            { sourceType: newType, displayName: newName.trim(), phoneNumber: newPhone.trim() || undefined },
            {
                onSuccess: (result) => {
                    setShowCreate(false)
                    setNewName('')
                    setNewPhone('')
                    setRevealedSecret(result.secret)
                    toast.success('تم إنشاء مصدر الوارد')
                },
                onError: (err) => toast.error(err.message || 'تعذر إنشاء المصدر'),
            }
        )
    }

    return (
        <div className="container max-w-4xl mx-auto p-6 space-y-6 font-cairo" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold mb-2">إعدادات الوارد</h1>
                    <p className="text-muted-foreground">
                        إدارة قنوات التقاط البلاغات الواردة (وارد واتساب وغيرها): الرقم، المجموعات المسموح بها،
                        ومفتاح الربط. إيقاف المصدر من هنا يوقف الالتقاط خلال دقيقة دون الحاجة لأي وصول للخادم.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    مصدر جديد
                </button>
            </div>

            {isLoading && <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p>}

            {!isLoading && (sources?.length ?? 0) === 0 && (
                <div className="bg-card rounded-xl border-2 border-dashed border-border p-12 text-center space-y-3">
                    <Inbox className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="font-bold">لا توجد مصادر وارد بعد</p>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        أنشئ مصدراً جديداً للحصول على مفتاح الربط الذي تستخدمه خدمة الالتقاط الخارجية
                        لإرسال البلاغات إلى متقن.
                    </p>
                </div>
            )}

            <div className="space-y-4">
                {sources?.map((source) => (
                    <SourceCard key={source.id} source={source} onSecretRevealed={setRevealedSecret} />
                ))}
            </div>

            {/* Create dialog */}
            {showCreate && (
                <Dialog open onOpenChange={(open) => !open && setShowCreate(false)}>
                    <DialogContent className="font-cairo max-w-md" dir="rtl">
                        <DialogHeader>
                            <DialogTitle>مصدر وارد جديد</DialogTitle>
                            <DialogDescription>
                                بعد الإنشاء سيظهر مفتاح الربط مرة واحدة فقط — انسخه إلى خدمة الالتقاط.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1.5">نوع المصدر</label>
                                <select
                                    value={newType}
                                    onChange={(e) => setNewType(e.target.value as IntakeSourceConfig['source_type'])}
                                    className="w-full border border-border rounded-lg py-2 px-3 text-sm bg-background"
                                >
                                    {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1.5">اسم المصدر</label>
                                <input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="مثال: رقم وارد المستشفى"
                                    className="w-full border border-border rounded-lg py-2 px-3 text-sm bg-background"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1.5">رقم الجوال (اختياري)</label>
                                <input
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    placeholder="+9665xxxxxxxx"
                                    dir="ltr"
                                    className="w-full border border-border rounded-lg py-2 px-3 text-sm bg-background text-left"
                                />
                            </div>
                            <button
                                onClick={handleCreate}
                                disabled={createMutation.isPending}
                                className="w-full py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50"
                            >
                                {createMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء المصدر'}
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* One-time secret reveal */}
            {revealedSecret && (
                <SecretRevealDialog secret={revealedSecret} onClose={() => setRevealedSecret(null)} />
            )}
        </div>
    )
}
