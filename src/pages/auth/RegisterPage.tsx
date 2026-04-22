import { useEffect, useState } from 'react'
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
    const { t, i18n } = useTranslation()
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
        orgCountry: t('authPages.register.defaults.country'),
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

    useEffect(() => {
        const arDefault = i18n.getFixedT('ar')('authPages.register.defaults.country')
        const enDefault = i18n.getFixedT('en')('authPages.register.defaults.country')

        setFormData((prev) => {
            if (prev.orgCountry !== arDefault && prev.orgCountry !== enDefault) {
                return prev
            }

            return { ...prev, orgCountry: t('authPages.register.defaults.country') }
        })
    }, [i18n, t, isRTL])

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
            toast.error(t('authPages.register.errors.required'))
            return false
        }
        return true
    }

    const validateAdminInfo = () => {
        if (!formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.phone) {
            toast.error(t('authPages.register.errors.required'))
            return false
        }
        if (formData.password !== formData.confirmPassword) {
            toast.error(t('authPages.register.errors.passwordMismatch'))
            return false
        }
        if (formData.password.length < 10) {
            toast.error(t('authPages.register.errors.passwordMin'))
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
                            toast.error(t('authPages.register.errors.emailExists'))
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
                                t('authPages.register.errors.setupPendingAfterCreate'),
                            )
                            navigate('/register/complete', { replace: true })
                        }
                        return
                    }

                    // If no session, OTP/Link was sent to email
                    setCurrentStep('otp')
                    toast.success(t('authPages.register.errors.verificationSent'))

                } catch (error: unknown) {
                    console.error('Signup error:', error)
                    toast.error(getErrorMessage(error, t('authPages.register.errors.createFailed')))
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
            toast.error(t('authPages.register.errors.otpIncomplete'))
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
                toast.error(t('authPages.register.errors.otpInvalid'))
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
                        t('authPages.register.errors.setupPendingAfterVerify'),
                    )
                    navigate('/register/complete', { replace: true })
                }
            }

        } catch (error: unknown) {
            console.error('Verification failed:', error)
            toast.error(t('authPages.register.errors.otpInvalid'))
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
        <div className="w-full max-w-full min-w-0">
            {/* Mobile Logo */}
            <div className="md:hidden flex flex-col items-center mb-6">
                <img src="/images/logo-white.png" alt={t('authPages.mobileLogoAlt')} className="w-20 h-auto object-contain mb-4 drop-shadow-md" />
            </div>

            {/* Register Card */}
            <div className="max-w-full bg-white/95 backdrop-blur-[6px] rounded-xl shadow-card p-5 sm:p-8 border border-white/60 overflow-hidden relative min-h-[500px]">

                {/* Header */}
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-[#1A202C] font-cairo mb-2">
                        {t('authPages.register.title')}
                    </h2>
                    <p className="text-[#6C7A86] font-cairo text-sm">
                        {currentStep === 'org_info' && t('authPages.register.steps.orgInfo')}
                        {currentStep === 'admin_info' && t('authPages.register.steps.adminInfo')}
                        {currentStep === 'otp' && t('authPages.register.steps.otp')}
                        {currentStep === 'success' && t('authPages.register.steps.success')}
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
                                <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.orgName')} *</label>
                                <input
                                    type="text"
                                    name="orgNameAr"
                                    value={formData.orgNameAr}
                                    onChange={handleInputChange}
                                    className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    placeholder={t('authPages.register.fields.orgNamePlaceholder')}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.orgEnglishName')} *</label>
                                <input
                                    type="text"
                                    name="orgNameEn"
                                    value={formData.orgNameEn}
                                    onChange={handleInputChange}
                                    className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all text-left"
                                    placeholder={t('authPages.register.fields.orgEnglishNamePlaceholder')}
                                    dir="ltr"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.country')} *</label>
                                    <input
                                        type="text"
                                        name="orgCountry"
                                        value={formData.orgCountry}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.city')} *</label>
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
                                <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.streetAddress')} *</label>
                                <input
                                    type="text"
                                    name="orgAddress"
                                    value={formData.orgAddress}
                                    onChange={handleInputChange}
                                    className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    placeholder={t('authPages.register.fields.streetAddressPlaceholder')}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.postalCode')}</label>
                                    <input
                                        type="text"
                                        name="orgPostalCode"
                                        value={formData.orgPostalCode}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.orgPhone')}</label>
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
                                <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.website')}</label>
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

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.crNumber')} *</label>
                                    <input
                                        type="text"
                                        name="crNumber"
                                        value={formData.crNumber}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.taxNumber')} *</label>
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
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.firstName')} *</label>
                                    <input
                                        type="text"
                                        name="firstName"
                                        value={formData.firstName}
                                        onChange={handleInputChange}
                                        className="w-full h-11 bg-white border border-[#E9EEF1] rounded-xl px-4 text-sm focus:border-secondary focus:ring-4 focus:ring-secondary/10 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.lastName')} *</label>
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
                                <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.mobile')} *</label>
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
                                <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.email')} *</label>
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
                                <p className="text-[10px] text-gray-400 mt-1">{t('authPages.register.fields.emailHelper')}</p>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.password')} *</label>
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
                                <label className="text-xs font-semibold text-[#1A202C]">{t('authPages.register.fields.confirmPassword')} *</label>
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
                                <h3 className="font-bold text-lg">{t('authPages.register.otp.title')}</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {t('authPages.register.otp.descriptionPrefix')} <br />
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
                                {t('authPages.register.otp.spamHint')}
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
                                <h2 className="text-xl font-bold text-[#1A202C]">{t('authPages.register.successTitle')}</h2>
                                <p className="text-sm text-gray-500 mt-2">
                                    {t('authPages.register.redirecting')}
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="w-full h-12 bg-secondary text-white rounded-xl font-bold hover:bg-secondary/90 transition-all shadow-lg"
                            >
                                {t('authPages.register.goDashboard')}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer Actions */}
                {currentStep !== 'success' && (
                    <div className="mt-8 pt-6 border-t border-[#E9EEF1] flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                        {currentStep === 'org_info' ? (
                            <Link to="/login" className="text-center text-sm text-secondary font-bold hover:underline sm:text-start">
                                {t('authPages.register.hasAccount')}
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={handleBack}
                                className="text-center text-sm text-gray-500 hover:text-[#1A202C] font-semibold sm:text-start"
                            >
                                {t('authPages.register.back')}
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
                                currentStep === 'otp' ? t('authPages.register.verify') : t('authPages.register.next')
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
