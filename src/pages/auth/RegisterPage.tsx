import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
    CheckCircle2,
    Loader2,
    Mail,
    Phone,
    Eye,
    EyeOff
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    clearPendingRegistrationDraft,
    PendingRegistrationDraft,
    savePendingRegistrationDraft,
} from '@/lib/pendingRegistration'

// Step Types
type Step = 'org_info' | 'admin_info' | 'otp' | 'success'

interface FormData {
    // Org Info
    orgNameAr: string
    orgNameEn: string
    orgEmail: string
    orgPhone: string
    orgWebsite: string
    orgAddress: string
    orgCountry: string
    orgCity: string
    orgPostalCode: string
    crNumber: string
    taxNumber: string

    // Admin Info
    firstName: string
    lastName: string
    email: string
    phone: string
    password: string
    confirmPassword: string
}

import { useAuth } from '@/contexts/AuthContext'

export default function RegisterPage() {
    const { i18n } = useTranslation()
    const navigate = useNavigate()
    const { refreshProfile } = useAuth()
    const isRTL = i18n.language === 'ar'

    const [currentStep, setCurrentStep] = useState<Step>('org_info')
    const [isLoading, setIsLoading] = useState(false)
    const [otp, setOtp] = useState(['', '', '', '', '', ''])
    const [showPassword, setShowPassword] = useState(false)

    const getErrorMessage = (error: unknown, fallback: string) =>
        error instanceof Error ? error.message : fallback

    const [formData, setFormData] = useState<FormData>({
        orgNameAr: '',
        orgNameEn: '',
        orgEmail: '',
        orgPhone: '',
        orgWebsite: '',
        orgAddress: '',
        orgCountry: 'السعودية', // Default
        orgCity: '',
        orgPostalCode: '',
        crNumber: '',
        taxNumber: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
    })

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const buildPendingRegistrationDraft = (): PendingRegistrationDraft => ({
        version: 1,
        created_at: new Date().toISOString(),
        org_name_ar: formData.orgNameAr.trim(),
        org_name_en: formData.orgNameEn.trim(),
        org_email: (formData.orgEmail || formData.email).trim(),
        org_phone: formData.orgPhone.trim(),
        org_website: formData.orgWebsite.trim(),
        org_address: formData.orgAddress.trim(),
        org_country: formData.orgCountry.trim(),
        org_city: formData.orgCity.trim(),
        org_postal_code: formData.orgPostalCode.trim(),
        cr_number: formData.crNumber.trim(),
        tax_number: formData.taxNumber.trim(),
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        admin_email: formData.email.trim(),
        admin_phone: formData.phone.trim(),
    })

    const validateOrgInfo = () => {
        if (!formData.orgNameAr || !formData.orgNameEn || !formData.crNumber || !formData.taxNumber || !formData.orgCity || !formData.orgAddress) {
            toast.error(isRTL ? 'الرجاء تعبئة جميع الحقول المطلوبة' : 'Please fill all required fields')
            return false
        }
        return true
    }

    const validateAdminInfo = () => {
        if (!formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.phone) {
            toast.error(isRTL ? 'الرجاء تعبئة جميع الحقول المطلوبة' : 'Please fill all required fields')
            return false
        }
        if (formData.password !== formData.confirmPassword) {
            toast.error(isRTL ? 'كلمات المرور غير متطابقة' : 'Passwords do not match')
            return false
        }
        if (formData.password.length < 6) {
            toast.error(isRTL ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters')
            return false
        }
        return true
    }

    const handleNext = async () => {
        if (currentStep === 'org_info') {
            if (validateOrgInfo()) setCurrentStep('admin_info')
        } else if (currentStep === 'admin_info') {
            if (validateAdminInfo()) {
                setIsLoading(true)
                try {
                    const draft = buildPendingRegistrationDraft()

                    // 1. Trigger Sign Up to send OTP (via Email)
                    const { data, error } = await supabase.auth.signUp({
                        email: formData.email,
                        password: formData.password,
                        options: {
                            data: {
                                full_name: `${formData.firstName} ${formData.lastName}`,
                                full_name_ar: `${formData.firstName} ${formData.lastName}`,
                                phone: formData.phone,
                                registration_status: 'pending_tenant_setup',
                                registration_draft: draft,
                            }
                        }
                    })

                    if (error) {
                        if (error.message.includes('already registered')) {
                            toast.error(isRTL ? 'هذا البريد الإلكتروني مسجل مسبقاً' : 'Email already registered')
                        } else {
                            throw error
                        }
                        return
                    }

                    savePendingRegistrationDraft(draft)

                    // Check if session exists (Auto confirm enabled) or not (OTP required)
                    if (data.session) {
                        try {
                            await completeRegistrationAfterAuth(draft)
                            await refreshProfile()
                            setCurrentStep('success')
                        } catch (setupError) {
                            console.error('Workspace setup failed after auto-confirm:', setupError)
                            toast.error(
                                isRTL
                                    ? 'تم إنشاء الحساب لكن تجهيز المنشأة لم يكتمل بعد. سننقلك لخطوة الاستكمال.'
                                    : 'Your account was created, but workspace setup is still pending. We will take you to the completion step.',
                            )
                            navigate('/register/complete', { replace: true })
                        }
                        return
                    }

                    // If no session, OTP/Link was sent to email
                    setCurrentStep('otp')
                    toast.success(isRTL ? 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' : 'Verification code sent to your email')

                } catch (error: unknown) {
                    console.error('Signup error:', error)
                    toast.error(getErrorMessage(error, isRTL ? 'تعذر إنشاء الحساب الآن' : 'Could not create the account right now'))
                } finally {
                    setIsLoading(false)
                }
            }
        }
    }

    const handleBack = () => {
        if (currentStep === 'admin_info') setCurrentStep('org_info')
        if (currentStep === 'otp') setCurrentStep('admin_info')
    }

    const handleRegister = async () => {
        // Enforce 6 digit OTP for verification
        if (otp.join('').length !== 6) {
            toast.error(isRTL ? 'الرجاء إدخال رمز التحقق كامل (6 أرقام)' : 'Please enter full 6-digit OTP')
            return
        }

        setIsLoading(true)
        try {
            const draft = buildPendingRegistrationDraft()
            // 2. Verify OTP (Email)
            const { data, error } = await supabase.auth.verifyOtp({
                email: formData.email,
                token: otp.join(''),
                type: 'signup'
            })

            if (error) {
                toast.error(isRTL ? 'رمز التحقق غير صحيح أو منتهي الصلاحية' : 'Invalid or expired OTP')
                return
            }

            if (data.session) {
                try {
                    await completeRegistrationAfterAuth(draft)
                    await refreshProfile()
                    setCurrentStep('success')
                } catch (setupError) {
                    console.error('Workspace setup failed after OTP verification:', setupError)
                    toast.error(
                        isRTL
                            ? 'تم التحقق من البريد لكن تجهيز المنشأة لم يكتمل بعد. سننقلك لخطوة الاستكمال.'
                            : 'Email verification succeeded, but workspace setup is still pending. We will take you to the completion step.',
                    )
                    navigate('/register/complete', { replace: true })
                }
            }

        } catch (error: unknown) {
            console.error('Verification failed:', error)
            toast.error(isRTL ? 'رمز التحقق غير صحيح أو منتهي الصلاحية' : 'Invalid or expired OTP')
        } finally {
            setIsLoading(false)
        }
    }

    const waitForAuthenticatedSession = async () => {
        for (let attempt = 0; attempt < 10; attempt++) {
            const { data } = await supabase.auth.getSession()

            if (data.session?.user?.id) {
                return data.session.user.id
            }

            await new Promise(resolve => setTimeout(resolve, 250))
        }

        throw new Error('Authenticated session not ready')
    }

    const completeRegistrationAfterAuth = async (draft: PendingRegistrationDraft) => {
        await waitForAuthenticatedSession()

        const { error: rpcError } = await supabase.rpc('complete_pending_registration', {
            p_draft: draft,
        })

        if (rpcError) throw rpcError

        clearPendingRegistrationDraft()
    }

    const handleOtpChange = (index: number, value: string) => {
        if (isNaN(Number(value))) return
        const newOtp = [...otp]
        newOtp[index] = value
        setOtp(newOtp)

        if (value && index < 5) {
            const nextInput = document.getElementById(`otp-${index + 1}`)
            nextInput?.focus()
        }
    }

    return (
        <div className="w-full">
            {/* Mobile Logo */}
            <div className="md:hidden flex flex-col items-center mb-8">
                <img src="/images/logo-white.png" alt="Mutqan" className="w-24 h-auto object-contain mb-4 drop-shadow-md" />
            </div>

            {/* Register Card */}
            <div className="bg-white/95 backdrop-blur-[6px] rounded-2xl shadow-xl shadow-slate-900/5 p-8 border border-white/50 overflow-hidden relative min-h-[500px]">

                {/* Header */}
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-[#1A202C] font-cairo mb-2">
                        {isRTL ? 'تسجيل منشأة جديدة' : 'Register Organization'}
                    </h2>
                    <p className="text-[#6C7A86] font-cairo text-sm">
                        {currentStep === 'org_info' && (isRTL ? 'الخطوة 1: بيانات المنشأة' : 'Step 1: Organization Details')}
                        {currentStep === 'admin_info' && (isRTL ? 'الخطوة 2: بيانات المدير' : 'Step 2: Admin Details')}
                        {currentStep === 'otp' && (isRTL ? 'الخطوة 3: التحقق من البريد' : 'Step 3: Email Verification')}
                        {currentStep === 'success' && (isRTL ? 'تم التسجيل!' : 'Registration Complete')}
                    </p>
                </div>

                {/* Stepper Dots */}
                {currentStep !== 'success' && (
                    <div className="flex justify-center gap-2 mb-8">
                        <div className={cn("h-1.5 rounded-full transition-all duration-300", currentStep === 'org_info' ? "w-8 bg-secondary" : "w-4 bg-gray-200")} />
                        <div className={cn("h-1.5 rounded-full transition-all duration-300", currentStep === 'admin_info' ? "w-8 bg-secondary" : "w-4 bg-gray-200")} />
                        <div className={cn("h-1.5 rounded-full transition-all duration-300", currentStep === 'otp' ? "w-8 bg-secondary" : "w-4 bg-gray-200")} />
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {/* Step 1: Organization Info */}
                    {currentStep === 'org_info' && (
                        <motion.div
                            key="org_info"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'اسم المنشأة' : 'Organization Name'} *</label>
                                <input
                                    type="text"
                                    name="orgNameAr"
                                    value={formData.orgNameAr}
                                    onChange={handleInputChange}
                                    className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    placeholder={isRTL ? 'مثال: شركة المتطورة' : ''}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'الاسم بالإنجليزية' : 'English Name'} *</label>
                                <input
                                    type="text"
                                    name="orgNameEn"
                                    value={formData.orgNameEn}
                                    onChange={handleInputChange}
                                    className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all text-left"
                                    placeholder="e.g. Advanced Co."
                                    dir="ltr"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'الدولة' : 'Country'} *</label>
                                    <input
                                        type="text"
                                        name="orgCountry"
                                        value={formData.orgCountry}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'المدينة' : 'City'} *</label>
                                    <input
                                        type="text"
                                        name="orgCity"
                                        value={formData.orgCity}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'العنوان الوطني / الشارع' : 'Street Address'} *</label>
                                <input
                                    type="text"
                                    name="orgAddress"
                                    value={formData.orgAddress}
                                    onChange={handleInputChange}
                                    className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    placeholder={isRTL ? 'اسم الشارع، رقم المبنى...' : 'Street name, Building No...'}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'الرمز البريدي' : 'Postal Code'}</label>
                                    <input
                                        type="text"
                                        name="orgPostalCode"
                                        value={formData.orgPostalCode}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'هاتف المنشأة' : 'Organization Phone'}</label>
                                    <input
                                        type="tel"
                                        name="orgPhone"
                                        value={formData.orgPhone}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all text-left"
                                        placeholder="9665..."
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'الموقع الإلكتروني' : 'Website'}</label>
                                <input
                                    type="text"
                                    name="orgWebsite"
                                    value={formData.orgWebsite}
                                    onChange={handleInputChange}
                                    className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all text-left"
                                    dir="ltr"
                                    placeholder="https://..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'السجل التجاري' : 'CR Number'} *</label>
                                    <input
                                        type="text"
                                        name="crNumber"
                                        value={formData.crNumber}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'الرقم الضريبي' : 'Tax Number'} *</label>
                                    <input
                                        type="text"
                                        name="taxNumber"
                                        value={formData.taxNumber}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Admin Info */}
                    {currentStep === 'admin_info' && (
                        <motion.div
                            key="admin_info"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'الاسم الأول' : 'First Name'} *</label>
                                    <input
                                        type="text"
                                        name="firstName"
                                        value={formData.firstName}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'الاسم الأخير' : 'Last Name'} *</label>
                                    <input
                                        type="text"
                                        name="lastName"
                                        value={formData.lastName}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'رقم الجوال' : 'Mobile'} *</label>
                                <div className="relative">
                                    <Phone className="absolute top-3 left-3 w-4 h-4 text-gray-400" />
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 pl-10 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all text-left"
                                        placeholder="9665..."
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'البريد الإلكتروني' : 'Email'} *</label>
                                <div className="relative">
                                    <Mail className="absolute top-3 left-3 w-4 h-4 text-gray-400" />
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 pl-10 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                        dir="ltr"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">{isRTL ? 'سيتم إرسال رمز التحقق لهذا البريد' : 'Verification code will be sent here'}</p>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'كلمة المرور' : 'Password'} *</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                        dir="ltr"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute top-3 left-3 text-gray-400 hover:text-secondary"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{isRTL ? 'تأكيد كلمة المرور' : 'Confirm Password'} *</label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleInputChange}
                                    className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    dir="ltr"
                                />
                            </div>
                        </motion.div>
                    )}

                    {/* Step 3: OTP Verification */}
                    {currentStep === 'otp' && (
                        <motion.div
                            key="otp"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6 text-center py-4"
                        >
                            <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                                <Mail className="w-6 h-6 text-secondary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">{isRTL ? 'تحقق من بريدك الإلكتروني' : 'Check your email'}</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {isRTL ? `أدخل رمز التحقق (6 أرقام) المرسل إلى` : `Enter 6-digit code sent to`} <br />
                                    <span className="font-semibold text-secondary">{formData.email}</span>
                                </p>
                            </div>

                            <div className="flex justify-center gap-2 flex-row-reverse mt-4">
                                {otp.map((digit, index) => (
                                    <input
                                        key={index}
                                        id={`otp-${index}`}
                                        type="text"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleOtpChange(index, e.target.value)}
                                        className="w-10 h-12 text-center text-xl font-bold border-2 border-gray-200 rounded-lg focus:border-secondary focus:ring-0 outline-none transition-all"
                                    />
                                ))}
                            </div>

                            <p className="text-xs text-gray-400">
                                {isRTL ? 'قد يصل الرمز في الرسائل غير المرغوب فيها (Spam)' : 'Check spam folder if code not received'}
                            </p>
                        </motion.div>
                    )}

                    {/* Step 4: Success */}
                    {currentStep === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-8 space-y-6"
                        >
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-8 h-8 text-green-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-[#1A202C]">{isRTL ? 'تم التسجيل بنجاح!' : 'Registration Successful!'}</h2>
                                <p className="text-sm text-gray-500 mt-2">
                                    {isRTL ? 'جاري توجيهك...' : 'Redirecting...'}
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="w-full h-12 bg-secondary text-white rounded-xl font-bold hover:bg-secondary/90 transition-all shadow-lg"
                            >
                                {isRTL ? 'الذهاب للوحة التحكم' : 'Go to Dashboard'}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer Actions */}
                {currentStep !== 'success' && (
                    <div className="mt-8 pt-6 border-t border-[#E9EEF1] flex items-center justify-between gap-4">
                        {currentStep === 'org_info' ? (
                            <Link to="/login" className="text-sm text-secondary font-bold hover:underline">
                                {isRTL ? 'لديك حساب؟' : 'Login'}
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={handleBack}
                                className="text-sm text-gray-500 hover:text-[#1A202C] font-semibold"
                            >
                                {isRTL ? 'رجوع' : 'Back'}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={currentStep === 'otp' ? handleRegister : handleNext}
                            disabled={isLoading}
                            className={cn(
                                "flex-1 h-12 rounded-xl font-bold text-white font-cairo text-sm shadow-lg shadow-secondary/20 flex items-center justify-center gap-2",
                                "bg-secondary hover:bg-[#2B8C87] transition-all",
                                "disabled:opacity-70 disabled:cursor-not-allowed"
                            )}
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                currentStep === 'otp' ? (isRTL ? 'تأكيد' : 'Verify') : (isRTL ? 'التالي' : 'Next')
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
