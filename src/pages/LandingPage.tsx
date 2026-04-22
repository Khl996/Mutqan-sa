import { Link } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Building2,
    CalendarCheck,
    CheckCircle2,
    ClipboardList,
    Clock3,
    Factory,
    FileText,
    PackageCheck,
    ShieldCheck,
    Stethoscope,
    Users,
    Wrench,
    Zap,
    type LucideIcon,
} from 'lucide-react'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteNav } from '@/components/site/SiteNav'
import { cn } from '@/lib/utils'

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
}

const rise: Variants = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.46 } },
}

type IconText = {
    title: string
    body: string
}

type SignalCopy = {
    label: string
    value: string
}

type PreviewRow = {
    code: string
    title: string
    status: string
    priority: string
    owner: string
}

const signalMeta = [
    { icon: ClipboardList, tone: 'text-sky-300' },
    { icon: AlertTriangle, tone: 'text-amber-300' },
    { icon: ShieldCheck, tone: 'text-emerald-300' },
    { icon: CalendarCheck, tone: 'text-cyan-300' },
]

const productNavIcons: LucideIcon[] = [Activity, ClipboardList, Building2, CalendarCheck, BarChart3]
const problemIcons: LucideIcon[] = [ClipboardList, Clock3, AlertTriangle, BarChart3]
const workflowIcons: LucideIcon[] = [FileText, Users, Clock3, CheckCircle2]
const moduleIcons: LucideIcon[] = [ClipboardList, Building2, CalendarCheck, PackageCheck]
const industryIcons: LucideIcon[] = [Wrench, Stethoscope, Factory, Building2]

export default function LandingPage() {
    const { i18n } = useTranslation()
    const dir = i18n.language === 'ar' ? 'rtl' : 'ltr'

    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#071113] font-cairo text-slate-950" dir={dir}>
            <SiteNav variant="dark" />

            <main>
                <HeroSection />
                <ProblemSection />
                <SolutionSection />
                <WorkflowSection />
                <CoreModulesSection />
                <FitSection />
                <OutcomesSection />
                <ManagementTrustSection />
                <FinalCta />
            </main>

            <SiteFooter />
        </div>
    )
}

function HeroSection() {
    const { t } = useTranslation()
    const trustBullets = t('landing.hero.trustBullets', { returnObjects: true }) as string[]

    return (
        <section
            className="relative overflow-hidden bg-[#071113] px-4 pt-36 text-white sm:px-6 sm:pt-44 lg:px-8"
            style={{
                backgroundImage:
                    'radial-gradient(circle at 50% 18%, rgba(118,213,208,0.17), transparent 34%), linear-gradient(115deg, transparent 0%, rgba(58,175,169,0.17) 45%, transparent 66%), linear-gradient(135deg, #071113 0%, #0a1c1f 48%, #11181d 100%)',
            }}
        >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-transparent via-[#76D5D0] to-transparent opacity-80" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#071113] via-[#071113]/70 to-transparent" />

            <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-center pb-20">
                <motion.div initial="hidden" animate="visible" variants={stagger} className="mx-auto max-w-[340px] text-center sm:max-w-5xl">
                    <motion.p variants={rise} className="mb-5 text-sm font-black text-[#76D5D0]">
                        {t('landing.hero.eyebrow')}
                    </motion.p>

                    <motion.h1
                        variants={rise}
                        className="mx-auto max-w-full text-4xl font-black leading-[1.16] tracking-normal text-white drop-shadow-[0_18px_45px_rgba(0,0,0,0.48)] sm:max-w-none sm:text-6xl lg:text-7xl"
                    >
                        {t('landing.hero.headlineTop')}
                        <span className="block text-[#76D5D0]">{t('landing.hero.headlineAccent')}</span>
                    </motion.h1>

                    <motion.p variants={rise} className="mx-auto mt-6 max-w-full text-xl font-black leading-8 text-white sm:max-w-3xl sm:text-2xl">
                        {t('landing.hero.subheadline')}
                    </motion.p>

                    <motion.p variants={rise} className="mx-auto mt-4 max-w-full text-base leading-8 text-slate-300 sm:max-w-3xl sm:text-lg">
                        {t('landing.hero.description')}
                    </motion.p>

                    <motion.div variants={rise} className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <PrimaryCta />
                        <SecondaryCta />
                    </motion.div>

                    <motion.div variants={rise} className="mt-6 flex flex-col items-center justify-center gap-2 text-center text-sm text-slate-400 sm:flex-row sm:flex-wrap sm:gap-x-5">
                        {trustBullets.map((point) => (
                            <span key={point} className="inline-flex max-w-full items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-[#76D5D0]" />
                                {point}
                            </span>
                        ))}
                    </motion.div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.68, delay: 0.26 }}
                    className="relative mt-12 sm:mt-16"
                >
                    <div className="pointer-events-none absolute inset-x-6 -top-5 h-px bg-gradient-to-l from-transparent via-[#76D5D0]/80 to-transparent sm:inset-x-24" />
                    <div className="pointer-events-none absolute inset-x-12 top-8 h-44 rounded-lg bg-[#3AAFA9]/14 blur-3xl" />
                    <ProductPreview />
                </motion.div>
            </div>
        </section>
    )
}

