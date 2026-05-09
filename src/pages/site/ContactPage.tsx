import { useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft,
    ArrowRight,
    Mail,
    ShieldCheck,
} from 'lucide-react'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteNav } from '@/components/site/SiteNav'
import { cn } from '@/lib/utils'

const CONTACT_EMAIL = 'info@mutqan-sa.com'

type DemoRequestForm = {
    fullName: string
    company: string
    jobTitle: string
    email: string
    phone: string
    facilityType: string
    scale: string
    improvements: string[]
    message: string
}

type FormLabels = Record<keyof DemoRequestForm, string>
type FieldErrors = Partial<Record<keyof DemoRequestForm, string>>
type TextField = Exclude<keyof DemoRequestForm, 'improvements'>

type ValidationCopy = {
    required: string
    email: string
    improvements: string
}

type EmailBodyCopy = {
    intro: string
    footer: string
}

const emptyForm: DemoRequestForm = {
    fullName: '',
    company: '',
    jobTitle: '',
    email: '',
    phone: '',
    facilityType: '',
    scale: '',
    improvements: [],
    message: '',
}

export default function ContactPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const CtaArrow = isRTL ? ArrowLeft : ArrowRight
    const [form, setForm] = useState<DemoRequestForm>(emptyForm)
    const [errors, setErrors] = useState<FieldErrors>({})
    const [submitState, setSubmitState] = useState<'idle' | 'error' | 'prepared'>('idle')
    const [lastMailtoHref, setLastMailtoHref] = useState('')

    const labels = t('contactPage.form.labels', { returnObjects: true }) as FormLabels
    const validation = t('contactPage.form.validation', { returnObjects: true }) as ValidationCopy
    const emailBodyCopy = t('contactPage.form.emailBody', { returnObjects: true }) as EmailBodyCopy
    const facilityOptions = t('contactPage.form.facilityOptions', { returnObjects: true }) as string[]
    const improvementOptions = t('contactPage.form.improvementOptions', { returnObjects: true }) as string[]
    const directEmailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('contactPage.emailSubject'))}`

    function updateField(field: TextField, value: string) {
        setForm((current) => ({ ...current, [field]: value }))
        clearError(field)
    }

    function clearError(field: keyof DemoRequestForm) {
        setErrors((current) => {
            if (!current[field]) {
                return current
            }
            const next = { ...current }
            delete next[field]
            return next
        })
        setSubmitState('idle')
    }

    function handleImprovementChange(value: string, checked: boolean) {
        setForm((current) => ({
            ...current,
            improvements: checked
                ? [...current.improvements, value]
                : current.improvements.filter((item) => item !== value),
        }))
        clearError('improvements')
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const nextErrors = validateForm(form, validation)
        setErrors(nextErrors)

        if (Object.keys(nextErrors).length > 0) {
            setSubmitState('error')
            return
        }

        const mailtoHref = buildMailtoHref(form, labels, emailBodyCopy, t('contactPage.emailSubject'))
        setLastMailtoHref(mailtoHref)
        setSubmitState('prepared')
        window.location.href = mailtoHref
    }

    return (
        <div className="min-h-screen bg-[var(--mutqan-bg)] font-cairo text-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
            <SiteNav variant="dark" />

            <main>
                <section
                    className="relative overflow-hidden bg-[#0b1320] px-4 pb-10 pt-28 text-white sm:px-6 sm:pb-12 sm:pt-32 lg:px-8"
                    style={{
                        backgroundImage:
                            'linear-gradient(180deg, rgba(118,213,208,0.08) 0%, transparent 42%), linear-gradient(115deg, transparent 0%, rgba(0,178,169,0.12) 44%, transparent 66%), linear-gradient(135deg, #0b1320 0%, #111f2e 55%, #132233 100%)',
                    }}
                >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-transparent via-[#7be4df] to-transparent opacity-75" />
                    <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
                    <div className="relative mx-auto max-w-3xl text-center">
                        <p className="text-sm font-bold text-[#7be4df]">{t('contactPage.heroEyebrow')}</p>
                        <h1 className="mt-3 text-balance text-3xl font-black leading-[1.24] sm:text-5xl">
                            {t('contactPage.heroTitle')}
                        </h1>
                        <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-slate-300">
                            {t('contactPage.heroBody')}
                        </p>
                    </div>
                </section>

                <section className="px-4 pb-16 pt-8 sm:px-6 lg:px-8">
                    <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
                        <form onSubmit={handleSubmit} noValidate className="rounded-lg border border-slate-200 bg-white p-5 shadow-card sm:p-6">
                            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <h2 className="text-2xl font-black leading-9 text-slate-950">
                                        {t('contactPage.form.title')}
                                    </h2>
                                    <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600">
                                        {t('contactPage.form.body')}
                                    </p>
                                </div>
                                <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#00b2a9]/25 bg-[#00b2a9]/10 px-3 py-2 text-xs font-black text-[var(--mutqan-accent)]">
                                    <ShieldCheck className="h-4 w-4" />
                                    {t('contactPage.form.requiredNote')}
                                </span>
                            </div>

                            {submitState === 'error' && (
                                <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700" role="alert">
                                    {t('contactPage.form.errorSummary')}
                                </div>
                            )}

                            {submitState === 'prepared' && (
                                <div className="mt-5 rounded-lg border border-[#00b2a9]/25 bg-[#00b2a9]/10 p-4" role="status">
                                    <h3 className="flex items-center gap-2 text-sm font-black text-[#0b1320]">
                                        <Mail className="h-4 w-4 text-[var(--mutqan-accent)]" />
                                        {t('contactPage.form.mailtoPreparedTitle')}
                                    </h3>
                                    <p className="mt-2 text-sm leading-7 text-slate-700">
                                        {t('contactPage.form.mailtoPreparedBody')}
                                    </p>
                                    <a
                                        href={lastMailtoHref}
                                        className="mt-3 inline-flex items-center gap-2 text-sm font-black text-[var(--mutqan-accent)] underline-offset-4 hover:underline"
                                    >
                                        {t('contactPage.form.mailtoFallbackCta')}
                                        <CtaArrow className="h-4 w-4" />
                                    </a>
                                </div>
                            )}

                            <div className="mt-6 grid gap-5 md:grid-cols-2">
                                <FieldShell id="fullName" label={labels.fullName} error={errors.fullName} required>
                                    <TextInput
                                        id="fullName"
                                        value={form.fullName}
                                        placeholder={t('contactPage.form.placeholders.fullName')}
                                        error={errors.fullName}
                                        autoComplete="name"
                                        onChange={(event) => updateField('fullName', event.target.value)}
                                    />
                                </FieldShell>

                                <FieldShell id="company" label={labels.company} error={errors.company} required>
                                    <TextInput
                                        id="company"
                                        value={form.company}
                                        placeholder={t('contactPage.form.placeholders.company')}
                                        error={errors.company}
                                        autoComplete="organization"
                                        onChange={(event) => updateField('company', event.target.value)}
                                    />
                                </FieldShell>

                                <FieldShell id="email" label={labels.email} error={errors.email} required>
                                    <TextInput
                                        id="email"
                                        type="email"
                                        value={form.email}
                                        placeholder={t('contactPage.form.placeholders.email')}
                                        error={errors.email}
                                        autoComplete="email"
                                        dir="ltr"
                                        onChange={(event) => updateField('email', event.target.value)}
                                    />
                                </FieldShell>

                                <FieldShell id="phone" label={labels.phone} error={errors.phone} required>
                                    <TextInput
                                        id="phone"
                                        type="tel"
                                        value={form.phone}
                                        placeholder={t('contactPage.form.placeholders.phone')}
                                        error={errors.phone}
                                        autoComplete="tel"
                                        dir="ltr"
                                        onChange={(event) => updateField('phone', event.target.value)}
                                    />
                                </FieldShell>

                                <FieldShell id="facilityType" label={labels.facilityType} error={errors.facilityType} required>
                                    <select
                                        id="facilityType"
                                        value={form.facilityType}
                                        onChange={(event) => updateField('facilityType', event.target.value)}
                                        className={fieldClass(errors.facilityType)}
                                        aria-invalid={Boolean(errors.facilityType)}
                                    >
                                        <option value="" disabled>
                                            {t('contactPage.form.placeholders.facilityType')}
                                        </option>
                                        {facilityOptions.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </FieldShell>
                            </div>

                            <fieldset className="mt-6">
                                <legend className="text-sm font-black text-slate-900">
                                    {labels.improvements}
                                    <span className="mx-1 text-[var(--mutqan-accent)]">*</span>
                                </legend>
                                <p className="mt-1 text-xs font-semibold text-slate-500">{t('contactPage.form.improvementsHint')}</p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                    {improvementOptions.map((option) => {
                                        const checked = form.improvements.includes(option)
                                        return (
                                            <label
                                                key={option}
                                                className={cn(
                                                    'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm font-bold transition-colors',
                                                    checked
                                                        ? 'border-[#00b2a9]/50 bg-[#00b2a9]/10 text-[#0b1320]'
                                                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#00b2a9]/35'
                                                )}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(event) => handleImprovementChange(option, event.target.checked)}
                                                    className="h-4 w-4 rounded border-slate-300 text-[var(--mutqan-accent)] focus:ring-[#00b2a9]"
                                                />
                                                <span>{option}</span>
                                            </label>
                                        )
                                    })}
                                </div>
                                {errors.improvements && <FieldError id="improvements-error">{errors.improvements}</FieldError>}
                            </fieldset>

                            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                                <p className="text-sm font-black text-slate-800">{t('contactPage.form.optionalTitle')}</p>
                                <div className="mt-4 grid gap-5 md:grid-cols-2">
                                    <FieldShell id="jobTitle" label={labels.jobTitle}>
                                        <TextInput
                                            id="jobTitle"
                                            value={form.jobTitle}
                                            placeholder={t('contactPage.form.placeholders.jobTitle')}
                                            onChange={(event) => updateField('jobTitle', event.target.value)}
                                        />
                                    </FieldShell>

                                    <FieldShell id="scale" label={labels.scale}>
                                        <TextInput
                                            id="scale"
                                            value={form.scale}
                                            placeholder={t('contactPage.form.placeholders.scale')}
                                            onChange={(event) => updateField('scale', event.target.value)}
                                        />
                                    </FieldShell>
                                </div>

                                <div className="mt-5">
                                    <FieldShell id="message" label={labels.message}>
                                        <textarea
                                            id="message"
                                            value={form.message}
                                            placeholder={t('contactPage.form.placeholders.message')}
                                            onChange={(event) => updateField('message', event.target.value)}
                                            rows={4}
                                            className="min-h-[112px] w-full resize-y rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-7 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#00b2a9] focus:ring-2 focus:ring-[#00b2a9]/20"
                                        />
                                    </FieldShell>
                                </div>
                            </div>

                            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                <p className="text-sm font-bold leading-6 text-amber-800">{t('contactPage.form.mailtoNoticeBody')}</p>
                            </div>

                            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                                <button
                                    type="submit"
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--mutqan-accent)] px-6 text-sm font-black text-white shadow-[0_18px_44px_-30px_rgba(0,178,169,0.95)] transition-colors hover:bg-[#00968f] sm:w-auto"
                                >
                                    <Mail className="h-4 w-4" />
                                    {t('contactPage.form.submit')}
                                </button>
                                <a
                                    href={directEmailHref}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 transition-colors hover:border-[#00b2a9]/45 hover:text-[var(--mutqan-accent)] sm:w-auto"
                                    dir="ltr"
                                >
                                    {CONTACT_EMAIL}
                                    <CtaArrow className="h-4 w-4" />
                                </a>
                            </div>
                        </form>

                        <aside className="lg:sticky lg:top-28">
                            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#00b2a9]/10 text-[var(--mutqan-accent)]">
                                        <Mail className="h-5 w-5" />
                                    </span>
                                    <h2 className="text-xl font-black text-slate-950">{t('contactPage.directTitle')}</h2>
                                </div>
                                <p className="mt-3 text-sm leading-7 text-slate-600">
                                    {t('contactPage.directBody')}
                                </p>
                                <a
                                    href={directEmailHref}
                                    className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 transition-colors hover:border-[#00b2a9]/40 hover:text-[var(--mutqan-accent)]"
                                    dir="ltr"
                                >
                                    <Mail className="h-4 w-4" />
                                    {CONTACT_EMAIL}
                                </a>
                            </div>
                        </aside>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    )
}

function TextInput({
    error,
    onChange,
    ...props
}: {
    error?: string
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
    return (
        <input
            {...props}
            onChange={onChange}
            className={fieldClass(error)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${props.id}-error` : undefined}
        />
    )
}

