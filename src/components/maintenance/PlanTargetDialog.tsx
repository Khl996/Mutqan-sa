import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
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
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useAssets } from '@/hooks/useAssets'
import { useBuildings } from '@/hooks/useFacilities'
import { useAssetGroups } from '@/hooks/useAssetGroups'
import { useMaintenanceProgram } from '@/hooks/useMaintenanceProgram'
import type { MaintenancePlanTargetType } from '@/types/maintenance'

interface PlanTargetDialogProps {
    isOpen: boolean
    onClose: () => void
    planId: string
}

type TargetForm = {
    target_type: MaintenancePlanTargetType
    asset_id: string | null
    building_id: string | null
    asset_group_id: string | null
    is_primary: boolean
    role: string
    notes: string
}

const DEFAULT_FORM: TargetForm = {
    target_type: 'asset',
    asset_id: null,
    building_id: null,
    asset_group_id: null,
    is_primary: false,
    role: '',
    notes: '',
}

export default function PlanTargetDialog({ isOpen, onClose, planId }: PlanTargetDialogProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { data: assets } = useAssets()
    const { data: buildings } = useBuildings()
    const { groups, createGroup } = useAssetGroups()
    const { createTarget } = useMaintenanceProgram(planId)

    const [form, setForm] = useState<TargetForm>(DEFAULT_FORM)
    const [assetSearch, setAssetSearch] = useState('')
    const [groupAssetSearch, setGroupAssetSearch] = useState('')
    const [groupName, setGroupName] = useState('')
    const [groupNameAr, setGroupNameAr] = useState('')
    const [groupCode, setGroupCode] = useState('')
    const [groupAssetIds, setGroupAssetIds] = useState<string[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isCreatingGroup, setIsCreatingGroup] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        setForm(DEFAULT_FORM)
        setAssetSearch('')
        setGroupAssetSearch('')
        setGroupName('')
        setGroupNameAr('')
        setGroupCode('')
        setGroupAssetIds([])
    }, [isOpen])

    const filteredAssets = useMemo(() => {
        const source = assets ?? []
        if (!assetSearch.trim()) return source
        const query = assetSearch.toLowerCase()
        return source.filter((asset) =>
            asset.code.toLowerCase().includes(query) ||
            asset.name.toLowerCase().includes(query) ||
            asset.name_ar?.toLowerCase().includes(query)
        )
    }, [assetSearch, assets])

    const filteredGroupAssets = useMemo(() => {
        const source = assets ?? []
        if (!groupAssetSearch.trim()) return source.slice(0, 20)
        const query = groupAssetSearch.toLowerCase()
        return source.filter((asset) =>
            asset.code.toLowerCase().includes(query) ||
            asset.name.toLowerCase().includes(query) ||
            asset.name_ar?.toLowerCase().includes(query)
        ).slice(0, 20)
    }, [assets, groupAssetSearch])

    const handleCreateGroup = async () => {
        if (!groupName.trim()) {
            toast.error(t('pm.asset_groups.name_required'))
            return
        }

        try {
            setIsCreatingGroup(true)
            const group = await createGroup({
                code: groupCode || null,
                name: groupName,
                name_ar: groupNameAr || null,
                asset_ids: groupAssetIds,
            })
            setForm((current) => ({ ...current, target_type: 'asset_group', asset_group_id: group.id }))
            setGroupName('')
            setGroupNameAr('')
            setGroupCode('')
            setGroupAssetIds([])
            toast.success(t('pm.success.asset_group_created'))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.asset_group_create_failed'))
        } finally {
            setIsCreatingGroup(false)
        }
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()

        if (form.target_type === 'asset' && !form.asset_id) {
            toast.error(t('pm.targets.target_required'))
            return
        }
        if (form.target_type === 'building' && !form.building_id) {
            toast.error(t('pm.targets.target_required'))
            return
        }
        if (form.target_type === 'asset_group' && !form.asset_group_id) {
            toast.error(t('pm.targets.target_required'))
            return
        }

        const buildLabelSnapshot = (): Record<string, unknown> => {
            if (form.target_type === 'asset' && form.asset_id) {
                const asset = assets?.find((a) => a.id === form.asset_id)
                if (asset) return { name: asset.name, name_ar: asset.name_ar ?? null, code: asset.code }
            }
            if (form.target_type === 'building' && form.building_id) {
                const building = buildings?.find((b) => b.id === form.building_id)
                if (building) return { name: building.name, name_ar: building.name_ar ?? null }
            }
            if (form.target_type === 'asset_group' && form.asset_group_id) {
                const group = groups.find((g) => g.id === form.asset_group_id)
                if (group) return { name: group.name, name_ar: group.name_ar ?? null, code: group.code ?? null }
            }
            return {}
        }

        try {
            setIsSubmitting(true)
            await createTarget({
                plan_id: planId,
                target_type: form.target_type,
                asset_id: form.asset_id,
                building_id: form.building_id,
                asset_group_id: form.asset_group_id,
                is_primary: form.is_primary,
                role: form.role || null,
                notes: form.notes || null,
                label_snapshot: buildLabelSnapshot(),
            })
            toast.success(t('pm.success.target_added'))
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.target_update_failed'))
        } finally {
            setIsSubmitting(false)
        }
    }

    const toggleGroupAsset = (assetId: string) => {
        setGroupAssetIds((current) =>
            current.includes(assetId)
                ? current.filter((id) => id !== assetId)
                : [...current, assetId]
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="font-cairo">{t('pm.targets.add')}</DialogTitle>
                    <DialogDescription className="font-cairo">{t('pm.targets.description')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('pm.targets.type')} required>
                            <Select
                                value={form.target_type}
                                onValueChange={(value) => setForm((current) => ({
                                    ...current,
                                    target_type: value as MaintenancePlanTargetType,
                                    asset_id: null,
                                    building_id: null,
                                    asset_group_id: null,
                                }))}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="asset">{t('pm.targets.type_asset')}</SelectItem>
                                    <SelectItem value="building">{t('pm.targets.type_building')}</SelectItem>
                                    <SelectItem value="asset_group">{t('pm.targets.type_asset_group')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label={t('pm.targets.role')}>
                            <Input
                                value={form.role}
                                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                            />
                        </Field>
                    </div>

                    {form.target_type === 'asset' ? (
                        <Field label={t('pm.tasks.asset')} required>
                            <div className="space-y-2">
                                {(assets?.length ?? 0) > 10 ? (
                                    <Input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder={t('common.search')} />
                                ) : null}
                                <Select
                                    value={form.asset_id ?? ''}
                                    onValueChange={(value) => setForm((current) => ({ ...current, asset_id: value }))}
                                >
                                    <SelectTrigger><SelectValue placeholder={t('pm.tasks.asset')} /></SelectTrigger>
                                    <SelectContent>
                                        {filteredAssets.map((asset) => (
                                            <SelectItem key={asset.id} value={asset.id}>
                                                {`${asset.code} - ${isRTL ? asset.name_ar || asset.name : asset.name}`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </Field>
                    ) : null}

                    {form.target_type === 'building' ? (
                        <Field label={t('pm.tasks.building')} required>
                            <Select
                                value={form.building_id ?? ''}
                                onValueChange={(value) => setForm((current) => ({ ...current, building_id: value }))}
                            >
                                <SelectTrigger><SelectValue placeholder={t('pm.tasks.building')} /></SelectTrigger>
                                <SelectContent>
                                    {(buildings ?? []).map((building) => (
                                        <SelectItem key={building.id} value={building.id}>
                                            {isRTL ? building.name_ar || building.name : building.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    ) : null}

                    {form.target_type === 'asset_group' ? (
                        <div className="space-y-4">
                            <Field label={t('pm.asset_groups.title')} required>
                                <Select
                                    value={form.asset_group_id ?? ''}
                                    onValueChange={(value) => setForm((current) => ({ ...current, asset_group_id: value }))}
                                >
                                    <SelectTrigger><SelectValue placeholder={t('pm.asset_groups.title')} /></SelectTrigger>
                                    <SelectContent>
                                        {groups.map((group) => (
                                            <SelectItem key={group.id} value={group.id}>
                                                {group.code ? `${group.code} - ` : ''}{isRTL ? group.name_ar || group.name : group.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>

                            <div className="rounded-xl border bg-muted/20 p-4">
                                <div className="mb-3 flex items-center gap-2">
                                    <Plus className="h-4 w-4 text-primary" />
                                    <p className="font-medium font-cairo">{t('pm.asset_groups.create_inline')}</p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                    <Input value={groupCode} onChange={(event) => setGroupCode(event.target.value)} placeholder={t('pm.templates.code')} />
                                    <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder={t('pm.asset_groups.name')} />
                                    <Input value={groupNameAr} onChange={(event) => setGroupNameAr(event.target.value)} placeholder={t('pm.asset_groups.name_ar')} dir="rtl" />
                                </div>
                                <div className="mt-3 space-y-2">
                                    <Input value={groupAssetSearch} onChange={(event) => setGroupAssetSearch(event.target.value)} placeholder={t('pm.asset_groups.search_assets')} />
                                    <div className="grid max-h-48 gap-2 overflow-y-auto md:grid-cols-2">
                                        {filteredGroupAssets.map((asset) => (
                                            <label key={asset.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={groupAssetIds.includes(asset.id)}
                                                    onChange={() => toggleGroupAsset(asset.id)}
                                                />
                                                <span>{asset.code} - {isRTL ? asset.name_ar || asset.name : asset.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <Button type="button" variant="outline" className="mt-3" onClick={handleCreateGroup} disabled={isCreatingGroup}>
                                    {isCreatingGroup ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                                    {t('pm.asset_groups.create')}
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <label className="flex items-center justify-between rounded-xl border p-3">
                        <span className="font-cairo text-sm">{t('pm.targets.primary')}</span>
                        <input
                            type="checkbox"
                            checked={form.is_primary}
                            onChange={(event) => setForm((current) => ({ ...current, is_primary: event.target.checked }))}
                            className="h-4 w-4"
                        />
                    </label>

                    <Field label={t('common.notes')}>
                        <Textarea
                            rows={3}
                            value={form.notes}
                            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        />
                    </Field>

                    <DialogFooter className="gap-2 border-t pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                            {t('common.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="space-y-2">
            <span className="text-sm font-medium font-cairo">
                {label}
                {required ? <span className="ms-0.5 text-destructive">*</span> : null}
            </span>
            {children}
        </label>
    )
}
