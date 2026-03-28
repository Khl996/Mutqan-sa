import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    User,
    Mail,
    Phone,
    Building2,
    Shield,
    Lock,
    Eye,
    EyeOff,
    Save,
    Loader2
} from 'lucide-react'

// Role display names
const ROLE_LABELS: Record<string, { en: string; ar: string }> = {
    platform_admin: { en: 'Platform Admin', ar: 'مدير المنصة' },
    tenant_admin: { en: 'Tenant Admin', ar: 'مدير المنشأة' },
    facility_manager: { en: 'Facility Manager', ar: 'مدير المرافق' },
    maintenance_manager: { en: 'Maintenance Manager', ar: 'مدير الصيانة' },
    engineer: { en: 'Engineer', ar: 'مهندس' },
    supervisor: { en: 'Supervisor', ar: 'مشرف' },
    technician: { en: 'Technician', ar: 'فني' },
    reporter: { en: 'Reporter', ar: 'مُبلغ' },
}

export default function ProfilePage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { user, profile } = useAuth()

    // Password change state
    const [showPasswordForm, setShowPasswordForm] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const roleLabel = profile?.role ? ROLE_LABELS[profile.role] : null
    const displayRole = roleLabel
        ? (isRTL ? roleLabel.ar : roleLabel.en)
        : profile?.role || '-'

    const handlePasswordChange = async () => {
        if (!newPassword || !confirmPassword) {
            toast.error(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill all fields')
            return
        }

        if (newPassword !== confirmPassword) {
            toast.error(isRTL ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match')
            return
        }

        if (newPassword.length < 10) {
            toast.error(isRTL ? 'كلمة المرور يجب أن تكون 10 أحرف على الأقل' : 'Password must be at least 10 characters')
            return
        }

        try {
            setIsLoading(true)
            const { error } = await supabase.auth.updateUser({ password: newPassword })

            if (error) throw error

            toast.success(isRTL ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully')
            setShowPasswordForm(false)
            setNewPassword('')
            setConfirmPassword('')
        } catch (error: any) {
            toast.error(error.message || (isRTL ? 'حدث خطأ' : 'An error occurred'))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                    <User className="w-7 h-7 text-secondary" />
                    {isRTL ? 'الملف الشخصي' : 'My Profile'}
                </h1>
                <p className="text-muted font-cairo">
                    {isRTL ? 'عرض معلومات حسابك' : 'View your account information'}
                </p>
            </div>

            {/* Profile Card */}
            <div className="bg-card rounded-xl shadow-card border overflow-hidden">
                {/* Avatar Header */}
                <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 p-8 flex flex-col items-center">
                    <div className="w-24 h-24 bg-secondary/20 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                        <span className="text-3xl font-bold text-secondary">
                            {profile?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                        </span>
                    </div>
                    <h2 className="mt-4 text-xl font-bold text-primary font-cairo">
                        {isRTL ? (profile?.full_name_ar || profile?.full_name) : profile?.full_name}
                    </h2>
                    <span className="mt-1 px-3 py-1 bg-secondary/10 text-secondary rounded-full text-sm font-medium font-cairo">
                        {displayRole}
                    </span>
                </div>

                {/* Info Section */}
                <div className="p-6 space-y-4">
                    {/* Email */}
                    <div className="flex items-center gap-4 p-4 bg-muted/20 rounded-xl">
                        <div className="p-3 bg-info/10 rounded-lg">
                            <Mail className="w-5 h-5 text-info" />
                        </div>
                        <div>
                            <p className="text-xs text-muted font-cairo">
                                {isRTL ? 'البريد الإلكتروني' : 'Email'}
                            </p>
                            <p className="font-medium text-primary font-inter">
                                {user?.email || '-'}
                            </p>
                        </div>
                    </div>

                    {/* Phone */}
                    {profile?.phone && (
                        <div className="flex items-center gap-4 p-4 bg-muted/20 rounded-xl">
                            <div className="p-3 bg-success/10 rounded-lg">
                                <Phone className="w-5 h-5 text-success" />
                            </div>
                            <div>
                                <p className="text-xs text-muted font-cairo">
                                    {isRTL ? 'رقم الهاتف' : 'Phone'}
                                </p>
                                <p className="font-medium text-primary font-inter">
                                    {profile.phone}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Role */}
                    <div className="flex items-center gap-4 p-4 bg-muted/20 rounded-xl">
                        <div className="p-3 bg-warning/10 rounded-lg">
                            <Shield className="w-5 h-5 text-warning" />
                        </div>
                        <div>
                            <p className="text-xs text-muted font-cairo">
                                {isRTL ? 'الدور' : 'Role'}
                            </p>
                            <p className="font-medium text-primary font-cairo">
                                {displayRole}
                            </p>
                        </div>
                    </div>

                    {/* Tenant/Organization */}
                    {profile?.tenant_id && (
                        <div className="flex items-center gap-4 p-4 bg-muted/20 rounded-xl">
                            <div className="p-3 bg-secondary/10 rounded-lg">
                                <Building2 className="w-5 h-5 text-secondary" />
                            </div>
                            <div>
                                <p className="text-xs text-muted font-cairo">
                                    {isRTL ? 'المنشأة' : 'Organization'}
                                </p>
                                <p className="font-medium text-primary font-cairo">
                                    {'-'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Password Change Section */}
            <div className="bg-card rounded-xl shadow-card border p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-destructive/10 rounded-lg">
                            <Lock className="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                            <h3 className="font-bold text-primary font-cairo">
                                {isRTL ? 'تغيير كلمة المرور' : 'Change Password'}
                            </h3>
                            <p className="text-xs text-muted font-cairo">
                                {isRTL ? 'تحديث كلمة مرور حسابك' : 'Update your account password'}
                            </p>
                        </div>
                    </div>
                    {!showPasswordForm && (
                        <button
                            onClick={() => setShowPasswordForm(true)}
                            className="px-4 py-2 bg-primary/10 text-primary rounded-lg font-medium hover:bg-primary/20 transition-colors font-cairo"
                        >
                            {isRTL ? 'تغيير' : 'Change'}
                        </button>
                    )}
                </div>

                {showPasswordForm && (
                    <div className="space-y-4 pt-4 border-t">
                        {/* New Password */}
                        <div>
                            <label className="block text-sm font-medium text-primary mb-2 font-cairo">
                                {isRTL ? 'كلمة المرور الجديدة' : 'New Password'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className={cn(
                                        "w-full p-3 border rounded-lg bg-background focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-inter",
                                        isRTL ? "pr-4 pl-12" : "pl-4 pr-12"
                                    )}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className={cn(
                                        "absolute top-1/2 -translate-y-1/2 p-2 text-muted hover:text-primary",
                                        isRTL ? "left-2" : "right-2"
                                    )}
                                >
                                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label className="block text-sm font-medium text-primary mb-2 font-cairo">
                                {isRTL ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full p-3 border rounded-lg bg-background focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-inter"
                                placeholder="••••••••"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handlePasswordChange}
                                disabled={isLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-secondary text-white rounded-lg font-bold hover:bg-secondary/90 transition-colors disabled:opacity-50 font-cairo"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Save className="w-5 h-5" />
                                )}
                                {isRTL ? 'حفظ' : 'Save'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowPasswordForm(false)
                                    setNewPassword('')
                                    setConfirmPassword('')
                                }}
                                className="px-4 py-3 bg-muted/20 text-muted-foreground rounded-lg font-bold hover:bg-muted/30 transition-colors font-cairo"
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
