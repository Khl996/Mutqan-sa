import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTenants } from '@/hooks/useTenants'
import { useTenantUsersList } from '@/hooks/useTenantUsers'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
    Megaphone,
    Send,
    Users,
    Building2,
    Info,
    Loader2,
    UserCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function AnnouncementsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { data: tenants } = useTenants()

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formData, setFormData] = useState({
        targetType: 'all_tenants' as 'all_tenants' | 'specific_tenant' | 'specific_users',
        tenantId: '',
        title: '',
        message: '',
        type: 'info' as 'info' | 'success' | 'warning' | 'error' | 'alert'
    })

    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])

    // Fetch users if specific tenant is selected (for user selection mode)
    const { data: tenantUsers, isLoading: usersLoading } = useTenantUsersList(
        formData.targetType === 'specific_users' ? formData.tenantId : null
    )

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.title || !formData.message) {
            toast.error(isRTL ? 'يرجى تعبئة العنوان والرسالة' : 'Please fill title and message')
            return
        }

        if ((formData.targetType === 'specific_tenant' || formData.targetType === 'specific_users') && !formData.tenantId) {
            toast.error(isRTL ? 'يرجى اختيار المنشأة' : 'Please select a tenant')
            return
        }

        if (formData.targetType === 'specific_users' && selectedUserIds.length === 0) {
            toast.error(isRTL ? 'يرجى اختيار مستخدم واحد على الأقل' : 'Please select at least one user')
            return
        }

        try {
            setIsSubmitting(true)

            // Log for debugging
            console.log('📢 Broadcasting notification:', { ...formData, selectedUserIds })

            // Call the RPC function we created
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('broadcast_notification', {
                p_target_tenant_id: (formData.targetType === 'specific_tenant' || formData.targetType === 'specific_users') ? formData.tenantId : null,
                p_title: formData.title,
                p_message: formData.message,
                p_type: formData.type,
                p_link: null, // Optional link
                p_specific_user_ids: formData.targetType === 'specific_users' ? selectedUserIds : null
            })

            if (error) throw error

            const count = data as number

            toast.success(isRTL
                ? `تم إرسال التعميم بنجاح إلى ${count} مستخدم`
                : `Announcement sent successfully to ${count} users`
            )

            // Reset form
            setFormData({
                targetType: 'all_tenants',
                tenantId: '',
                title: '',
                message: '',
                type: 'info'
            })
            setSelectedUserIds([])

        } catch (error: any) {
            console.error('Broadcast error:', error)
            toast.error(error.message || (isRTL ? 'فشل الإرسال' : 'Failed to send'))
        } finally {
            setIsSubmitting(false)
        }
    }

    const toggleUserSelection = (userId: string) => {
        setSelectedUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        )
    }

    const selectAllUsers = () => {
        if (tenantUsers) {
            if (selectedUserIds.length === tenantUsers.length) {
                setSelectedUserIds([]) // Deselect all
            } else {
                setSelectedUserIds(tenantUsers.map(u => u.id)) // Select all
            }
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                    <Megaphone className="w-8 h-8 text-secondary" />
                    {isRTL ? 'التعاميم والإشعارات' : 'Announcements & Notifications'}
                </h1>
                <p className="text-muted font-cairo mt-1">
                    {isRTL
                        ? 'إرسال تعاميم وإشعارات عامة لجميع مستخدمي المنصة أو لمنشأة محددة.'
                        : 'Broadcast announcements to all platform users or specific tenants.'}
                </p>
            </div>

            {/* Form Card */}
            <div className="bg-card border rounded-xl shadow-sm p-6 md:p-8">
                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* Target Selection */}
                    <div className="space-y-4">
                        <label className="text-sm font-medium font-cairo text-foreground">
                            {isRTL ? 'الجهة المستهدفة' : 'Target Audience'}
                        </label>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, targetType: 'all_tenants', tenantId: '' })}
                                className={cn(
                                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer font-cairo",
                                    formData.targetType === 'all_tenants'
                                        ? "border-secondary bg-secondary/5 text-secondary ring-1 ring-secondary"
                                        : "border-border hover:border-secondary/50 text-muted-foreground"
                                )}
                            >
                                <Users className="w-6 h-6" />
                                <span className="font-bold">{isRTL ? 'جميع المنشآت' : 'All Tenants'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, targetType: 'specific_tenant' })}
                                className={cn(
                                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer font-cairo",
                                    formData.targetType === 'specific_tenant'
                                        ? "border-secondary bg-secondary/5 text-secondary ring-1 ring-secondary"
                                        : "border-border hover:border-secondary/50 text-muted-foreground"
                                )}
                            >
                                <Building2 className="w-6 h-6" />
                                <span className="font-bold">{isRTL ? 'منشأة محددة' : 'Specific Tenant'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, targetType: 'specific_users' })}
                                className={cn(
                                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer font-cairo",
                                    formData.targetType === 'specific_users'
                                        ? "border-secondary bg-secondary/5 text-secondary ring-1 ring-secondary"
                                        : "border-border hover:border-secondary/50 text-muted-foreground"
                                )}
                            >
                                <UserCheck className="w-6 h-6" />
                                <span className="font-bold">{isRTL ? 'مستخدمين محددين' : 'Specific Users'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Tenant & User Selection Area */}
                    {(formData.targetType === 'specific_tenant' || formData.targetType === 'specific_users') && (
                        <div className="bg-muted/5 p-4 rounded-xl border border-dashed space-y-4">
                            {/* Tenant Selector */}
                            <div>
                                <label className="text-sm font-medium font-cairo text-foreground mb-1 block">
                                    {isRTL ? 'اختر المنشأة' : 'Select Tenant'}
                                </label>
                                <select
                                    value={formData.tenantId}
                                    onChange={(e) => {
                                        setFormData({ ...formData, tenantId: e.target.value })
                                        setSelectedUserIds([]) // Reset users when tenant changes
                                    }}
                                    className="w-full p-3 bg-background border rounded-xl focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    required
                                >
                                    <option value="">{isRTL ? 'اختر...' : 'Select...'}</option>
                                    {tenants?.map(t => (
                                        <option key={t.id} value={t.id}>
                                            {isRTL ? t.name_ar || t.name : t.name} ({t.slug})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* User Selector (Only if specific_users + tenant selected) */}
                            {formData.targetType === 'specific_users' && formData.tenantId && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium font-cairo text-foreground">
                                            {isRTL ? 'اختر المستخدمين' : 'Select Users'}
                                            <span className="text-muted-foreground mx-1">({selectedUserIds.length})</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={selectAllUsers}
                                            className="text-xs text-secondary font-bold hover:underline font-cairo"
                                        >
                                            {tenantUsers && selectedUserIds.length === tenantUsers.length
                                                ? (isRTL ? 'إلغاء تحديد الكل' : 'Deselect All')
                                                : (isRTL ? 'تحديد الكل' : 'Select All')}
                                        </button>
                                    </div>

                                    {usersLoading ? (
                                        <div className="text-center py-4">
                                            <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 border rounded-lg bg-background">
                                            {tenantUsers?.length === 0 ? (
                                                <p className="col-span-2 text-center text-sm text-muted-foreground py-2 font-cairo">
                                                    {isRTL ? 'لا يوجد مستخدمين' : 'No users found'}
                                                </p>
                                            ) : (
                                                tenantUsers?.map(user => (
                                                    <div
                                                        key={user.id}
                                                        onClick={() => toggleUserSelection(user.id)}
                                                        className={cn(
                                                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border",
                                                            selectedUserIds.includes(user.id)
                                                                ? "bg-secondary/10 border-secondary/30"
                                                                : "hover:bg-muted border-transparent"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                                                            selectedUserIds.includes(user.id)
                                                                ? "bg-secondary border-secondary text-white"
                                                                : "border-muted-foreground"
                                                        )}>
                                                            {selectedUserIds.includes(user.id) && <UserCheck className="w-3 h-3" />}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium truncate font-cairo">
                                                                {isRTL ? user.full_name_ar || user.full_name : user.full_name}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground truncate">{user.role}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="h-px bg-border my-2" />

                    {/* Message Details */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium font-cairo text-foreground mb-1 block">
                                    {isRTL ? 'عنوان التعميم' : 'Subject'}
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder={isRTL ? 'مثال: تحديث هام في النظام' : 'e.g. Important System Update'}
                                    className="w-full p-3 bg-background border rounded-xl focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium font-cairo text-foreground mb-1 block">
                                    {isRTL ? 'نوع الإشعار' : 'Type'}
                                </label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                                    className="w-full p-3 bg-background border rounded-xl focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                >
                                    <option value="info">{isRTL ? 'معلومة (أزرق)' : 'Info'}</option>
                                    <option value="success">{isRTL ? 'نجاح (أخضر)' : 'Success'}</option>
                                    <option value="warning">{isRTL ? 'تنبيه (أصفر)' : 'Warning'}</option>
                                    <option value="error">{isRTL ? 'خطأ / هام (أحمر)' : 'Error/Critical'}</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium font-cairo text-foreground mb-1 block">
                                {isRTL ? 'نص الرسالة' : 'Message Body'}
                            </label>
                            <textarea
                                value={formData.message}
                                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                placeholder={isRTL ? 'اكتب نص التعميم هنا...' : 'Type your announcement here...'}
                                rows={6}
                                className="w-full p-3 bg-background border rounded-xl focus:ring-2 focus:ring-secondary/20 outline-none font-cairo resize-none"
                                required
                            />
                        </div>
                    </div>

                    {/* Info Box */}
                    <div className="bg-info/10 text-info p-4 rounded-xl flex items-start gap-3 text-sm font-cairo">
                        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold mb-1">{isRTL ? 'ملاحظة هامة:' : 'Important Note:'}</p>
                            <p>{isRTL
                                ? 'عند الضغط على إرسال، سيتم إرسال إشعار داخل النظام + رسالة بريد إلكتروني تلقائياً لجميع المستخدمين المستهدفين.'
                                : 'When clicking send, in-app notification + email will be sent automatically to all targeted users.'}
                            </p>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-8 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all font-bold font-cairo shadow-lg shadow-primary/20"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {isRTL ? 'جاري الإرسال...' : 'Sending...'}
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5" />
                                    {isRTL ? 'إرسال التعميم' : 'Send Announcement'}
                                </>
                            )}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    )
}