function FieldShell({
    id,
    label,
    required = false,
    error,
    children,
}: {
    id: string
    label: string
    required?: boolean
    error?: string
    children: ReactNode
}) {
    return (
        <div>
            <label htmlFor={id} className="mb-2 block text-sm font-black text-slate-900">
                {label}
                {required && <span className="mx-1 text-[var(--mutqan-accent)]">*</span>}
            </label>
            {children}
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </div>
    )
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
    return (
        <p id={id} className="mt-2 text-xs font-bold leading-5 text-red-600">
            {children}
        </p>
    )
}

function fieldClass(error?: string) {
    return cn(
        'h-12 w-full rounded-lg border bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-2',
        error
            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
            : 'border-slate-200 focus:border-[#00b2a9] focus:ring-[#00b2a9]/20'
    )
}

function validateForm(form: DemoRequestForm, validation: ValidationCopy) {
    const errors: FieldErrors = {}

    if (!form.fullName.trim()) {
        errors.fullName = validation.required
    }

    if (!form.company.trim()) {
        errors.company = validation.required
    }

    if (!form.email.trim()) {
        errors.email = validation.required
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        errors.email = validation.email
    }

    if (!form.phone.trim()) {
        errors.phone = validation.required
    }

    if (!form.facilityType.trim()) {
        errors.facilityType = validation.required
    }

    if (form.improvements.length === 0) {
        errors.improvements = validation.improvements
    }

    return errors
}

function buildMailtoHref(form: DemoRequestForm, labels: FormLabels, copy: EmailBodyCopy, subject: string) {
    const bodyLines = [
        copy.intro,
        '',
        `${labels.fullName}: ${form.fullName.trim()}`,
        `${labels.company}: ${form.company.trim()}`,
        optionalLine(labels.jobTitle, form.jobTitle),
        `${labels.email}: ${form.email.trim()}`,
        `${labels.phone}: ${form.phone.trim()}`,
        `${labels.facilityType}: ${form.facilityType}`,
        optionalLine(labels.scale, form.scale),
        `${labels.improvements}: ${form.improvements.join(', ')}`,
        form.message.trim() ? `${labels.message}:\n${form.message.trim()}` : null,
        '',
        copy.footer,
    ].filter((line): line is string => line !== null)

    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`
}

function optionalLine(label: string, value: string) {
    return value.trim() ? `${label}: ${value.trim()}` : null
}
