import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
    useBuildings,
    useFloors,
    useCreateDepartment,
    useUpdateDepartment,
    Department,
} from '@/hooks/useFacilities'
import { useAuth } from '@/contexts/AuthContext'
import Modal from '@/components/ui/Modal'
import { MapPin, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DepartmentModalProps {
    isOpen: boolean
    onClose: () => void
    department?: Department | null
}

export default function DepartmentModal({ isOpen, onClose, department }: DepartmentModalProps) {
    const { t, i18n } = useTranslation()
    const { profile } = useAuth()
    const isRTL = i18n.language === 'ar'
    const isEdit = !!department

    const createDepartment = useCreateDepartment()
    const updateDepartment = useUpdateDepartment()
    const { data: buildings } = useBuildings()

    const [formData, setFormData] = useState({
        code: '',
        name: '',
        name_ar: '',
        building_id: '',
        floor_id: '',
        is_active: true,
    })

    const { data: floors } = useFloors(formData.building_id)

    useEffect(() => {
        if (!isOpen) return
        setFormData({
            code: department?.code ?? '',
            name: department?.name ?? '',
            name_ar: department?.name_ar ?? '',
            building_id: department?.building_id ?? '',
            floor_id: department?.floor_id ?? '',
            is_active: department?.is_active ?? true,
        })
    }, [isOpen, department])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        if (name === 'building_id') {
            setFormData(prev => ({ ...prev, building_id: value, floor_id: '' }))
            return
        }
        setFormData(prev => ({ ...prev, [name]: value }))
    }

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

        try {
            if (isEdit && department) {
                await updateDepartment.mutateAsync({
                    id: department.id,
                    code: formData.code,
                    name: formData.name,
                    name_ar: formData.name_ar || null,
                    building_id: formData.building_id || null,
                    floor_id: formData.floor_id || null,
                    is_active: formData.is_active,
                })
                toast.success(isRTL ? 'تم تحديث الموقع بنجاح' : 'Location updated successfully')
            } else {
                await createDepartment.mutateAsync({
                    tenant_id: tenantId,
                    code: formData.code,
                    name: formData.name,
                    name_ar: formData.name_ar || null,
                    building_id: formData.building_id || null,
                    floor_id: formData.floor_id || null,
                    is_active: true,
                })
                toast.success(isRTL ? 'تم إضافة الموقع بنجاح' : 'Location added successfully')
            }
            onClose()
        } catch (error: unknown) {
            console.error('Save department error:', error)
            const message = error instanceof Error ? error.message : ''
            toast.error(message || (isRTL ? 'حدث خطأ' : 'An error occurred'))
        }
    }

    const isPending = createDepartment.isPending || updateDepartment.isPending

    const inputClass = cn(
        'w-full px-4 py-2.5 bg-background border border-border rounded-lg',
        'focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none',
        'transition-colors font-cairo'
    )

    const labelClass = 'block text-sm font-medium text-primary mb-1.5 font-cairo'

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit
                ? (isRTL ? 'تعديل الموقع' : 'Edit Location')
                : (isRTL ? 'إضافة موقع' : 'Add Location')}
            size="lg"
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-secondary/10 rounded-2xl">
                        <MapPin className="w-10 h-10 text-secondary" />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'كود الموقع' : 'Location Code'} <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            name="code"
                            value={formData.code}
                            onChange={handleChange}
                            placeholder={isRTL ? 'مثال: LOC-PHARMACY' : 'e.g., LOC-PHARMACY'}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'اسم الموقع (إنجليزي)' : 'Location Name'} <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder={isRTL ? 'الاسم بالإنجليزية' : 'Location name'}
                            className={inputClass}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className={labelClass}>
                        {isRTL ? 'اسم الموقع (عربي)' : 'Location Name (Arabic)'}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'المبنى' : 'Building'}
                        </label>
                        <select
                            name="building_id"
                            value={formData.building_id}
                            onChange={handleChange}
                            className={cn(inputClass, 'cursor-pointer')}
                        >
                            <option value="">{isRTL ? 'بدون مبنى' : 'No building'}</option>
                            {buildings?.map(building => (
                                <option key={building.id} value={building.id}>
                                    {isRTL ? (building.name_ar || building.name) : building.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>
                            {isRTL ? 'الطابق' : 'Floor'}
                        </label>
                        <select
                            name="floor_id"
                            value={formData.floor_id}
                            onChange={handleChange}
                            className={cn(inputClass, 'cursor-pointer')}
                            disabled={!formData.building_id}
                        >
                            <option value="">{isRTL ? 'بدون طابق' : 'No floor'}</option>
                            {floors?.map(floor => (
                                <option key={floor.id} value={floor.id}>
                                    {isRTL ? (floor.name_ar || floor.name) : floor.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {isEdit && (
                    <label className="flex items-center gap-3 text-sm font-medium text-primary font-cairo">
                        <input
                            type="checkbox"
                            checked={formData.is_active}
                            onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                            className="h-5 w-5 accent-secondary"
                        />
                        {isRTL ? 'موقع نشط' : 'Active location'}
                    </label>
                )}

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
                        disabled={isPending}
                        className={cn(
                            'flex items-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-lg',
                            'hover:bg-secondary/90 transition-colors font-cairo',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {isRTL ? 'جاري الحفظ...' : 'Saving...'}
                            </>
                        ) : (
                            <>
                                <MapPin className="w-4 h-4" />
                                {isEdit ? t('common.save') : t('common.add')}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
