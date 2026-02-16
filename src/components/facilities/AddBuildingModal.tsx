import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateBuilding } from '@/hooks/useFacilities'
import { useTenantSubscription, useTenantUsage } from '@/hooks/useSubscription'
import { useAuth } from '@/contexts/AuthContext'
import Modal from '@/components/ui/Modal'
import { Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AddBuildingModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function AddBuildingModal({ isOpen, onClose }: AddBuildingModalProps) {
    const { t, i18n } = useTranslation()
    const { profile } = useAuth()
    const isRTL = i18n.language === 'ar'

    const createBuilding = useCreateBuilding()
    const { data: subscription } = useTenantSubscription(profile?.tenant_id || '')
    const { data: usage } = useTenantUsage(profile?.tenant_id || '')

    const [formData, setFormData] = useState({
        code: '',
        name: '',
        name_ar: '',
        description: '',
        address: '',
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.code || !formData.name) {
            toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields')
            return
        }

        const tenantId = profile?.tenant_id
        console.log('Profile:', profile)
        console.log('Tenant ID:', tenantId)

        if (!tenantId) {
            toast.error(isRTL ? 'لم يتم العثور على معرف المؤسسة' : 'Tenant ID not found')
            return
        }

        // Check Subscription Limits
        if (subscription?.plan && usage) {
            const maxBuildings = subscription.plan.max_buildings
            if (maxBuildings !== -1 && usage.buildings_count >= maxBuildings) {
                toast.error(isRTL
                    ? `عذراً، لقد استهلكت حد المباني المسموح به في باقتك (${maxBuildings})`
                    : `Sorry, you have reached the building limit for your plan (${maxBuildings})`
                )
                return
            }
        }

        try {
            // إرسال فقط الحقول الموجودة في هيكل الجدول
            await createBuilding.mutateAsync({
                tenant_id: tenantId,
                code: formData.code,
                name: formData.name,
                name_ar: formData.name_ar || null,
                description: formData.description || null,
                address: formData.address || null,
                is_active: true,
            })

            toast.success(isRTL ? 'تم إضافة المبنى بنجاح' : 'Building added successfully')

            // Reset form and close
            setFormData({
                code: '',
                name: '',
                name_ar: '',
                description: '',
                address: '',
            })
            onClose()
        } catch (error: any) {
            console.error('Create building error:', error)
            toast.error(error.message || (isRTL ? 'حدث خطأ' : 'An error occurred'))
        }
    }

    const inputClass = cn(
        'w-full px-4 py-2.5 bg-background border border-border rounded-lg',
        'focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none',
        'transition-colors font-cairo'
    )

    const labelClass = 'block text-sm font-medium text-primary mb-1.5 font-cairo'

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('facilities.addBuilding')} size="lg">
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Building Icon */}
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-secondary/10 rounded-2xl">
                        <Building2 className="w-10 h-10 text-secondary" />
                    </div>
                </div>

                {/* Code & Name Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'كود المبنى' : 'Building Code'} <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            name="code"
                            value={formData.code}
                            onChange={handleChange}
                            placeholder={isRTL ? 'مثال: BLD-004' : 'e.g., BLD-004'}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'اسم المبنى (إنجليزي)' : 'Building Name'} <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder={isRTL ? 'الاسم بالإنجليزية' : 'Building name'}
                            className={inputClass}
                            required
                        />
                    </div>
                </div>

                {/* Arabic Name */}
                <div>
                    <label className={labelClass}>
                        {isRTL ? 'اسم المبنى (عربي)' : 'Building Name (Arabic)'}
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

                {/* Address */}
                <div>
                    <label className={labelClass}>
                        {isRTL ? 'العنوان' : 'Address'}
                    </label>
                    <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        placeholder={isRTL ? 'عنوان المبنى' : 'Building address'}
                        className={inputClass}
                    />
                </div>

                {/* Description */}
                <div>
                    <label className={labelClass}>
                        {isRTL ? 'الوصف' : 'Description'}
                    </label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        placeholder={isRTL ? 'وصف المبنى (اختياري)' : 'Building description (optional)'}
                        rows={3}
                        className={cn(inputClass, 'resize-none')}
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 text-muted hover:text-primary hover:bg-muted/10 rounded-lg transition-colors font-cairo"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={createBuilding.isPending}
                        className={cn(
                            'flex items-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-lg',
                            'hover:bg-secondary/90 transition-colors font-cairo',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        {createBuilding.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {isRTL ? 'جاري الإضافة...' : 'Adding...'}
                            </>
                        ) : (
                            <>
                                <Building2 className="w-4 h-4" />
                                {t('common.add')}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
