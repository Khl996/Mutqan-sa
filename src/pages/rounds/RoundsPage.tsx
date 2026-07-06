import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
    Users,
    Wrench,
    X,
} from 'lucide-react'
import { useDepartments } from '@/hooks/useFacilities'
import {
    useAddRoundObservation,
    useCompleteRound,
    useConvertRoundObservation,
    useCreateRound,
    useRoundSupervisors,
    useRounds,
    type Round,
    type RoundObservation,
    type RoundType,
} from '@/hooks/useRounds'
import { getTeamPrimarySpecialization, useWorkTeams, type WorkTeam } from '@/hooks/useWorkTeams'
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

const ROUTING_ORDER = ['cleaning', 'electrical', 'plumbing', 'hvac', 'civil', 'general']

function formatDate(value: string | null | undefined) {
    if (!value) return '-'
    return new Date(value).toLocaleDateString('ar-SA', { dateStyle: 'medium' })
}

function formatTime(value: string | null | undefined) {
    if (!value) return '-'
    return new Date(value).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
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

function validRoundType(value: string | null): RoundType | 'all' {
    return value === 'maintenance' || value === 'cleaning' ? value : 'all'
}

function roundCounts(round: Round) {
    const observations = round.observations ?? []
    return {
        observations: observations.length,
        converted: observations.filter((obs) => !!obs.created_work_order_id).length,
        needsWorkOrder: observations.filter((obs) => obs.needs_work_order).length,
    }
}

function sortRoutingTeams(teams: WorkTeam[]) {
    return [...teams].sort((a, b) => {
        const aSpec = getTeamPrimarySpecialization(a)
        const bSpec = getTeamPrimarySpecialization(b)
        return (ROUTING_ORDER.indexOf(aSpec) + 1 || 99) - (ROUTING_ORDER.indexOf(bSpec) + 1 || 99)
            || (a.name_ar || a.name).localeCompare(b.name_ar || b.name, 'ar')
    })
}

function SummaryCard({ label, value, Icon }: { label: string; value: number; Icon: typeof ClipboardCheck }) {
    return (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-2xl font-bold leading-none">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
            </div>
        </div>
    )
}

function RoundCard({
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
    const counts = roundCounts(round)
    const Icon = meta.Icon

    return (
        <button
            onClick={onSelect}
            className={cn(
                'w-full rounded-lg border bg-card p-4 text-right shadow-sm transition-colors hover:border-primary/60',
                selected ? 'border-primary ring-2 ring-primary/10' : 'border-border'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold', meta.className)}>
                            <Icon className="h-3.5 w-3.5" />
                            {meta.label}
                        </span>
                        <span className={cn('rounded-md border px-2 py-1 text-xs font-bold', status.className)}>
                            {status.label}
                        </span>
                    </div>
                    <div>
                        <p className="truncate font-bold text-foreground">{supervisorName(round)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {formatDate(round.started_at)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatTime(round.started_at)} - {formatTime(round.completed_at)}
                            </span>
                            <span>{durationLabel(round)}</span>
                        </div>
                    </div>
                </div>
                <div className="shrink-0 rounded-lg bg-muted/10 px-3 py-2 text-center">
                    <p className="text-xl font-bold leading-none">{counts.observations}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">ملاحظات</p>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-muted/10 px-3 py-2">
                    <span className="text-muted-foreground">تحتاج أمر عمل</span>
                    <p className="mt-1 font-bold">{counts.needsWorkOrder}</p>
                </div>
                <div className="rounded-md bg-muted/10 px-3 py-2">
                    <span className="text-muted-foreground">محولة</span>
                    <p className="mt-1 font-bold text-primary">{counts.converted}</p>
                </div>
            </div>
        </button>
    )
}

function ObservationRow({
    observation,
    onConvert,
    converting,
}: {
    observation: RoundObservation
    onConvert: () => void
    converting: boolean
}) {
    return (
        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                    <p className="font-semibold leading-7">{observation.observation_text}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {displayName(observation.location)}
                        </span>
                        <span>{formatDate(observation.created_at)} {formatTime(observation.created_at)}</span>
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
                            disabled={converting}
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
    const [searchParams, setSearchParams] = useSearchParams()
    const [typeFilter, setTypeFilter] = useState<RoundType | 'all'>(() => validRoundType(searchParams.get('type')))
    const [supervisorFilter, setSupervisorFilter] = useState(() => searchParams.get('supervisor') ?? '')
    const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') ?? '')
    const [dateTo, setDateTo] = useState(() => searchParams.get('to') ?? '')
    const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
    const [newRoundType, setNewRoundType] = useState<RoundType>('maintenance')
    const [locationId, setLocationId] = useState('')
    const [observationText, setObservationText] = useState('')
    const [actionTaken, setActionTaken] = useState('')
    const [needsWorkOrder, setNeedsWorkOrder] = useState(true)
    const [summary, setSummary] = useState('')
    const [conversionObservation, setConversionObservation] = useState<RoundObservation | null>(null)
    const [assignedTeamId, setAssignedTeamId] = useState('')

    const { data: rounds, isLoading } = useRounds({
        type: typeFilter,
        supervisorId: supervisorFilter,
        dateFrom,
        dateTo,
    })
    const { data: supervisors } = useRoundSupervisors()
    const { data: departments, isLoading: locationsLoading } = useDepartments()
    const { data: teams } = useWorkTeams()
    const createRoundMutation = useCreateRound()
    const addObservationMutation = useAddRoundObservation()
    const completeRoundMutation = useCompleteRound()
    const convertMutation = useConvertRoundObservation()

    useEffect(() => {
        const next = new URLSearchParams()
        if (typeFilter !== 'all') next.set('type', typeFilter)
        if (supervisorFilter) next.set('supervisor', supervisorFilter)
        if (dateFrom) next.set('from', dateFrom)
        if (dateTo) next.set('to', dateTo)
        setSearchParams(next, { replace: true })
    }, [dateFrom, dateTo, setSearchParams, supervisorFilter, typeFilter])

    const activeDepartments = useMemo(
        () => (departments ?? []).filter((department) => department.is_active),
        [departments]
    )

    const routingTeams = useMemo(
        () => sortRoutingTeams((teams ?? []).filter((team) => team.status === 'active')),
        [teams]
    )

    const cleaningTeamId = useMemo(
        () => routingTeams.find((team) => getTeamPrimarySpecialization(team) === 'cleaning')?.id ?? '',
        [routingTeams]
    )

    const selectedRound = useMemo(
        () => (rounds ?? []).find((round) => round.id === selectedRoundId) ?? rounds?.[0] ?? null,
        [rounds, selectedRoundId]
    )

    const summaryCounts = useMemo(() => {
        const list = rounds ?? []
        return list.reduce(
            (acc, round) => {
                const counts = roundCounts(round)
                acc.total += 1
                acc.maintenance += round.round_type === 'maintenance' ? 1 : 0
                acc.cleaning += round.round_type === 'cleaning' ? 1 : 0
                acc.observations += counts.observations
                acc.converted += counts.converted
                return acc
            },
            { total: 0, maintenance: 0, cleaning: 0, observations: 0, converted: 0 }
        )
    }, [rounds])

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

    const openConvertDialog = (observation: RoundObservation) => {
        setConversionObservation(observation)
        setAssignedTeamId(selectedRound?.round_type === 'cleaning' ? cleaningTeamId : '')
    }

    const handleConvertObservation = () => {
        if (!conversionObservation || !assignedTeamId) {
            toast.error('اختر الفريق أو التخصص')
            return
        }

        convertMutation.mutate(
            { observationId: conversionObservation.id, assignedTeamId },
            {
                onSuccess: (result) => {
                    setConversionObservation(null)
                    setAssignedTeamId('')
                    toast.success(`تم إنشاء أمر العمل ${result.code}`)
                },
                onError: (error) => toast.error(error.message || 'تعذر تحويل الملاحظة'),
            }
        )
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
                    <p className="mt-2 text-sm text-muted-foreground">
                        ملخص أداء الجولات حسب المشرف، الفترة، ونوع الجولة.
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                        {(['maintenance', 'cleaning'] as RoundType[]).map((item) => {
                            const meta = typeMeta(item)
                            const Icon = meta.Icon
                            const active = newRoundType === item
                            return (
                                <button
                                    key={item}
                                    onClick={() => setNewRoundType(item)}
                                    className={cn(
                                        'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors',
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
                        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Plus className="h-4 w-4" />
                        {createRoundMutation.isPending ? 'جاري البدء...' : 'بدء جولة'}
                    </button>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    تصفية الجولات
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                    <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">المشرف</span>
                        <select
                            value={supervisorFilter}
                            onChange={(event) => setSupervisorFilter(event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                        >
                            <option value="">كل المشرفين</option>
                            {(supervisors ?? []).map((supervisor) => (
                                <option key={supervisor.id} value={supervisor.id}>
                                    {supervisor.full_name_ar || supervisor.full_name || supervisor.email}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">نوع الجولة</span>
                        <select
                            value={typeFilter}
                            onChange={(event) => setTypeFilter(validRoundType(event.target.value))}
                            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                        >
                            <option value="all">كل الأنواع</option>
                            <option value="maintenance">صيانة</option>
                            <option value="cleaning">نظافة</option>
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">من</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(event) => setDateFrom(event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">إلى</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(event) => setDateTo(event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                        />
                    </label>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryCard label="إجمالي الجولات" value={summaryCounts.total} Icon={ClipboardCheck} />
                <SummaryCard label="جولات الصيانة" value={summaryCounts.maintenance} Icon={Wrench} />
                <SummaryCard label="جولات النظافة" value={summaryCounts.cleaning} Icon={Sparkles} />
                <SummaryCard label="إجمالي الملاحظات" value={summaryCounts.observations} Icon={UserRound} />
                <SummaryCard label="محولة لأوامر عمل" value={summaryCounts.converted} Icon={CheckCircle2} />
            </div>

            {isLoading && (
                <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    جاري تحميل الجولات...
                </div>
            )}

            {!isLoading && (rounds?.length ?? 0) === 0 && (
                <div className="rounded-lg border-2 border-dashed border-border bg-card p-10 text-center">
                    <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="font-bold">لا توجد جولات ضمن هذا النطاق</p>
                </div>
            )}

            {(rounds?.length ?? 0) > 0 && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {rounds?.map((round) => (
                        <RoundCard
                            key={round.id}
                            round={round}
                            selected={selectedRound?.id === round.id}
                            onSelect={() => setSelectedRoundId(round.id)}
                        />
                    ))}
                </div>
            )}

            {selectedRound && selectedMeta && selectedStatus && (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
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
                                    <h2 className="text-xl font-bold">{supervisorName(selectedRound)}</h2>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                            <CalendarDays className="h-4 w-4" />
                                            {formatDate(selectedRound.started_at)}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="h-4 w-4" />
                                            {formatTime(selectedRound.started_at)} - {formatTime(selectedRound.completed_at)}
                                        </span>
                                        <span>{durationLabel(selectedRound)}</span>
                                    </div>
                                </div>
                                {selectedRound.completed_at && (
                                    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
                                        <p className="text-xs font-bold">وقت الإكمال</p>
                                        <p className="mt-1 font-bold">{formatDate(selectedRound.completed_at)} {formatTime(selectedRound.completed_at)}</p>
                                    </div>
                                )}
                            </div>
                            {selectedRound.summary && (
                                <p className="mt-4 rounded-lg bg-muted/20 p-3 text-sm leading-7 text-muted-foreground">
                                    {selectedRound.summary}
                                </p>
                            )}
                        </div>

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
                                        converting={convertMutation.isPending}
                                        onConvert={() => openConvertDialog(observation)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {selectedIsOpen && (
                        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                            <h3 className="font-bold">إضافة ملاحظة</h3>
                            <div className="mt-4 space-y-3">
                                <label className="space-y-1">
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

                                <label className="space-y-1">
                                    <span className="text-xs font-bold text-muted-foreground">الملاحظة</span>
                                    <textarea
                                        value={observationText}
                                        onChange={(event) => setObservationText(event.target.value)}
                                        rows={3}
                                        placeholder="مثال: تسريب خفيف تحت المغسلة"
                                        className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                                    />
                                </label>

                                <label className="space-y-1">
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
                                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
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
                </div>
            )}

            {conversionObservation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold">توجيه الملاحظة لأمر عمل</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    اختر الفريق أو التخصص قبل إنشاء أمر العمل.
                                </p>
                            </div>
                            <button
                                onClick={() => setConversionObservation(null)}
                                className="rounded-md p-2 text-muted-foreground hover:bg-muted/20"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="mt-4 rounded-lg bg-muted/10 p-3 text-sm leading-7">
                            {conversionObservation.observation_text}
                        </div>

                        <label className="mt-4 block space-y-1">
                            <span className="text-xs font-bold text-muted-foreground">الفريق / التخصص</span>
                            <select
                                value={assignedTeamId}
                                onChange={(event) => setAssignedTeamId(event.target.value)}
                                className="min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                            >
                                <option value="">اختر الفريق</option>
                                {routingTeams.map((team) => (
                                    <option key={team.id} value={team.id}>
                                        {team.name_ar || team.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                            <button
                                onClick={() => setConversionObservation(null)}
                                className="min-h-11 rounded-lg border border-border px-4 text-sm font-bold hover:bg-muted/10"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={handleConvertObservation}
                                disabled={!assignedTeamId || convertMutation.isPending}
                                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
                            >
                                <Users className="h-4 w-4" />
                                {convertMutation.isPending ? 'جاري التحويل...' : 'إنشاء أمر العمل'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
