import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    ExternalLink,
    Filter,
    MapPin,
    Plus,
    SearchCheck,
    Sparkles,
    UserRound,
    Wrench,
} from 'lucide-react'
import { useDepartments } from '@/hooks/useFacilities'
import {
    useAddRoundObservation,
    useCompleteRound,
    useConvertRoundObservation,
    useCreateRound,
    useRounds,
    type Round,
    type RoundObservation,
    type RoundType,
} from '@/hooks/useRounds'
import { cn } from '@/lib/utils'

const ROUND_TYPES: Record<RoundType, { label: string; className: string; Icon: typeof Wrench }> = {
    maintenance: {
        label: 'صيانة',
        className: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        Icon: Wrench,
    },
    cleaning: {
        label: 'نظافة',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Icon: Sparkles,
    },
}

const STATUS_META = {
    in_progress: {
        label: 'قيد الجولة',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    completed: {
        label: 'مكتملة',
        className: 'bg-green-50 text-green-700 border-green-200',
    },
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return '-'
    return new Date(value).toLocaleString('ar-SA', {
        dateStyle: 'short',
        timeStyle: 'short',
    })
}

function durationLabel(round: Round) {
    if (!round.completed_at) return '-'
    const started = new Date(round.started_at).getTime()
    const completed = new Date(round.completed_at).getTime()
    const minutes = Math.max(1, Math.round((completed - started) / 60000))
    if (minutes < 60) return `${minutes} د`
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${hours} س ${rest} د` : `${hours} س`
}

function displayName(value?: { name: string; name_ar: string | null } | null) {
    if (!value) return '-'
    return value.name_ar || value.name
}

function supervisorName(round: Round) {
    return round.supervisor?.full_name_ar || round.supervisor?.full_name || round.supervisor?.email || '-'
}

function typeMeta(type: RoundType) {
    return ROUND_TYPES[type] ?? ROUND_TYPES.maintenance
}

function RoundSummaryCard({
    round,
    selected,
    onSelect,
}: {
    round: Round
    selected: boolean
    onSelect: () => void
}) {
    const meta = typeMeta(round.round_type)
    const status = STATUS_META[round.status]
    const observationCount = round.observations?.length ?? 0
    const needsWorkOrderCount = round.observations?.filter((obs) => obs.needs_work_order).length ?? 0
    const Icon = meta.Icon

    return (
        <button
            onClick={onSelect}
            className={cn(
                'w-full text-right rounded-lg border bg-card p-4 transition-colors',
                selected ? 'border-primary shadow-sm' : 'border-border hover:border-primary/50'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold', meta.className)}>
                            <Icon className="h-3.5 w-3.5" />
                            {meta.label}
                        </span>
                        <span className={cn('rounded-md border px-2 py-1 text-xs font-bold', status.className)}>
                            {status.label}
                        </span>
                    </div>
                    <p className="font-bold text-foreground truncate">{supervisorName(round)}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(round.started_at)}
                        </span>
                        {round.completed_at && (
                            <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {formatDateTime(round.completed_at)}
                            </span>
                        )}
                    </div>
                </div>
                <div className="shrink-0 text-left">
                    <p className="text-2xl font-bold leading-none">{observationCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">ملاحظة</p>
                    {needsWorkOrderCount > 0 && (
                        <p className="mt-2 text-xs font-bold text-primary">{needsWorkOrderCount} لأمر عمل</p>
                    )}
                </div>
            </div>
        </button>
    )
}

function ObservationRow({
    observation,
    canConvert,
    onConvert,
    converting,
}: {
    observation: RoundObservation
    canConvert: boolean
    onConvert: () => void
    converting: boolean
}) {
    return (
        <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                    <p className="font-semibold leading-7">{observation.observation_text}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {displayName(observation.location)}
                        </span>
                        <span>{formatDateTime(observation.created_at)}</span>
                    </div>
                </div>
                {observation.needs_work_order && (
                    <span className="shrink-0 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700">
                        تحتاج أمر عمل
                    </span>
                )}
            </div>

            {observation.action_taken && (
                <p className="rounded-md bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {observation.action_taken}
                </p>
            )}

            {observation.needs_work_order && (
                <div className="flex flex-wrap gap-2">
                    {observation.created_work_order_id ? (
                        <Link
                            to={`/work-orders/${observation.created_work_order_id}`}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary/90"
                        >
                            <ExternalLink className="h-4 w-4" />
                            فتح أمر العمل
                        </Link>
                    ) : (
                        <button
                            onClick={onConvert}
                            disabled={!canConvert || converting}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                            <SearchCheck className="h-4 w-4" />
                            تحويل لأمر عمل
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

export default function RoundsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const [typeFilter, setTypeFilter] = useState<RoundType | 'all'>('all')
    const [dateFilter, setDateFilter] = useState('')
    const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
    const [newRoundType, setNewRoundType] = useState<RoundType>('maintenance')
    const [locationId, setLocationId] = useState('')
    const [observationText, setObservationText] = useState('')
    const [actionTaken, setActionTaken] = useState('')
    const [needsWorkOrder, setNeedsWorkOrder] = useState(true)
    const [summary, setSummary] = useState('')

    const { data: rounds, isLoading } = useRounds({ type: typeFilter, date: dateFilter })
    const { data: departments, isLoading: locationsLoading } = useDepartments()
    const createRoundMutation = useCreateRound()
    const addObservationMutation = useAddRoundObservation()
    const completeRoundMutation = useCompleteRound()
    const convertMutation = useConvertRoundObservation()

    const activeDepartments = useMemo(
        () => (departments ?? []).filter((department) => department.is_active),
        [departments]
    )

    const selectedRound = useMemo(
        () => (rounds ?? []).find((round) => round.id === selectedRoundId) ?? rounds?.[0] ?? null,
        [rounds, selectedRoundId]
    )

    useEffect(() => {
        if (!selectedRoundId && rounds?.[0]) {
            setSelectedRoundId(rounds[0].id)
        }
    }, [rounds, selectedRoundId])

    useEffect(() => {
        if (!locationId && activeDepartments[0]) {
            setLocationId(activeDepartments[0].id)
        }
    }, [activeDepartments, locationId])

    const handleStartRound = () => {
        createRoundMutation.mutate(newRoundType, {
            onSuccess: (round) => {
                setSelectedRoundId(round.id)
                setSummary('')
                toast.success('تم بدء الجولة')
            },
            onError: (error) => toast.error(error.message || 'تعذر بدء الجولة'),
        })
    }

    const handleAddObservation = () => {
        if (!selectedRound) return
        if (!locationId || !observationText.trim()) {
            toast.error('أكمل الموقع والملاحظة')
            return
        }

        addObservationMutation.mutate(
            {
                roundId: selectedRound.id,
                locationId,
                observationText: observationText.trim(),
                actionTaken: actionTaken.trim() || undefined,
                needsWorkOrder,
            },
            {
                onSuccess: () => {
                    setObservationText('')
                    setActionTaken('')
                    setNeedsWorkOrder(true)
                    toast.success('تمت إضافة الملاحظة')
                },
                onError: (error) => toast.error(error.message || 'تعذر إضافة الملاحظة'),
            }
        )
    }

    const handleCompleteRound = () => {
        if (!selectedRound) return
        completeRoundMutation.mutate(
            { roundId: selectedRound.id, summary: summary.trim() || undefined },
            {
                onSuccess: () => toast.success('تم إكمال الجولة'),
                onError: (error) => toast.error(error.message || 'تعذر إكمال الجولة'),
            }
        )
    }

    const handleConvertObservation = (observation: RoundObservation) => {
        convertMutation.mutate(observation.id, {
            onSuccess: (result) => toast.success(`تم إنشاء أمر العمل ${result.code}`),
            onError: (error) => toast.error(error.message || 'تعذر تحويل الملاحظة'),
        })
    }

    const selectedIsOpen = selectedRound?.status === 'in_progress'
    const selectedMeta = selectedRound ? typeMeta(selectedRound.round_type) : null
    const selectedStatus = selectedRound ? STATUS_META[selectedRound.status] : null
    const observations = selectedRound?.observations ?? []

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 pb-20 font-cairo md:p-6" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold md:text-3xl">الجولات</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <ClipboardCheck className="h-4 w-4" />
                            جولات المشرفين
                        </span>
                        {selectedRound?.completed_at && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 font-bold text-green-700">
                                <CheckCircle2 className="h-4 w-4" />
                                اكتملت خلال {durationLabel(selectedRound)}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border bg-card p-1">
                        {(['all', 'maintenance', 'cleaning'] as const).map((item) => {
                            const active = typeFilter === item
                            const label = item === 'all' ? 'الكل' : ROUND_TYPES[item].label
                            return (
                                <button
                                    key={item}
                                    onClick={() => setTypeFilter(item)}
                                    className={cn(
                                        'min-h-9 rounded-md px-3 text-sm font-bold transition-colors',
                                        active ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted/20'
                                    )}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>
                    <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={(event) => setDateFilter(event.target.value)}
                            className="bg-transparent outline-none"
                        />
                    </label>
                    {dateFilter && (
                        <button
                            onClick={() => setDateFilter('')}
                            className="min-h-11 rounded-lg border border-border px-3 text-sm font-bold hover:bg-muted/10"
                        >
                            مسح
                        </button>
                    )}
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
                <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="font-bold">جولة جديدة</h2>
                            <span className="rounded-md bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
                                جوال
                            </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                            {(['maintenance', 'cleaning'] as RoundType[]).map((item) => {
                                const meta = typeMeta(item)
                                const Icon = meta.Icon
                                const active = newRoundType === item
                                return (
                                    <button
                                        key={item}
                                        onClick={() => setNewRoundType(item)}
                                        className={cn(
                                            'flex min-h-14 items-center justify-center gap-2 rounded-lg border text-sm font-bold transition-colors',
                                            active ? 'border-primary bg-primary text-white' : 'border-border hover:bg-muted/10'
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {meta.label}
                                    </button>
                                )
                            })}
                        </div>

                        <button
                            onClick={handleStartRound}
                            disabled={createRoundMutation.isPending}
                            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                            <Plus className="h-4 w-4" />
                            {createRoundMutation.isPending ? 'جاري البدء...' : 'بدء الجولة'}
                        </button>
                    </div>

                    <div className="space-y-2">
                        {isLoading && (
                            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                                جاري التحميل...
                            </div>
                        )}
                        {!isLoading && (rounds?.length ?? 0) === 0 && (
                            <div className="rounded-lg border-2 border-dashed border-border bg-card p-8 text-center">
                                <ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                                <p className="font-bold">لا توجد جولات</p>
                            </div>
                        )}
                        {rounds?.map((round) => (
                            <RoundSummaryCard
                                key={round.id}
                                round={round}
                                selected={selectedRound?.id === round.id}
                                onSelect={() => setSelectedRoundId(round.id)}
                            />
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    {!selectedRound && (
                        <div className="rounded-lg border-2 border-dashed border-border bg-card p-10 text-center">
                            <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                            <p className="font-bold">اختر جولة</p>
                        </div>
                    )}

                    {selectedRound && selectedMeta && selectedStatus && (
                        <>
                            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold', selectedMeta.className)}>
                                                <selectedMeta.Icon className="h-3.5 w-3.5" />
                                                {selectedMeta.label}
                                            </span>
                                            <span className={cn('rounded-md border px-2 py-1 text-xs font-bold', selectedStatus.className)}>
                                                {selectedStatus.label}
                                            </span>
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold">{supervisorName(selectedRound)}</h2>
                                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                                <span className="inline-flex items-center gap-1">
                                                    <CalendarDays className="h-4 w-4" />
                                                    {formatDateTime(selectedRound.started_at)}
                                                </span>
                                                {selectedRound.completed_at && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <CheckCircle2 className="h-4 w-4" />
                                                        {formatDateTime(selectedRound.completed_at)}
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center gap-1">
                                                    <UserRound className="h-4 w-4" />
                                                    {observations.length} ملاحظات
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedRound.completed_at && (
                                        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
                                            <p className="text-xs font-bold">وقت الإكمال</p>
                                            <p className="mt-1 font-bold">{formatDateTime(selectedRound.completed_at)}</p>
                                        </div>
                                    )}
                                </div>

                                {selectedRound.summary && (
                                    <p className="mt-4 rounded-lg bg-muted/20 p-3 text-sm leading-7 text-muted-foreground">
                                        {selectedRound.summary}
                                    </p>
                                )}
                            </div>

                            {selectedIsOpen && (
                                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                                    <h3 className="font-bold">إضافة ملاحظة</h3>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                        <label className="space-y-1 md:col-span-2">
                                            <span className="text-xs font-bold text-muted-foreground">الموقع</span>
                                            <select
                                                value={locationId}
                                                onChange={(event) => setLocationId(event.target.value)}
                                                disabled={locationsLoading}
                                                className="min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                                            >
                                                {activeDepartments.map((department) => (
                                                    <option key={department.id} value={department.id}>
                                                        {displayName(department)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="space-y-1 md:col-span-2">
                                            <span className="text-xs font-bold text-muted-foreground">الملاحظة</span>
                                            <textarea
                                                value={observationText}
                                                onChange={(event) => setObservationText(event.target.value)}
                                                rows={3}
                                                placeholder="مثال: تسريب خفيف تحت المغسلة"
                                                className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                                            />
                                        </label>

                                        <label className="space-y-1 md:col-span-2">
                                            <span className="text-xs font-bold text-muted-foreground">الإجراء أثناء الجولة</span>
                                            <input
                                                value={actionTaken}
                                                onChange={(event) => setActionTaken(event.target.value)}
                                                placeholder="مثال: تم عزل المنطقة وإبلاغ المناوب"
                                                className="min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                                            />
                                        </label>

                                        <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-background px-3 text-sm font-bold">
                                            <input
                                                type="checkbox"
                                                checked={needsWorkOrder}
                                                onChange={(event) => setNeedsWorkOrder(event.target.checked)}
                                                className="h-5 w-5 accent-primary"
                                            />
                                            تحتاج أمر عمل؟
                                        </label>

                                        <button
                                            onClick={handleAddObservation}
                                            disabled={addObservationMutation.isPending}
                                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            <Plus className="h-4 w-4" />
                                            {addObservationMutation.isPending ? 'جاري الإضافة...' : 'إضافة'}
                                        </button>
                                    </div>

                                    <div className="mt-5 space-y-2 border-t border-border pt-4">
                                        <label className="space-y-1">
                                            <span className="text-xs font-bold text-muted-foreground">ملخص الإكمال</span>
                                            <textarea
                                                value={summary}
                                                onChange={(event) => setSummary(event.target.value)}
                                                rows={2}
                                                className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                                            />
                                        </label>
                                        <button
                                            onClick={handleCompleteRound}
                                            disabled={completeRoundMutation.isPending || observations.length === 0}
                                            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                            {completeRoundMutation.isPending ? 'جاري الإكمال...' : 'إكمال الجولة'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="font-bold">الملاحظات</h3>
                                    <span className="rounded-md bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
                                        {observations.length}
                                    </span>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {observations.length === 0 && (
                                        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                                            لا توجد ملاحظات بعد
                                        </div>
                                    )}
                                    {observations.map((observation) => (
                                        <ObservationRow
                                            key={observation.id}
                                            observation={observation}
                                            canConvert
                                            converting={convertMutation.isPending}
                                            onConvert={() => handleConvertObservation(observation)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

