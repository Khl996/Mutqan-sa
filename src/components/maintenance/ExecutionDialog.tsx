import { useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import {
    AlertCircle,
    CheckCircle2,
    ClipboardCheck,
    FileText,
    Hash,
    ImageIcon,
    Loader2,
    MapPin,
    Play,
    Save,
    StickyNote,
    Trash2,
    ToggleLeft,
    Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { PMWorkOrder, PMWorkOrderAsset, PMWorkOrderCheck } from '@/hooks/usePMFoundation'
import { usePMExecutionMutations, usePMWorkOrderDetail } from '@/hooks/usePMFoundation'
import { useCurrentTenantId } from '@/hooks/useTenantQuery'
import { supabase } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'
import { displayName, fillCount, itemTypeLabel, PMCopy, numberOrNull, statusClass, statusLabel } from './foundationPmUtils'

type ExecutionAsset = Pick<PMWorkOrderAsset, 'id' | 'asset_id' | 'sort_order' | 'notes' | 'asset'>

const PM_PHOTO_BUCKET = 'pm-execution-photos'
const PM_PHOTO_MAX_BYTES = 5 * 1024 * 1024
const PM_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

const checkIsDone = (check: PMWorkOrderCheck) => check.status !== 'pending'
const checkIsRequiredOpen = (check: PMWorkOrderCheck) => check.item_snapshot?.is_required && check.status === 'pending'

export default function ExecutionDialog({
    open,
    onOpenChange,
    workOrder,
    copy,
    isAr,
    locale,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    workOrder: PMWorkOrder | null
    copy: PMCopy
    isAr: boolean
    locale: string
}) {
    const { data: detail, isLoading, isError, error } = usePMWorkOrderDetail(workOrder?.id ?? null)
    const { updateCheck, startWorkOrder, completeWorkOrder, isSaving } = usePMExecutionMutations(workOrder?.id ?? null)
    const [completionNotes, setCompletionNotes] = useState('')
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const assets = useMemo<ExecutionAsset[]>(() => {
        if (!detail) return []
        if (detail.work_order_assets?.length) return detail.work_order_assets
        if (detail.asset) {
            return [{
                id: detail.asset.id,
                asset_id: detail.asset.id,
                sort_order: 0,
                notes: null,
                asset: detail.asset,
            }]
        }
        return [{ id: 'no-asset', asset_id: 'no-asset', sort_order: 0, notes: null, asset: null }]
    }, [detail])

    const checksByAsset = useMemo(() => {
        const map = new Map<string, PMWorkOrderCheck[]>()
        detail?.work_order_checks?.forEach((check) => {
            const key = check.asset_id ?? 'no-asset'
            map.set(key, [...(map.get(key) ?? []), check])
        })
        return map
    }, [detail])

    useEffect(() => {
        if (!open) {
            setCompletionNotes('')
            setSelectedAssetId(null)
            setSuccessMessage(null)
            setErrorMessage(null)
            return
        }
        if (assets[0]?.asset_id && (!selectedAssetId || !assets.some((asset) => asset.asset_id === selectedAssetId))) {
            setSelectedAssetId(assets[0].asset_id)
        }
    }, [assets, open, selectedAssetId])

    const currentAsset = assets.find((asset) => asset.asset_id === selectedAssetId) ?? assets[0] ?? null
    const currentAssetId = currentAsset?.asset_id ?? 'no-asset'
    const currentChecks = checksByAsset.get(currentAssetId) ?? []
    const requiredOpen = detail?.work_order_checks?.filter(checkIsRequiredOpen).length ?? 0
    const completedChecks = detail?.work_order_checks?.filter(checkIsDone).length ?? 0
    const totalChecks = detail?.work_order_checks?.length ?? 0
    const mode = detail?.source_schedule?.generation_mode ?? (detail?.source_schedule_asset_id ? 'per_asset' : 'batch_route')
    const isCompleted = detail?.status === 'completed' || detail?.status === 'auto_closed'
    const sourceScheduleName = detail?.source_schedule
        ? displayName(detail.source_schedule, isAr)
        : workOrder?.source_schedule
            ? displayName(workOrder.source_schedule, isAr)
            : null
    const headerDescription = [workOrder?.code, sourceScheduleName].filter(Boolean).join(' / ')

    const showSuccess = (message: string) => {
        setSuccessMessage(message)
        setErrorMessage(null)
        window.setTimeout(() => setSuccessMessage(null), 2500)
    }

    const showError = (unknownError: unknown) => {
        const message = unknownError instanceof Error ? unknownError.message : copy.executionError
        setErrorMessage(message)
        setSuccessMessage(null)
        toast.error(`${copy.executionError}: ${message}`)
    }

    const handleStart = async () => {
        if (!detail) return
        try {
            await startWorkOrder(detail.id)
            showSuccess(copy.startExecution)
        } catch (startError) {
            showError(startError)
        }
    }

    const handleComplete = async () => {
        if (!detail) return
        if (requiredOpen > 0) {
            const message = `${requiredOpen} ${copy.requiredRemaining}`
            setErrorMessage(message)
            toast.error(message)
            return
        }

        try {
            await completeWorkOrder({ id: detail.id, notes: completionNotes })
            showSuccess(copy.executionCompleted)
            toast.success(copy.executionCompleted)
            onOpenChange(false)
        } catch (completeError) {
            showError(completeError)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[94vh] max-w-7xl overflow-y-auto p-0">
                <DialogHeader className="border-b px-6 py-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <DialogTitle className="font-cairo">{copy.technicianView}</DialogTitle>
                            <DialogDescription className="mt-1 font-mono">
                                {headerDescription || workOrder?.code}
                            </DialogDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge className={cn('border', statusClass(detail?.status ?? workOrder?.status ?? 'pending'))}>
                                {statusLabel(detail?.status ?? workOrder?.status ?? 'pending', copy)}
                            </Badge>
                            {mode ? <Badge variant="outline">{mode === 'per_asset' ? copy.modePerAsset : copy.modeBatch}</Badge> : null}
                            <Badge variant="outline" dir="ltr">{completedChecks}/{totalChecks} {copy.itemsDone}</Badge>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-6 py-5">
                    {isLoading || !detail ? (
                        <StatePanel icon={Loader2} title={copy.loadingExecution} spin />
                    ) : isError ? (
                        <StatePanel icon={AlertCircle} title={copy.executionError} description={error instanceof Error ? error.message : undefined} tone="danger" />
                    ) : (
                        <div className="space-y-5">
                            <StatusBanner
                                successMessage={successMessage}
                                errorMessage={errorMessage}
                                completedMessage={isCompleted ? copy.executionCompleted : null}
                            />

                            <section className="rounded-lg border bg-card">
                                <div className="border-b px-4 py-3">
                                    <SectionTitle icon={ClipboardCheck} title={copy.workOrderInfo} />
                                </div>
                                <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-5">
                                    <Info label={copy.workOrders} value={detail.title} />
                                    <Info label={copy.jobPlan} value={detail.job_plan ? displayName(detail.job_plan, isAr) : '-'} />
                                    <Info label={copy.scheduled} value={detail.scheduled_date ? formatDate(detail.scheduled_date, locale) : '-'} />
                                    <Info label={copy.deadline} value={detail.compliance_deadline ? formatDate(detail.compliance_deadline, locale) : '-'} />
                                    <Info label={copy.requiredRemaining} value={String(requiredOpen)} />
                                </div>
                            </section>

                            <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
                                <section className="rounded-lg border bg-card">
                                    <div className="border-b px-4 py-3">
                                        <SectionTitle icon={MapPin} title={assets.length > 1 ? copy.assetList : copy.currentAsset} />
                                    </div>
                                    <div className="space-y-2 p-3">
                                        {assets.map((asset) => {
                                            const checks = checksByAsset.get(asset.asset_id) ?? []
                                            const done = checks.filter(checkIsDone).length
                                            const remaining = checks.filter(checkIsRequiredOpen).length
                                            const selected = asset.asset_id === currentAssetId
                                            return (
                                                <button
                                                    key={asset.id}
                                                    type="button"
                                                    onClick={() => setSelectedAssetId(asset.asset_id)}
                                                    className={cn(
                                                        'w-full rounded-md border p-3 text-start transition-colors',
                                                        selected ? 'border-primary bg-primary/10' : 'bg-background hover:bg-muted/60'
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="font-medium font-cairo">{asset.asset ? displayName(asset.asset, isAr) : asset.asset_id}</p>
                                                        {selected ? <Badge>{copy.selectedAsset}</Badge> : null}
                                                    </div>
                                                    <p className="mt-1 font-mono text-xs text-muted-foreground">{asset.asset?.code ?? asset.asset_id}</p>
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        <Badge variant="outline" dir="ltr">{done}/{checks.length}</Badge>
                                                        {remaining > 0 ? <Badge className="bg-amber-500/15 text-amber-700">{remaining} {copy.requiredRemaining}</Badge> : null}
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </section>

                                <main className="space-y-5">
                                    <section className="rounded-lg border bg-card">
                                        <div className="border-b px-4 py-3">
                                            <SectionTitle icon={MapPin} title={copy.currentAsset} />
                                        </div>
                                        <div className="grid gap-4 p-4 md:grid-cols-3">
                                            <Info label={copy.name} value={currentAsset?.asset ? displayName(currentAsset.asset, isAr) : currentAssetId} />
                                            <Info label={copy.code} value={currentAsset?.asset?.code ?? '-'} />
                                            <Info label={copy.checks} value={`${currentChecks.filter(checkIsDone).length}/${currentChecks.length}`} />
                                        </div>
                                    </section>

                                    <section className="rounded-lg border bg-card">
                                        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
                                            <SectionTitle icon={FileText} title={copy.requiredItems} />
                                            <Badge className={cn('border', currentChecks.filter(checkIsRequiredOpen).length > 0 ? statusClass('pending') : statusClass('pass'))}>
                                                {currentChecks.filter(checkIsRequiredOpen).length} {copy.requiredRemaining}
                                            </Badge>
                                        </div>
                                        <div className="space-y-3 p-4">
                                            {currentChecks.length === 0 ? (
                                                <p className="py-8 text-center text-sm text-muted-foreground font-cairo">{copy.noChecks}</p>
                                            ) : currentChecks.map((check) => (
                                                <CheckEditor
                                                    key={check.id}
                                                    check={check}
                                                    copy={copy}
                                                    isAr={isAr}
                                                    isSaving={isSaving || isCompleted}
                                                    onSave={async (patch) => {
                                                        try {
                                                            await updateCheck({ id: check.id, patch })
                                                            showSuccess(copy.checkSaved)
                                                            toast.success(copy.checkSaved)
                                                        } catch (saveError) {
                                                            showError(saveError)
                                                        }
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </section>

                                    <section className="rounded-lg border bg-card">
                                        <div className="border-b px-4 py-3">
                                            <SectionTitle icon={StickyNote} title={copy.executionNotes} />
                                        </div>
                                        <div className="p-4">
                                            <Textarea
                                                value={completionNotes}
                                                onChange={(event) => setCompletionNotes(event.target.value)}
                                                disabled={isSaving || isCompleted}
                                                className="min-h-24"
                                            />
                                        </div>
                                    </section>
                                </main>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="sticky bottom-0 z-10 gap-2 border-t bg-background px-6 py-4">
                    {detail && !isCompleted && requiredOpen > 0 ? (
                        <div className="me-auto rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 font-cairo">
                            {fillCount(copy.completeBlockedHint, requiredOpen)}
                        </div>
                    ) : null}
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{copy.cancel}</Button>
                    {detail?.status === 'pending' ? (
                        <Button variant="outline" onClick={() => void handleStart()} disabled={isSaving}>
                            {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Play className="me-2 h-4 w-4" />}
                            {isSaving ? copy.saving : copy.startExecution}
                        </Button>
                    ) : null}
                    <Button onClick={() => void handleComplete()} disabled={!detail || isSaving || isCompleted || requiredOpen > 0}>
                        {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="me-2 h-4 w-4" />}
                        {isSaving ? copy.saving : copy.completeWorkOrder}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function CheckEditor({
    check,
    copy,
    isAr,
    isSaving,
    onSave,
}: {
    check: PMWorkOrderCheck
    copy: PMCopy
    isAr: boolean
    isSaving: boolean
    onSave: (patch: Partial<PMWorkOrderCheck>) => Promise<unknown>
}) {
    const type = check.item_snapshot?.item_type ?? 'text'
    const [boolValue, setBoolValue] = useState<boolean | null>(check.value_bool)
    const [checkStatus, setCheckStatus] = useState(check.status)
    const [numeric, setNumeric] = useState(check.value_numeric?.toString() ?? '')
    const [text, setText] = useState(check.value_text ?? '')
    const label = isAr ? check.item_snapshot?.label_ar || check.item_snapshot?.label : check.item_snapshot?.label

    useEffect(() => {
        setBoolValue(check.value_bool)
        setCheckStatus(check.status)
        setNumeric(check.value_numeric?.toString() ?? '')
        setText(check.value_text ?? '')
    }, [check.id, check.status, check.value_bool, check.value_numeric, check.value_text])

    const saveValue = async () => {
        if (type === 'yes_no' || type === 'pass_fail') {
            await onSave({ value_bool: boolValue, status: checkStatus })
            return
        }

        if (type === 'numeric') {
            const value = numberOrNull(numeric)
            await onSave({ value_numeric: value, status: value === null ? 'pending' : 'pass' })
            return
        }

        await onSave({ value_text: text.trim() || null, status: text.trim() ? 'pass' : 'pending' })
    }

    return (
        <div className="rounded-md border bg-background p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.85fr)_minmax(260px,1.1fr)_auto] lg:items-start">
                <div>
                    <div className="flex items-start gap-2">
                        <CheckTypeIcon type={type} />
                        <div className="min-w-0">
                            <p className="font-medium font-cairo">{label}</p>
                            {check.item_snapshot?.help_text ? (
                                <p className="mt-1 text-xs text-muted-foreground">{check.item_snapshot.help_text}</p>
                            ) : null}
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline">{itemTypeLabel(type, copy)}</Badge>
                        {check.item_snapshot?.is_required ? <Badge className="bg-amber-500/15 text-amber-700">{copy.required}</Badge> : null}
                        <Badge className={cn('border', statusClass(check.status))}>{statusLabel(check.status, copy)}</Badge>
                    </div>
                </div>

                <div>
                    {type === 'yes_no' || type === 'pass_fail' ? (
                        <div className="grid gap-2 sm:grid-cols-3">
                            <Button
                                type="button"
                                variant={checkStatus === 'pass' ? 'default' : 'outline'}
                                onClick={() => { setBoolValue(true); setCheckStatus('pass') }}
                                disabled={isSaving}
                            >
                                {copy.pass}
                            </Button>
                            <Button
                                type="button"
                                variant={checkStatus === 'fail' ? 'destructive' : 'outline'}
                                onClick={() => { setBoolValue(false); setCheckStatus('fail') }}
                                disabled={isSaving}
                            >
                                {copy.fail}
                            </Button>
                            <Button
                                type="button"
                                variant={checkStatus === 'na' ? 'secondary' : 'outline'}
                                onClick={() => { setBoolValue(null); setCheckStatus('na') }}
                                disabled={isSaving}
                            >
                                {copy.notApplicable}
                            </Button>
                        </div>
                    ) : type === 'numeric' ? (
                        <div className="space-y-2">
                            <Input type="number" value={numeric} onChange={(event) => setNumeric(event.target.value)} disabled={isSaving} />
                            <LimitHint check={check} />
                        </div>
                    ) : type === 'photo' ? (
                        <PhotoUploader
                            check={check}
                            copy={copy}
                            isSaving={isSaving}
                            onSave={onSave}
                        />
                    ) : (
                        <Textarea value={text} onChange={(event) => setText(event.target.value)} disabled={isSaving} className="min-h-20" />
                    )}
                </div>

                {type !== 'photo' ? (
                    <div className="lg:text-end">
                        <Button type="button" onClick={() => void saveValue()} disabled={isSaving}>
                            {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                            {isSaving ? copy.saving : copy.saveItem}
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    )
}

function PhotoUploader({
    check,
    copy,
    isSaving,
    onSave,
}: {
    check: PMWorkOrderCheck
    copy: PMCopy
    isSaving: boolean
    onSave: (patch: Partial<PMWorkOrderCheck>) => Promise<unknown>
}) {
    const tenantId = useCurrentTenantId()
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null)
    const [storedPreviewUrl, setStoredPreviewUrl] = useState<string | null>(null)
    const [isPreviewLoading, setIsPreviewLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [localSuccess, setLocalSuccess] = useState<string | null>(null)
    const [localError, setLocalError] = useState<string | null>(null)

    const storedValue = check.value_photo_url
    const previewUrl = selectedPreviewUrl ?? storedPreviewUrl
    const isBusy = isSaving || isUploading
    const inputId = `photo-${check.id}`

    useEffect(() => {
        let cancelled = false

        const loadPreview = async () => {
            setStoredPreviewUrl(null)
            setLocalError(null)

            if (!storedValue) return
            if (isDirectPhotoUrl(storedValue)) {
                setStoredPreviewUrl(storedValue)
                return
            }

            const ref = parseStoredPhotoRef(storedValue)
            if (!ref) return

            setIsPreviewLoading(true)
            const { data, error } = await supabase.storage
                .from(ref.bucket)
                .createSignedUrl(ref.path, 60 * 60)

            if (cancelled) return
            setIsPreviewLoading(false)

            if (error || !data?.signedUrl) {
                setLocalError(copy.photoPreviewFailed)
                return
            }

            setStoredPreviewUrl(data.signedUrl)
        }

        void loadPreview()

        return () => {
            cancelled = true
        }
    }, [copy.photoPreviewFailed, storedValue])

    useEffect(() => {
        return () => {
            if (selectedPreviewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(selectedPreviewUrl)
            }
        }
    }, [selectedPreviewUrl])

    const clearSelectedFile = () => {
        if (selectedPreviewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(selectedPreviewUrl)
        }
        setSelectedFile(null)
        setSelectedPreviewUrl(null)
    }

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null
        event.target.value = ''
        setLocalError(null)
        setLocalSuccess(null)

        if (!file) return

        const validationError = validatePhotoFile(file, copy)
        if (validationError) {
            setLocalError(validationError)
            toast.error(validationError)
            return
        }

        clearSelectedFile()
        setSelectedFile(file)
        setSelectedPreviewUrl(URL.createObjectURL(file))
    }

    const handleUpload = async () => {
        if (!selectedFile || !tenantId) return

        const previousValue = storedValue
        const path = buildPhotoPath({
            tenantId,
            workOrderId: check.work_order_id,
            checkId: check.id,
            file: selectedFile,
        })
        const storageValue = toStoredPhotoValue(path)

        setIsUploading(true)
        setLocalError(null)
        setLocalSuccess(null)

        try {
            const { error: uploadError } = await supabase.storage
                .from(PM_PHOTO_BUCKET)
                .upload(path, selectedFile, {
                    cacheControl: '3600',
                    contentType: selectedFile.type || guessPhotoMimeType(selectedFile.name),
                    upsert: false,
                })

            if (uploadError) throw uploadError

            try {
                await onSave({ value_photo_url: storageValue, status: 'pass' })
            } catch (saveError) {
                await removeStoredPhoto(storageValue)
                throw saveError
            }

            if (previousValue) {
                await removeStoredPhoto(previousValue)
            }

            clearSelectedFile()
            setLocalSuccess(copy.photoUploadSuccess)
        } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : copy.executionError
            setLocalError(message)
            toast.error(message)
        } finally {
            setIsUploading(false)
        }
    }

    const handleRemove = async () => {
        const previousValue = storedValue
        setLocalError(null)
        setLocalSuccess(null)

        if (!previousValue && selectedFile) {
            clearSelectedFile()
            return
        }

        if (!previousValue) return

        setIsUploading(true)
        try {
            await onSave({ value_photo_url: null, status: 'pending' })
            await removeStoredPhoto(previousValue)
            clearSelectedFile()
            setStoredPreviewUrl(null)
            setLocalSuccess(copy.photoRemoveSuccess)
        } catch (removeError) {
            const message = removeError instanceof Error ? removeError.message : copy.executionError
            setLocalError(message)
            toast.error(message)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="space-y-3">
            <div className="overflow-hidden rounded-md border bg-muted/30">
                {isPreviewLoading ? (
                    <div className="flex min-h-44 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : previewUrl ? (
                    <img src={previewUrl} alt={copy.photoPreview} className="max-h-72 w-full object-contain" />
                ) : (
                    <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-sm font-cairo">{copy.photoPreview}</span>
                    </div>
                )}
            </div>

            <Input
                id={inputId}
                type="file"
                accept={PM_PHOTO_TYPES.join(',')}
                onChange={handleFileChange}
                disabled={isBusy}
            />

            {selectedFile ? (
                <p className="text-xs text-muted-foreground" dir="auto">
                    {copy.selectedFile}: {selectedFile.name} ({formatBytes(selectedFile.size)})
                </p>
            ) : null}

            {localError ? <StateLine tone="danger" icon={AlertCircle} text={localError} /> : null}
            {localSuccess ? <StateLine tone="success" icon={CheckCircle2} text={localSuccess} /> : null}

            <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleUpload()} disabled={isBusy || !selectedFile || !tenantId}>
                    {isUploading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}
                    {isUploading ? copy.saving : storedValue ? copy.replacePhoto : copy.uploadPhoto}
                </Button>
                {(storedValue || selectedFile) ? (
                    <Button type="button" variant="outline" onClick={() => void handleRemove()} disabled={isBusy}>
                        <Trash2 className="me-2 h-4 w-4" />
                        {storedValue ? copy.removePhoto : copy.cancel}
                    </Button>
                ) : null}
            </div>
        </div>
    )
}

function CheckTypeIcon({ type }: { type: string }) {
    const Icon = type === 'numeric'
        ? Hash
        : type === 'photo'
            ? ImageIcon
            : type === 'yes_no' || type === 'pass_fail'
                ? ToggleLeft
                : FileText
    return (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
    )
}

function LimitHint({ check }: { check: PMWorkOrderCheck }) {
    const pieces = [
        check.item_snapshot?.unit,
        check.item_snapshot?.min_value !== null && check.item_snapshot?.min_value !== undefined ? `min ${check.item_snapshot.min_value}` : null,
        check.item_snapshot?.max_value !== null && check.item_snapshot?.max_value !== undefined ? `max ${check.item_snapshot.max_value}` : null,
    ].filter(Boolean)

    if (pieces.length === 0) return null
    return <p className="text-xs text-muted-foreground" dir="ltr">{pieces.join(' / ')}</p>
}

function validatePhotoFile(file: File, copy: PMCopy) {
    const lowerName = file.name.toLowerCase()
    const hasAllowedType = PM_PHOTO_TYPES.includes(file.type)
        || ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].some((extension) => lowerName.endsWith(extension))

    if (!hasAllowedType) return copy.invalidPhotoType
    if (file.size > PM_PHOTO_MAX_BYTES) return copy.photoTooLarge
    return null
}

function buildPhotoPath({
    tenantId,
    workOrderId,
    checkId,
    file,
}: {
    tenantId: string
    workOrderId: string
    checkId: string
    file: File
}) {
    const extension = photoExtension(file)
    const uniqueId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 100000)}`
    return `${tenantId}/${workOrderId}/${checkId}/${Date.now()}-${uniqueId}.${extension}`
}

function photoExtension(file: File) {
    const byType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'image/heif': 'heif',
    }
    if (byType[file.type]) return byType[file.type]

    const extension = file.name.toLowerCase().split('.').pop()
    if (extension && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension)) {
        return extension === 'jpeg' ? 'jpg' : extension
    }
    return 'jpg'
}

function guessPhotoMimeType(fileName: string) {
    const extension = fileName.toLowerCase().split('.').pop()
    switch (extension) {
        case 'png':
            return 'image/png'
        case 'webp':
            return 'image/webp'
        case 'heic':
            return 'image/heic'
        case 'heif':
            return 'image/heif'
        default:
            return 'image/jpeg'
    }
}

function toStoredPhotoValue(path: string) {
    return `storage://${PM_PHOTO_BUCKET}/${path}`
}

function isDirectPhotoUrl(value: string) {
    return /^(https?:|data:|blob:)/i.test(value)
}

function parseStoredPhotoRef(value: string | null | undefined) {
    if (!value || isDirectPhotoUrl(value)) return null

    if (value.startsWith('storage://')) {
        const withoutScheme = value.slice('storage://'.length)
        const separator = withoutScheme.indexOf('/')
        if (separator <= 0) return null
        return {
            bucket: withoutScheme.slice(0, separator),
            path: withoutScheme.slice(separator + 1),
        }
    }

    return {
        bucket: PM_PHOTO_BUCKET,
        path: value,
    }
}

async function removeStoredPhoto(value: string | null | undefined) {
    const ref = parseStoredPhotoRef(value)
    if (!ref) return

    const { error } = await supabase.storage
        .from(ref.bucket)
        .remove([ref.path])

    if (error) throw error
}

function formatBytes(size: number) {
    if (size < 1024) return `${size} B`
    const kb = size / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    return `${(kb / 1024).toFixed(1)} MB`
}

function StatusBanner({
    successMessage,
    errorMessage,
    completedMessage,
}: {
    successMessage: string | null
    errorMessage: string | null
    completedMessage: string | null
}) {
    if (errorMessage) {
        return <StateLine tone="danger" icon={AlertCircle} text={errorMessage} />
    }
    if (successMessage) {
        return <StateLine tone="success" icon={CheckCircle2} text={successMessage} />
    }
    if (completedMessage) {
        return <StateLine tone="success" icon={CheckCircle2} text={completedMessage} />
    }
    return null
}

function StateLine({ icon: Icon, text, tone }: { icon: React.ElementType; text: string; tone: 'success' | 'danger' }) {
    return (
        <div className={cn(
            'flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-cairo',
            tone === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border-rose-500/20 bg-rose-500/10 text-rose-700'
        )}>
            <Icon className="h-4 w-4" />
            <span>{text}</span>
        </div>
    )
}

function StatePanel({
    icon: Icon,
    title,
    description,
    spin = false,
    tone = 'default',
}: {
    icon: React.ElementType
    title: string
    description?: string
    spin?: boolean
    tone?: 'default' | 'danger'
}) {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
            <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted', tone === 'danger' && 'bg-rose-500/10 text-rose-700')}>
                <Icon className={cn('h-6 w-6', spin && 'animate-spin')} />
            </div>
            <p className="font-semibold font-cairo">{title}</p>
            {description ? <p className="mt-2 max-w-lg text-sm text-muted-foreground">{description}</p> : null}
        </div>
    )
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
    return (
        <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h3 className="font-semibold font-cairo">{title}</h3>
        </div>
    )
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-cairo">{label}</Label>
            <p className="text-sm font-medium" dir="auto">{value}</p>
        </div>
    )
}
