import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateAsset, useAssetCategories } from '@/hooks/useAssets'
import { useBuildings, useFloors } from '@/hooks/useFacilities'
import { useTenantSubscription, useTenantUsage } from '@/hooks/useSubscription'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import Modal from '@/components/ui/Modal'
import { Box, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AddAssetModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function AddAssetModal({ isOpen, onClose }: AddAssetModalProps) {
    const { t, i18n } = useTranslation()
    const { profile } = useAuth()
    const { currentTenant } = useTenant()
    const isRTL = i18n.language === 'ar'

    // Guard: block if subscription expired or cancelled
    useEffect(() => {
        if (!isOpen) return
        const s = currentTenant?.subscription_status
        if (s === 'expired' || s === 'cancelled') {
            toast.error(isRTL
                ? 'اشتراكك منتهٍ. اختر باقة للاستمرار.'
                : 'Your subscription has expired. Choose a plan to continue.')
            onClose()
        }
    }, [isOpen, currentTenant?.subscription_status, isRTL, onClose])

    const createAsset = useCreateAsset()
    const { data: categories } = useAssetCategories()
    const { data: buildings } = useBuildings()

    const [formData, setFormData] = useState({
        code: '',
        name: '',
        name_ar: '',
        description: '',
        category_id: '',
        building_id: '',
        floor_id: '',
        manufacturer: '',
        model: '',
        serial_number: '',
        status: 'operational' as const,
        criticality: 'medium' as const,
        purchase_cost: '',
    })

    // Fetch floors based on selected building
    const { data: floors } = useFloors(formData.building_id)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target

        // Handle cascading resets
        if (name === 'building_id') {
            setFormData(prev => ({ ...prev, building_id: value, floor_id: '' }))
        } else if (name === 'floor_id') {
            setFormData(prev => ({ ...prev, floor_id: value }))
        } else {
            setFormData(prev => ({ ...prev, [name]: value }))
        }
    }

    const generateCode = () => {
        const prefix = 'AST'
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
        setFormData(prev => ({ ...prev, code: `${prefix}-${random}` }))
    }

    useEffect(() => {
        if (isOpen && !formData.code) {
            generateCode()
        }
    }, [isOpen])

    const { data: subscription } = useTenantSubscription(profile?.tenant_id || '')
    const { data: usage } = useTenantUsage(profile?.tenant_id || '')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.code || !formData.name) {
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
            // Check if limit is reached (and not infinite which is -1)
            const maxAssets = subscription.plan.max_assets
            if (maxAssets !== -1 && usage.assets_count >= maxAssets) {
                toast.error(isRTL
                    ? `عذراً، لقد استهلكت حد الأصول المسموح به في باقتك (${maxAssets})`
                    : `Sorry, you have reached the asset limit for your plan (${maxAssets})`
                )
                return
            }
        }

        try {
            await createAsset.mutateAsync({
                tenant_id: tenantId,
                code: formData.code,
                name: formData.name,
                name_ar: formData.name_ar || null,
                description: formData.description || null,
                category_id: formData.category_id || null,
                building_id: formData.building_id || null,
                floor_id: formData.floor_id || null,
                manufacturer: formData.manufacturer || null,
                model: formData.model || null,
                serial_number: formData.serial_number || null,
                status: formData.status,
                criticality: formData.criticality,
                purchase_cost: formData.purchase_cost ? parseFloat(formData.purchase_cost) : null,
            })

            toast.success(isRTL ? 'تم إضافة الأصل بنجاح' : 'Asset added successfully')

            // Reset form and close
            setFormData({
                code: '',
                name: '',
                name_ar: '',
                description: '',
                category_id: '',
                building_id: '',
                floor_id: '',
                manufacturer: '',
                model: '',
                serial_number: '',
                status: 'operational',
                criticality: 'medium',
                purchase_cost: '',
            })
            onClose()
        } catch (error: any) {
            console.error('Create asset error:', error)
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

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('assets.addAsset')} size="xl">
            <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">
                {/* ... (Previous fields: Icon, Code, Name ...) */}

                {/* Asset Icon (retained) */}
                <div className="flex justify-center mb-4">
                    <div className="p-4 bg-secondary/10 rounded-2xl">
                        <Box className="w-10 h-10 text-secondary" />
                    </div>
                </div>

                {/* Code & Name Row (retained) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'كود الأصل' : 'Asset Code'} <span className="text-destructive">*</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                name="code"
                                value={formData.code}
                                onChange={handleChange}
                                placeholder={isRTL ? 'مثال: AST-0001' : 'e.g., AST-0001'}
                                className={cn(inputClass, 'flex-1')}
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
                            {isRTL ? 'اسم الأصل (إنجليزي)' : 'Asset Name'} <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder={isRTL ? 'الاسم بالإنجليزية' : 'Asset name'}
                            className={inputClass}
                            required
                        />
                    </div>
                </div>

                {/* Arabic Name (retained) */}
                <div>
                    <label className={labelClass}>
                        {isRTL ? 'اسم الأصل (عربي)' : 'Asset Name (Arabic)'}
                    </label>
                    <input
                        type="text"
                        name="name_ar"
                        value={formData.name_ar}
                        onChange={handleChange}
                        placeholder={isRTL ? 'الاسم بالعربية' : 'Arabic name'}
                        className={inputClass}
                        dir="rtl"
                    />
                </div>

                {/* Category & Building */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {t('assets.category')}
                        </label>
                        <select
                            name="category_id"
                            value={formData.category_id}
                            onChange={handleChange}
                            className={selectClass}
                        >
                            <option value="">{isRTL ? 'اختر التصنيف' : 'Select category'}</option>
                            {categories?.map(cat => (
                                <option key={cat.id} value={cat.id}>
                                    {isRTL ? cat.name_ar : cat.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>
                            {t('assets.location')} (المبنى)
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
                </div>

                {/* Floor */}
                {(formData.building_id) && (
                    <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-top-2">
                        <div>
                            <label className={labelClass}>
                                {isRTL ? 'الطابق' : 'Floor'}
                            </label>
                            <select
                                name="floor_id"
                                value={formData.floor_id}
                                onChange={handleChange}
                                className={selectClass}
                                disabled={!floors?.length}
                            >
                                <option value="">{isRTL ? 'اختر الطابق' : 'Select floor'}</option>
                                {floors?.map(floor => (
                                    <option key={floor.id} value={floor.id}>
                                        {isRTL ? (floor.name_ar || `الطابق ${floor.level}`) : floor.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {/* Manufacturer & Model */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {t('assets.manufacturer')}
                        </label>
                        <input
                            type="text"
                            name="manufacturer"
                            value={formData.manufacturer}
                            onChange={handleChange}
                            placeholder={isRTL ? 'اسم المصنع' : 'Manufacturer name'}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>
                            {t('assets.model')}
                        </label>
                        <input
                            type="text"
                            name="model"
                            value={formData.model}
                            onChange={handleChange}
                            placeholder={isRTL ? 'رقم الموديل' : 'Model number'}
                            className={inputClass}
                        />
                    </div>
                </div>

                {/* Serial Number */}
                <div>
                    <label className={labelClass}>
                        {t('assets.serialNumber')}
                    </label>
                    <input
                        type="text"
                        name="serial_number"
                        value={formData.serial_number}
                        onChange={handleChange}
                        placeholder={isRTL ? 'الرقم التسلسلي' : 'Serial number'}
                        className={inputClass}
                    />
                </div>

                {/* Status & Criticality */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {t('assets.status')}
                        </label>
                        <select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            className={selectClass}
                        >
                            <option value="operational">{t('assets.operational')}</option>
                            <option value="under_maintenance">{t('assets.underMaintenance')}</option>
                            <option value="out_of_service">{t('assets.outOfService')}</option>
                            <option value="retired">{t('assets.retired')}</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>
                            {t('assets.criticality')}
                        </label>
                        <select
                            name="criticality"
                            value={formData.criticality}
                            onChange={handleChange}
                            className={selectClass}
                        >
                            <option value="low">{t('assets.low')}</option>
                            <option value="medium">{t('assets.medium')}</option>
                            <option value="high">{t('assets.high')}</option>
                            <option value="critical">{t('assets.critical')}</option>
                        </select>
                    </div>
                </div>

                {/* Purchase Cost */}
                <div>
                    <label className={labelClass}>
                        {t('assets.purchaseCost')}
                    </label>
                    <input
                        type="number"
                        name="purchase_cost"
                        value={formData.purchase_cost}
                        onChange={handleChange}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
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
                        placeholder={isRTL ? 'وصف الأصل (اختياري)' : 'Asset description (optional)'}
                        rows={3}
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
                        disabled={createAsset.isPending}
                        className={cn(
                            'flex items-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-lg',
                            'hover:bg-secondary/90 transition-colors font-cairo',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        {createAsset.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {isRTL ? 'جاري الإضافة...' : 'Adding...'}
                            </>
                        ) : (
                            <>
                                <Box className="w-4 h-4" />
                                {t('common.add')}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
