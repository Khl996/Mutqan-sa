import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
    Settings,
    User,
    Bell,
    Palette,
    Globe,
    Moon,
    Sun,
    Save,
    Mail,
    Phone,
    Building2,
    Shield,
    Check,
    QrCode,
    ChevronRight,
} from 'lucide-react'

export default function SettingsPage() {
    const navigate = useNavigate()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { user, profile, refreshProfile } = useAuth()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileData = profile as any
    const { theme, setTheme } = useTheme()

    // Profile form state
    const [fullName, setFullName] = useState('')
    const [fullNameAr, setFullNameAr] = useState('')
    const [phone, setPhone] = useState('')
    const [department, setDepartment] = useState('')
    const [jobTitle, setJobTitle] = useState('')

    // Notification preferences
    const [emailNotifications, setEmailNotifications] = useState(true)
    const [pushNotifications, setPushNotifications] = useState(true)

    // Loading state
    const [isSaving, setIsSaving] = useState(false)

    // Populate form from profile
    useEffect(() => {
        if (profileData) {
            setFullName(profileData.full_name || '')
            setFullNameAr(profileData.full_name_ar || '')
            setPhone(profileData.phone || '')
            setDepartment(profileData.department || '')
            setJobTitle(profileData.job_title || '')

            const notifPrefs = profileData.notification_preferences
            if (notifPrefs) {
                setEmailNotifications(notifPrefs.email !== false)
                setPushNotifications(notifPrefs.push !== false)
            }
        }
    }, [profileData])

    // Save Profile
    const handleSaveProfile = async () => {
        if (!user) return
        setIsSaving(true)

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('profiles')
                .update({
                    full_name: fullName,
                    full_name_ar: fullNameAr,
                    phone,
                    department,
                    job_title: jobTitle,
                    notification_preferences: {
                        email: emailNotifications,
                        push: pushNotifications,
                    },
                    updated_at: new Date().toISOString(),
                }) as any)
                .eq('id', user.id)

            if (error) throw error

            await refreshProfile()
            toast.success(isRTL ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully')
        } catch (error) {
            console.error('Error saving profile:', error)
            toast.error(isRTL ? 'فشل حفظ الإعدادات' : 'Failed to save settings')
        } finally {
            setIsSaving(false)
        }
    }

    // Change Language
    const handleLanguageChange = (lang: string) => {
        i18n.changeLanguage(lang)
        localStorage.setItem('language', lang)
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                    <Settings className="w-7 h-7 text-secondary" />
                    {isRTL ? 'الإعدادات' : 'Settings'}
                </h1>
                <p className="text-muted font-cairo">
                    {isRTL ? 'إدارة إعدادات حسابك والنظام' : 'Manage your account and system settings'}
                </p>
            </div>

            {/* Profile Settings */}
            <SettingsSection
                title={isRTL ? 'الملف الشخصي' : 'Profile'}
                icon={User}
                description={isRTL ? 'معلوماتك الشخصية' : 'Your personal information'}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField
                        label={isRTL ? 'الاسم (إنجليزي)' : 'Full Name (English)'}
                        value={fullName}
                        onChange={setFullName}
                        icon={User}
                    />
                    <InputField
                        label={isRTL ? 'الاسم (عربي)' : 'Full Name (Arabic)'}
                        value={fullNameAr}
                        onChange={setFullNameAr}
                        icon={User}
                        dir="rtl"
                    />
                    <InputField
                        label={isRTL ? 'البريد الإلكتروني' : 'Email'}
                        value={user?.email || ''}
                        onChange={() => { }}
                        icon={Mail}
                        disabled
                    />
                    <InputField
                        label={isRTL ? 'رقم الهاتف' : 'Phone Number'}
                        value={phone}
                        onChange={setPhone}
                        icon={Phone}
                    />
                    <InputField
                        label={isRTL ? 'القسم' : 'Department'}
                        value={department}
                        onChange={setDepartment}
                        icon={Building2}
                    />
                    <InputField
                        label={isRTL ? 'المسمى الوظيفي' : 'Job Title'}
                        value={jobTitle}
                        onChange={setJobTitle}
                        icon={Shield}
                    />
                </div>
            </SettingsSection>

            {/* Appearance Settings */}
            <SettingsSection
                title={isRTL ? 'المظهر' : 'Appearance'}
                icon={Palette}
                description={isRTL ? 'تخصيص مظهر التطبيق' : 'Customize the app appearance'}
            >
                <div className="space-y-6">
                    {/* Theme Toggle */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground font-cairo mb-3 block">
                            {isRTL ? 'السمة' : 'Theme'}
                        </label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setTheme('light')}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-3 rounded-xl border transition-all",
                                    theme === 'light'
                                        ? "bg-primary/10 border-primary text-primary"
                                        : "bg-card border-border hover:border-primary/50"
                                )}
                            >
                                <Sun className="w-5 h-5" />
                                <span className="font-cairo">{isRTL ? 'فاتح' : 'Light'}</span>
                                {theme === 'light' && <Check className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={() => setTheme('dark')}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-3 rounded-xl border transition-all",
                                    theme === 'dark'
                                        ? "bg-primary/10 border-primary text-primary"
                                        : "bg-card border-border hover:border-primary/50"
                                )}
                            >
                                <Moon className="w-5 h-5" />
                                <span className="font-cairo">{isRTL ? 'داكن' : 'Dark'}</span>
                                {theme === 'dark' && <Check className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Language Toggle */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground font-cairo mb-3 block">
                            {isRTL ? 'اللغة' : 'Language'}
                        </label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleLanguageChange('ar')}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-3 rounded-xl border transition-all",
                                    i18n.language === 'ar'
                                        ? "bg-primary/10 border-primary text-primary"
                                        : "bg-card border-border hover:border-primary/50"
                                )}
                            >
                                <Globe className="w-5 h-5" />
                                <span className="font-cairo">العربية</span>
                                {i18n.language === 'ar' && <Check className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={() => handleLanguageChange('en')}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-3 rounded-xl border transition-all",
                                    i18n.language === 'en'
                                        ? "bg-primary/10 border-primary text-primary"
                                        : "bg-card border-border hover:border-primary/50"
                                )}
                            >
                                <Globe className="w-5 h-5" />
                                <span className="font-inter">English</span>
                                {i18n.language === 'en' && <Check className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </SettingsSection>

            {/* Notification Settings */}
            <SettingsSection
                title={isRTL ? 'الإشعارات' : 'Notifications'}
                icon={Bell}
                description={isRTL ? 'إدارة تفضيلات الإشعارات' : 'Manage your notification preferences'}
            >
                <div className="space-y-4">
                    <ToggleOption
                        label={isRTL ? 'إشعارات البريد الإلكتروني' : 'Email Notifications'}
                        description={isRTL ? 'استلام إشعارات عبر البريد' : 'Receive notifications via email'}
                        checked={emailNotifications}
                        onChange={setEmailNotifications}
                    />
                    <ToggleOption
                        label={isRTL ? 'الإشعارات الفورية' : 'Push Notifications'}
                        description={isRTL ? 'إشعارات فورية في المتصفح' : 'Browser push notifications'}
                        checked={pushNotifications}
                        onChange={setPushNotifications}
                    />
                </div>
            </SettingsSection>

            {/* Portal Settings */}
            <SettingsSection
                title={isRTL ? 'بوابة البلاغات العامة' : 'Public Reporting Portal'}
                icon={Globe}
                description={isRTL ? 'إعدادات استقبال البلاغات الخارجية' : 'Configure external reporting portal'}
            >
                <div
                    className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10 cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => navigate('/settings/portal')}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                            <QrCode className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h4 className="font-bold text-primary font-cairo">{isRTL ? 'إدارة بوابة البلاغات' : 'Manage Reporting Portal'}</h4>
                            <p className="text-sm text-muted-foreground font-cairo">{isRTL ? 'توليد روابط QR واستقبال بلاغات الزوار' : 'Generate QR codes and accept guest reports'}</p>
                        </div>
                    </div>
                    <ChevronRight className={cn("w-5 h-5 text-primary", isRTL && "rotate-180")} />
                </div>
            </SettingsSection>

            {/* Modules Settings */}
            <SettingsSection
                title={isRTL ? 'إدارة الموديولات' : 'Module Management'}
                icon={Settings}
                description={isRTL ? 'تفعيل وتعطيل الموديولات حسب الحاجة' : 'Enable and disable modules as needed'}
            >
                <div
                    className="flex items-center justify-between p-4 bg-secondary/5 rounded-xl border border-secondary/10 cursor-pointer hover:bg-secondary/10 transition-colors"
                    onClick={() => navigate('/settings/modules')}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                            <Settings className="w-6 h-6 text-secondary" />
                        </div>
                        <div>
                            <h4 className="font-bold text-secondary font-cairo">{isRTL ? 'تخصيص الموديولات' : 'Customize Modules'}</h4>
                            <p className="text-sm text-muted-foreground font-cairo">{isRTL ? 'تفعيل أو تعطيل الموديولات والميزات' : 'Enable or disable modules and features'}</p>
                        </div>
                    </div>
                    <ChevronRight className={cn("w-5 h-5 text-secondary", isRTL && "rotate-180")} />
                </div>
            </SettingsSection>

            {/* Tenant Settings */}
            <SettingsSection
                title={isRTL ? 'إعدادات المنشأة' : 'Tenant Settings'}
                icon={Building2}
                description={isRTL ? 'تخصيص سلوك النظام لمنشأتك' : 'Customize system behavior for your organization'}
            >
                <div
                    className="flex items-center justify-between p-4 bg-warning/5 rounded-xl border border-warning/10 cursor-pointer hover:bg-warning/10 transition-colors"
                    onClick={() => navigate('/settings/tenant')}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                            <Building2 className="w-6 h-6 text-warning" />
                        </div>
                        <div>
                            <h4 className="font-bold text-warning font-cairo">{isRTL ? 'إعدادات سلوك النظام' : 'System Behavior Settings'}</h4>
                            <p className="text-sm text-muted-foreground font-cairo">{isRTL ? 'أوامر العمل، الصيانة، المخزون، الإشعارات...' : 'Work orders, maintenance, inventory, notifications...'}</p>
                        </div>
                    </div>
                    <ChevronRight className={cn("w-5 h-5 text-warning", isRTL && "rotate-180")} />
                </div>
            </SettingsSection>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-secondary text-white rounded-xl font-cairo font-bold hover:bg-secondary/90 transition-colors disabled:opacity-50"
                >
                    <Save className="w-5 h-5" />
                    {isSaving
                        ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                        : (isRTL ? 'حفظ التغييرات' : 'Save Changes')
                    }
                </button>
            </div>
        </div>
    )
}

