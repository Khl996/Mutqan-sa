import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateWorkOrder, useIssueTypes } from '@/hooks/useWorkOrders'
import { useBuildings } from '@/hooks/useFacilities'
import { useAssets } from '@/hooks/useAssets'
import { useWorkTeams } from '@/hooks/useWorkTeams'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { useTenantSubscription, useTenantUsage } from '@/hooks/useSubscription'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/contexts/AuthContext'
import Modal from '@/components/ui/Modal'
import { ClipboardList, Loader2, Users2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AddWorkOrderModalProps {
    isOpen: boolean
    onClose: () => void
}

// Map issue type codes to team specialization
const issueTypeToSpecialization: Record<string, string> = {
    'electrical': 'electrical',
    'كهرباء': 'electrical',
    'mechanical': 'mechanical',
    'ميكانيكا': 'mechanical',
    'plumbing': 'plumbing',
    'سباكة': 'plumbing',
    'hvac': 'hvac',
    'تكييف': 'hvac',
    'civil': 'civil',
    'مدني': 'civil',
    'medical_equipment': 'medical_equipment',
    'معدات طبية': 'medical_equipment',
    'it': 'it',
    'تقنية': 'it',
    'cleaning': 'cleaning',
    'نظافة': 'cleaning',
    'safety': 'safety',
    'سلامة': 'safety',
}

export default function AddWorkOrderModal({ isOpen, onClose }: AddWorkOrderModalProps) {
    const { t, i18n } = useTranslation()
    const { profile, user } = useAuth()
    const isRTL = i18n.language === 'ar'

    // Check assignment feature
    // Check permissions
    const { can } = usePermission()
    const canAssign = can('work_orders.manage')

    // Check assignment feature - Enable only if feature is on AND user has permission
    const isAssignmentEnabled = useFeatureEnabled('work_orders', 'assignment') && canAssign

    const createWorkOrder = useCreateWorkOrder()
    const { data: issueTypes } = useIssueTypes()
    const { data: buildings } = useBuildings()
    const { data: assets } = useAssets()
    const { data: teams } = useWorkTeams()
    const { data: subscription } = useTenantSubscription(profile?.tenant_id || '')
    const { data: usage } = useTenantUsage(profile?.tenant_id || '')

    const [formData, setFormData] = useState({
        code: '',
        title: '',
        description: '',
        issue_type_id: '',
        priority: 'medium' as const,
        building_id: '',
        asset_id: '',
        due_date: '',
        assigned_team: '',
    })

    // Remove duplicate issue types based on code
    const uniqueIssueTypes = useMemo(() => {
        if (!issueTypes) return []
        const seen = new Set<string>()
        return issueTypes.filter(type => {
            const key = type.code?.toLowerCase() || type.name.toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }, [issueTypes])

    // Auto-assign team when issue type changes
    useEffect(() => {
        if (!isAssignmentEnabled) return // Skip if feature disabled

        if (formData.issue_type_id && teams && teams.length > 0) {
            const selectedIssueType = issueTypes?.find(t => t.id === formData.issue_type_id)
            if (selectedIssueType) {
                // Try to match by code or name
                const issueCode = selectedIssueType.code?.toLowerCase() || ''
                const issueName = selectedIssueType.name?.toLowerCase() || ''
                const issueNameAr = selectedIssueType.name_ar?.toLowerCase() || ''

                // Find matching specialization
                const targetSpec = issueTypeToSpecialization[issueCode] ||
                    issueTypeToSpecialization[issueName] ||
                    issueTypeToSpecialization[issueNameAr]

                if (targetSpec) {
                    // Find team with matching type/specialization
                    const matchingTeam = teams.find(team =>
                        team.type?.toLowerCase() === targetSpec
                    )
                    if (matchingTeam && formData.assigned_team !== matchingTeam.id) {
                        setFormData(prev => ({ ...prev, assigned_team: matchingTeam.id }))
                    }
                }
            }
        }
    }, [formData.issue_type_id, teams, issueTypes, isAssignmentEnabled])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const generateCode = () => {
        const prefix = 'WO'
        const date = new Date().toISOString().slice(2, 10).replace(/-/g, '')
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
        setFormData(prev => ({ ...prev, code: `${prefix}-${date}-${random}` }))
    }

    useEffect(() => {
        if (isOpen && !formData.code) {
            generateCode()
        }
    }, [isOpen])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.code || !formData.title) {
            toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields')
            return
        }

        const tenantId = profile?.tenant_id

        if (!tenantId) {
            toast.error(isRTL ? 'لم يتم العثور على معرف المؤسسة' : 'Tenant ID not found')
            return
        }

        // Check Subscription Limits
        if (subscription?.plan && usage) {
            const maxWorkOrders = subscription.plan.max_work_orders_monthly
            if (maxWorkOrders !== -1 && usage.work_orders_this_month >= maxWorkOrders) {
                toast.error(isRTL
                    ? `عذراً، لقد استهلكت حد أوامر العمل الشهري المسموح به في باقتك (${maxWorkOrders})`
                    : `Sorry, you have reached the monthly work order limit for your plan (${maxWorkOrders})`
                )
                return
            }
        }

        try {
            await createWorkOrder.mutateAsync({
                tenant_id: tenantId,
                code: formData.code,
                title: formData.title,
                description: formData.description || null,
                issue_type_id: formData.issue_type_id || null,
                priority: formData.priority,
                building_id: formData.building_id || null,
                asset_id: formData.asset_id || null,
                due_date: formData.due_date || null,
                reported_by: user?.id || null,
                assigned_team: isAssignmentEnabled ? (formData.assigned_team || null) : null, // Only send if enabled and permitted
                status: 'pending',
            })

            toast.success(isRTL ? 'تم إنشاء البلاغ بنجاح' : 'Work order created successfully')

            // Reset form and close
            setFormData({
                code: '',
                title: '',
                description: '',
                issue_type_id: '',
                priority: 'medium',
                building_id: '',
                asset_id: '',
                due_date: '',
                assigned_team: '',
            })
            onClose()
        } catch (error: any) {
            console.error('Create work order error:', error)
            toast.error(error.message || (isRTL ? 'حدث خطأ' : 'An error occurred'))
        }
    }

    const inputClass = cn(
        'w-full px-4 py-2.5 bg-background border border-border rounded-lg',
        'focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none',
        'transition-colors font-cairo'
    )

    const selectClass = cn(inputClass, 'cursor-pointer')
    const labelClass = 'block text-sm font-medium text-primary mb-1.5 font-cairo'

    // Get selected team info for display
    const selectedTeam = teams?.find(t => t.id === formData.assigned_team)

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('workOrders.createWorkOrder')} size="xl">
            <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className="p-4 bg-secondary/10 rounded-2xl">
                        <ClipboardList className="w-10 h-10 text-secondary" />
                    </div>
                </div>

                {/* Code & Title Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'رقم البلاغ' : 'Order Code'} <span className="text-destructive">*</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="code"
                                value={formData.code}
                                onChange={handleChange}
                                placeholder={isRTL ? 'مثال: WO-240114-001' : 'e.g., WO-240114-001'}
                                className={cn(inputClass, 'flex-1 font-inter')}
                                required
                            />
                            <button
                                type="button"
                                onClick={generateCode}
                                className="px-3 py-2 bg-muted/20 text-primary rounded-lg hover:bg-muted/30 transition-colors text-sm"
                            >
                                {isRTL ? 'توليد' : 'Generate'}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'عنوان البلاغ' : 'Title'} <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            placeholder={isRTL ? 'وصف مختصر للمشكلة' : 'Brief description of the issue'}
                            className={inputClass}
                            required
                        />
                    </div>
                </div>

                {/* Issue Type & Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {t('workOrders.issueType')}
                        </label>
                        <select
                            name="issue_type_id"
                            value={formData.issue_type_id}
                            onChange={handleChange}
                            className={selectClass}
                        >
                            <option value="">{isRTL ? 'اختر نوع المشكلة' : 'Select issue type'}</option>
                            {uniqueIssueTypes.map(type => (
                                <option key={type.id} value={type.id}>
                                    {isRTL ? type.name_ar : type.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>
                            {t('workOrders.priority')}
                        </label>
                        <select
                            name="priority"
                            value={formData.priority}
                            onChange={handleChange}
                            className={selectClass}
                        >
                            <option value="low">{t('workOrders.low')}</option>
                            <option value="medium">{t('workOrders.medium')}</option>
                            <option value="high">{t('workOrders.high')}</option>
                            <option value="urgent">{t('workOrders.urgent')}</option>
                        </select>
                    </div>
                </div>

                {/* Assigned Team - Only if feature enabled */}
                {isAssignmentEnabled && (
                    <div>
                        <label className={labelClass}>
                            <span className="flex items-center gap-2">
                                <Users2 className="w-4 h-4" />
                                {isRTL ? 'الفريق المختص' : 'Assigned Team'}
                            </span>
                        </label>
                        <select
                            name="assigned_team"
                            value={formData.assigned_team}
                            onChange={handleChange}
                            className={cn(selectClass, selectedTeam && 'border-secondary/50 bg-secondary/5')}
                        >
                            <option value="">{isRTL ? 'اختر الفريق (اختياري)' : 'Select team (optional)'}</option>
                            {teams?.map(team => (
                                <option key={team.id} value={team.id}>
                                    {isRTL ? (team.name_ar || team.name) : team.name} ({team.code})
                                </option>
                            ))}
                        </select>
                        {selectedTeam && (
                            <p className="text-xs text-secondary mt-1 font-cairo">
                                {isRTL ? `✓ تم تعيين الفريق تلقائياً: ${selectedTeam.name_ar || selectedTeam.name}`
                                    : `✓ Team auto-assigned: ${selectedTeam.name}`}
                            </p>
                        )}
                    </div>
                )}

                {/* Building & Asset */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {t('workOrders.location')}
                        </label>
                        <select
                            name="building_id"
                            value={formData.building_id}
                            onChange={handleChange}
                            className={selectClass}
                        >
                            <option value="">{isRTL ? 'اختر المبنى' : 'Select building'}</option>
                            {buildings?.map(building => (
                                <option key={building.id} value={building.id}>
                                    {isRTL ? building.name_ar : building.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>
                            {t('workOrders.asset')}
                        </label>
                        <select
                            name="asset_id"
                            value={formData.asset_id}
                            onChange={handleChange}
                            className={selectClass}
                        >
                            <option value="">{isRTL ? 'اختر الأصل (اختياري)' : 'Select asset (optional)'}</option>
                            {assets?.map(asset => (
                                <option key={asset.id} value={asset.id}>
                                    {asset.code} - {isRTL ? asset.name_ar : asset.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Due Date */}
                <div>
                    <label className={labelClass}>
                        {t('workOrders.dueDate')}
                    </label>
                    <input
                        type="datetime-local"
                        name="due_date"
                        value={formData.due_date}
                        onChange={handleChange}
                        className={cn(inputClass, 'font-inter')}
                    />
                </div>

                {/* Description */}
                <div>
                    <label className={labelClass}>
                        {t('common.description')}
                    </label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        placeholder={isRTL ? 'وصف تفصيلي للمشكلة...' : 'Detailed description of the issue...'}
                        rows={4}
                        className={cn(inputClass, 'resize-none')}
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border sticky bottom-0 bg-card">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 text-muted hover:text-primary hover:bg-muted/10 rounded-lg transition-colors font-cairo"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={createWorkOrder.isPending}
                        className={cn(
                            'flex items-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-lg',
                            'hover:bg-secondary/90 transition-colors font-cairo',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        {createWorkOrder.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {isRTL ? 'جاري الإنشاء...' : 'Creating...'}
                            </>
                        ) : (
                            <>
                                <ClipboardList className="w-4 h-4" />
                                {t('common.create')}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