function ProductPreview() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const signals = t('landing.preview.signals', { returnObjects: true }) as SignalCopy[]
    const productNav = t('landing.preview.nav', { returnObjects: true }) as string[]
    const rows = t('landing.preview.rows', { returnObjects: true }) as PreviewRow[]

    return (
        <>
            <div className="relative mx-auto block w-full max-w-[318px] overflow-hidden rounded-lg border border-[#76D5D0]/22 bg-[#0d171b]/96 p-4 shadow-[0_34px_110px_-40px_rgba(58,175,169,0.62),0_28px_90px_-48px_rgba(0,0,0,0.95)] ring-1 ring-[#3AAFA9]/14 sm:hidden">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-black text-white">{t('landing.preview.mobileTitle')}</div>
                        <div className="mt-1 text-xs text-slate-500">{t('landing.preview.mobileSubtitle')}</div>
                    </div>
                    <span className="rounded-lg border border-[#3AAFA9]/25 bg-[#3AAFA9]/10 px-2 py-1 text-xs font-bold text-[#9BE3DF]">
                        {t('landing.preview.slaActive')}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {signals.map(({ label, value }, index) => {
                        const Icon = signalMeta[index].icon
                        return (
                            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                                <Icon className={cn('mb-3 h-4 w-4', signalMeta[index].tone)} />
                                <div className="text-xl font-black text-white">{value}</div>
                                <div className="mt-1 text-xs text-slate-400">{label}</div>
                            </div>
                        )
                    })}
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <div className="mb-2 text-xs font-bold text-slate-400">{t('landing.preview.todayPriority')}</div>
                    {rows.slice(0, 2).map((row) => (
                        <div key={row.code} className="flex items-center justify-between gap-3 border-t border-white/8 py-3 first:border-t-0 first:pt-0 last:pb-0">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-white">{row.title}</div>
                                <div className="mt-1 text-xs text-slate-500" dir={isRTL ? 'rtl' : 'ltr'}>{row.code}</div>
                            </div>
                            <span className="shrink-0 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-xs font-bold text-[#9BE3DF]">
                                {row.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="relative mx-auto hidden w-full max-w-7xl overflow-hidden rounded-lg border border-[#76D5D0]/22 bg-[#0d171b]/96 shadow-[0_38px_120px_-42px_rgba(58,175,169,0.62),0_28px_90px_-48px_rgba(0,0,0,0.95)] ring-1 ring-[#3AAFA9]/14 sm:block">
                <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-l from-[#3AAFA9]/16 via-white/[0.04] to-transparent px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-400/75" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/75" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/75" />
                    </div>
                    <div className="text-sm font-bold text-white/78">{t('landing.preview.windowTitle')}</div>
                </div>

                <div className="grid min-h-[420px] md:grid-cols-[210px_minmax(0,1fr)]">
                    <aside className={cn('hidden bg-white/[0.025] p-4 md:block', isRTL ? 'border-l border-white/10' : 'border-r border-white/10')}>
                        <div className="mb-5 text-xs font-semibold text-white/40">{t('landing.preview.modulesTitle')}</div>
                        {productNav.map((label, index) => {
                            const Icon = productNavIcons[index]
                            return (
                                <div
                                    key={label}
                                    className={cn(
                                        'mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                                        index === 0 ? 'bg-[#3AAFA9]/16 text-white' : 'text-white/56'
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                </div>
                            )
                        })}
                    </aside>

                    <div className="min-w-0 p-4 sm:p-5">
                        <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-xl font-black text-white">{t('landing.preview.summaryTitle')}</h2>
                                <p className="mt-1 text-sm text-slate-400">{t('landing.preview.summaryBody')}</p>
                            </div>
                            <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#3AAFA9]/25 bg-[#3AAFA9]/10 px-3 py-2 text-sm font-bold text-[#9BE3DF]">
                                <Zap className="h-4 w-4" />
                                {t('landing.preview.slaActive')}
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {signals.map(({ label, value }, index) => {
                                const Icon = signalMeta[index].icon
                                return (
                                    <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                                        <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
                                            <span>{label}</span>
                                            <Icon className={cn('h-4 w-4', signalMeta[index].tone)} />
                                        </div>
                                        <div className="text-3xl font-black text-white">{value}</div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
                            <div className="grid grid-cols-[110px_minmax(0,1fr)_120px_110px] gap-3 bg-white/[0.04] px-3 py-3 text-xs font-bold text-slate-400">
                                <span>{t('landing.preview.headers.code')}</span>
                                <span>{t('landing.preview.headers.work')}</span>
                                <span>{t('landing.preview.headers.status')}</span>
                                <span>{t('landing.preview.headers.owner')}</span>
                            </div>
                            {rows.map((row) => (
                                <div key={row.code} className="grid grid-cols-[110px_minmax(0,1fr)_120px_110px] gap-3 border-t border-white/8 px-3 py-3 text-sm">
                                    <span className="font-bold text-white/76" dir={isRTL ? 'rtl' : 'ltr'}>{row.code}</span>
                                    <div className="min-w-0">
                                        <div className="truncate font-bold text-white">{row.title}</div>
                                        <div className="mt-1 text-xs text-slate-500">{row.priority}</div>
                                    </div>
                                    <span className="w-fit rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-xs font-bold text-[#9BE3DF]">
                                        {row.status}
                                    </span>
                                    <span className="truncate text-slate-400">{row.owner}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

function ProblemSection() {
    const { t } = useTranslation()
    const items = t('landing.problem.items', { returnObjects: true }) as IconText[]

    return (
        <section className="relative overflow-hidden bg-[#071113] px-4 py-20 text-white sm:px-6 lg:px-8">
            <DarkTexture />
            <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
                <SectionIntro
                    eyebrow={t('landing.problem.eyebrow')}
                    title={t('landing.problem.title')}
                    body={t('landing.problem.body')}
                    dark
                />

                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 shadow-[0_26px_90px_-58px_rgba(0,0,0,0.9)]">
                    <div className="divide-y divide-white/8">
                        {items.map(({ title, body }, index) => {
                            const Icon = problemIcons[index]
                            return (
                                <div key={title} className="grid gap-3 px-3 py-4 sm:grid-cols-[44px_minmax(0,1fr)] sm:px-4">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-[#3AAFA9]/10 text-[#9BE3DF]">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="mb-1 flex items-center gap-3">
                                            <span className="text-xs font-black text-[#76D5D0]">0{index + 1}</span>
                                            <h3 className="text-lg font-black text-white">{title}</h3>
                                        </div>
                                        <p className="text-sm leading-7 text-slate-400">{body}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <div className="mt-3 rounded-lg border border-[#76D5D0]/20 bg-[#3AAFA9]/10 px-4 py-4 text-center text-lg font-black text-white">
                        {t('landing.problem.closing')}
                    </div>
                </div>
            </div>
        </section>
    )
}

function SolutionSection() {
    const { t } = useTranslation()
    const points = t('landing.solution.points', { returnObjects: true }) as string[]

    return (
        <section className="relative overflow-hidden bg-[#eef5f4] px-4 py-20 sm:px-6 lg:px-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#071113] to-transparent" />
            <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div className="rounded-lg border border-slate-200/70 bg-white/80 p-6 shadow-[0_24px_80px_-54px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
                    <SectionIntro
                        eyebrow={t('landing.solution.eyebrow')}
                        title={t('landing.solution.title')}
                        body={t('landing.solution.body')}
                    />
                </div>

                <div className="grid gap-3">
                    {points.map((point, index) => (
                        <div key={point} className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-card">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#071113] text-sm font-black text-[#76D5D0]">
                                0{index + 1}
                            </span>
                            <span className="text-base font-black text-slate-950">{point}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function WorkflowSection() {
    const { t } = useTranslation()
    const steps = t('landing.workflow.steps', { returnObjects: true }) as IconText[]

    return (
        <section className="relative overflow-hidden bg-[#eef5f4] px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <SectionIntro
                    eyebrow={t('landing.workflow.eyebrow')}
                    title={t('landing.workflow.title')}
                    body={t('landing.workflow.body')}
                    centered
                />

                <div className="relative mt-12 grid gap-4 lg:grid-cols-4">
                    <div className="pointer-events-none absolute left-8 right-8 top-[30px] hidden h-px bg-gradient-to-l from-transparent via-[#3AAFA9]/55 to-transparent lg:block" />
                    {steps.map(({ title, body }, index) => {
                        const Icon = workflowIcons[index]
                        return (
                            <motion.div
                                key={title}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-80px' }}
                                variants={rise}
                                className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-card"
                            >
                                <div className="mb-5 flex items-center justify-between">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-[#3AAFA9]/20 bg-[#3AAFA9]/10 text-[#2E8F8A]">
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <span className="text-sm font-black text-slate-400">0{index + 1}</span>
                                </div>
                                <h3 className="text-xl font-black text-slate-950">{title}</h3>
                                <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

function CoreModulesSection() {
    const { t } = useTranslation()
    const modules = t('landing.modules.items', { returnObjects: true }) as IconText[]

    return (
        <section className="relative overflow-hidden bg-[#071113] px-4 py-20 text-white sm:px-6 lg:px-8">
            <DarkTexture />
            <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                <SectionIntro
                    eyebrow={t('landing.modules.eyebrow')}
                    title={t('landing.modules.title')}
                    body={t('landing.modules.body')}
                    dark
                />

                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                    {modules.map(({ title, body }, index) => {
                        const Icon = moduleIcons[index]
                        return (
                            <div key={title} className="grid gap-3 rounded-lg px-4 py-4 transition-colors hover:bg-white/[0.04] sm:grid-cols-[52px_minmax(0,1fr)_88px] sm:items-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-[#3AAFA9]/10 text-[#9BE3DF]">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">{title}</h3>
                                    <p className="mt-1 text-sm leading-7 text-slate-400">{body}</p>
                                </div>
                                <span className="hidden text-end text-xs font-black text-white/28 sm:block">0{index + 1}</span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

function FitSection() {
    const { t } = useTranslation()
    const industries = t('landing.fit.industries', { returnObjects: true }) as string[]

    return (
        <section className="bg-[#071113] px-4 pb-20 text-white sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl rounded-lg border border-[#76D5D0]/18 bg-[#102124] p-6 shadow-[0_30px_100px_-64px_rgba(58,175,169,0.65)]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-sm font-black text-[#76D5D0]">{t('landing.fit.eyebrow')}</p>
                        <h2 className="mt-2 text-3xl font-black text-white">{t('landing.fit.title')}</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {industries.map((label, index) => {
                            const Icon = industryIcons[index]
                            return (
                                <div key={label} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-bold text-slate-200">
                                    <Icon className="h-4 w-4 text-[#76D5D0]" />
                                    {label}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </section>
    )
}

function OutcomesSection() {
    const { t } = useTranslation()
    const outcomes = t('landing.outcomes.items', { returnObjects: true }) as string[]

    return (
        <section className="relative overflow-hidden bg-[#f4f8f7] px-4 py-20 sm:px-6 lg:px-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#071113] to-transparent" />
            <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
                <SectionIntro
                    eyebrow={t('landing.outcomes.eyebrow')}
                    title={t('landing.outcomes.title')}
                    body={t('landing.outcomes.body')}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                    {outcomes.map((item) => (
                        <div key={item} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-card">
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#2E8F8A]" />
                            <span className="font-black text-slate-950">{item}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function ManagementTrustSection() {
    const { t } = useTranslation()
    const managementSignals = t('landing.management.items', { returnObjects: true }) as string[]

    return (
        <section className="bg-[#f4f8f7] px-4 pb-20 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-7xl gap-6 rounded-lg border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-56px_rgba(15,23,42,0.35)] lg:grid-cols-[1fr_1.1fr] lg:p-8">
                <div>
                    <p className="text-sm font-black text-[#2E8F8A]">{t('landing.management.eyebrow')}</p>
                    <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                        {t('landing.management.title')}
                    </h2>
                    <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
                        {t('landing.management.body')}
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    {managementSignals.map((item, index) => (
                        <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <span className="text-xs font-black text-[#2E8F8A]">0{index + 1}</span>
                            <div className="mt-2 text-lg font-black text-slate-950">{item}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function FinalCta() {
    const { t } = useTranslation()

    return (
        <section
            className="relative overflow-hidden bg-[#071113] px-4 py-24 text-white sm:px-6 lg:px-8"
            style={{
                backgroundImage:
                    'radial-gradient(circle at 50% 20%, rgba(118,213,208,0.16), transparent 36%), linear-gradient(135deg, #071113 0%, #0d2225 55%, #11181d 100%)',
            }}
        >
            <DarkTexture />
            <div className="relative mx-auto max-w-3xl text-center">
                <p className="text-sm font-bold text-[#76D5D0]">{t('landing.finalCta.eyebrow')}</p>
                <h2 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">{t('landing.finalCta.title')}</h2>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                    {t('landing.finalCta.body')}
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <PrimaryCta />
                    <SecondaryCta />
                </div>
            </div>
        </section>
    )
}

function PrimaryCta() {
    const { t, i18n } = useTranslation()
    const CtaArrow = i18n.language === 'ar' ? ArrowLeft : ArrowRight

    return (
        <Link
            to="/contact"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#3AAFA9] px-6 text-base font-bold text-white shadow-[0_18px_44px_-26px_rgba(58,175,169,0.95)] transition-colors hover:bg-[#45bdb7] sm:w-auto"
        >
            {t('landing.hero.primaryCta')}
            <CtaArrow className="h-4 w-4" />
        </Link>
    )
}

function SecondaryCta() {
    const { t } = useTranslation()

    return (
        <Link
            to="/register"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/16 bg-white/8 px-6 text-base font-bold text-white transition-colors hover:bg-white/12 sm:w-auto"
        >
            {t('landing.hero.secondaryCta')}
        </Link>
    )
}

function SectionIntro({
    eyebrow,
    title,
    body,
    dark = false,
    centered = false,
}: {
    eyebrow: string
    title: string
    body: string
    dark?: boolean
    centered?: boolean
}) {
    return (
        <div className={cn('max-w-3xl', centered ? 'mx-auto text-center' : 'text-start')}>
            <p className={cn('text-sm font-black', dark ? 'text-[#76D5D0]' : 'text-[#2E8F8A]')}>{eyebrow}</p>
            <h2 className={cn('mt-3 text-3xl font-black leading-tight sm:text-4xl', dark ? 'text-white' : 'text-slate-950')}>{title}</h2>
            <p className={cn('mt-4 text-base leading-8', dark ? 'text-slate-400' : 'text-slate-600')}>{body}</p>
        </div>
    )
}

function DarkTexture() {
    return (
        <div className="pointer-events-none absolute inset-0 opacity-[0.11] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
    )
}