// Settings Section Component
function SettingsSection({
    title,
    icon: Icon,
    description,
    children
}: {
    title: string
    icon: React.ElementType
    description: string
    children: React.ReactNode
}) {
    return (
        <div className="bg-card rounded-xl border shadow-card overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b bg-muted/5">
                <div className="p-2 bg-secondary/10 rounded-lg">
                    <Icon className="w-5 h-5 text-secondary" />
                </div>
                <div>
                    <h3 className="font-bold font-cairo">{title}</h3>
                    <p className="text-xs text-muted-foreground font-cairo">{description}</p>
                </div>
            </div>
            <div className="p-6">
                {children}
            </div>
        </div>
    )
}

// Input Field Component
function InputField({
    label,
    value,
    onChange,
    icon: Icon,
    disabled = false,
    dir
}: {
    label: string
    value: string
    onChange: (v: string) => void
    icon: React.ElementType
    disabled?: boolean
    dir?: string
}) {
    return (
        <div>
            <label className="text-sm font-medium text-muted-foreground font-cairo mb-2 block">
                {label}
            </label>
            <div className="relative">
                <Icon className="absolute top-1/2 -translate-y-1/2 left-3 rtl:right-3 rtl:left-auto w-5 h-5 text-muted-foreground" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    dir={dir}
                    className={cn(
                        "w-full py-3 pl-10 rtl:pr-10 rtl:pl-4 pr-4 bg-background border border-border rounded-xl",
                        "focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-cairo",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                />
            </div>
        </div>
    )
}

// Toggle Option Component
function ToggleOption({
    label,
    description,
    checked,
    onChange
}: {
    label: string
    description: string
    checked: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between p-4 bg-muted/5 rounded-xl">
            <div>
                <p className="font-medium font-cairo">{label}</p>
                <p className="text-xs text-muted-foreground font-cairo">{description}</p>
            </div>
            <button
                onClick={() => onChange(!checked)}
                className={cn(
                    "w-12 h-7 rounded-full transition-colors relative",
                    checked ? "bg-secondary" : "bg-muted"
                )}
            >
                <div className={cn(
                    "absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform",
                    checked ? "right-1 rtl:left-1 rtl:right-auto" : "left-1 rtl:right-1 rtl:left-auto"
                )} />
            </button>
        </div>
    )
}
