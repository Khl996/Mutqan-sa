import { Link } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Building2,
    CalendarCheck,
    CheckCircle2,
    ClipboardCheck,
    ClipboardList,
    Database,
    FileCheck2,
    FileText,
    History,
    Layers3,
    MapPin,
    MessageSquare,
    ShieldCheck,
    Users,
    Wrench,
    type LucideIcon,
} from 'lucide-react'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteNav } from '@/components/site/SiteNav'
import { cn } from '@/lib/utils'

const stagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}

const rise: Variants = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.46, ease: 'easeOut' } },
}

type IconText = {
    title: string
    body: string
}

type MetricCopy = {
    label: string
    value: string
}

type PreviewRow = {
    code: string
    title: string
    location: string
    asset: string
    status: string
    owner: string
}

type PreviewHeaders = {
    code: string
    work: string
    status: string
    owner: string
}

const valueIcons: LucideIcon[] = [ClipboardList, Database, CalendarCheck, BarChart3, Users]
const realityIcons: LucideIcon[] = [MessageSquare, History, Database, FileText]
const pillarIcons: LucideIcon[] = [ClipboardCheck, Database, MapPin, CalendarCheck, BarChart3]
const flowIcons: LucideIcon[] = [MessageSquare, MapPin, Building2, ClipboardList, Wrench, FileCheck2, History, BarChart3, CheckCircle2]
const previewNavIcons: LucideIcon[] = [ClipboardList, Database, MapPin, CalendarCheck, BarChart3]
const audienceIcons: LucideIcon[] = [Building2, Wrench, MapPin, Layers3, Database]
const benefitIcons: LucideIcon[] = [CheckCircle2, History, Users, Wrench, FileText]

export default function LandingPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f7f3ea] font-cairo text-[#172027]" dir={isRTL ? 'rtl' : 'ltr'}>
            <SiteNav variant="light" />
            <main>
                <HeroSection />
                <ValueStrip />
                <OperationalRealitySection />
                <ValuePillarsSection />
                <ConnectedWorkflowSection />
                <ProductPreviewSection />
                <AudienceSection />
                <ExecutiveValueSection />
                <FinalCta />
            </main>
            <SiteFooter />
        </div>
    )
}

function HeroSection() {
    const { t } = useTranslation()
    const highlights = t('landing.hero.highlights', { returnObjects: true }) as string[]

    return (
        <section className="relative isolate overflow-hidden bg-[#f7f3ea] px-4 pb-20 pt-32 sm:px-6 sm:pb-24 sm:pt-40 lg:px-8">
            <PaperTexture />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#2E3A45]/10" />

            <div className="relative mx-auto grid max-w-7xl gap-12 lg:min-h-[700px] lg:grid-cols-[minmax(0,0.94fr)_minmax(500px,1.06fr)] lg:items-center">
                <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl">
                    <motion.p
                        variants={rise}
                        className="inline-flex w-fit rounded-full border border-[#3AAFA9]/25 bg-white/80 px-4 py-2 text-xs font-black uppercase text-[#2E8F8A] shadow-card"
                    >
                        {t('landing.hero.eyebrow')}
                    </motion.p>

                    <motion.h1
                        variants={rise}
                        className="mt-7 max-w-[820px] text-balance text-[clamp(2.35rem,4.9vw,4.15rem)] font-black leading-[1.28] tracking-normal text-[#172027] sm:leading-[1.26] lg:max-w-[780px]"
                    >
                        {t('landing.hero.headlineTop')}
                        <span className="mt-2 block text-[#2E8F8A] sm:mt-3">{t('landing.hero.headlineAccent')}</span>
                    </motion.h1>

                    <motion.p variants={rise} className="mt-8 max-w-3xl text-lg font-bold leading-9 text-[#2E3A45] sm:text-xl sm:leading-10">
                        {t('landing.hero.subheadline')}
                    </motion.p>

                    <motion.div variants={rise} className="mt-10 flex flex-col gap-3 sm:flex-row">
                        <PrimaryCta />
                        <SecondaryCta />
                    </motion.div>

                    <motion.div variants={rise} className="mt-10 grid gap-3 sm:grid-cols-3">
                        {highlights.map((point) => (
                            <div
                                key={point}
                                className="flex min-h-[86px] items-start gap-3 rounded-lg border border-[#2E3A45]/10 bg-white/78 p-4 text-sm font-black leading-6 text-[#2E3A45] shadow-card"
                            >
                                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#2E8F8A]" />
                                <span>{point}</span>
                            </div>
                        ))}
                    </motion.div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.62, delay: 0.18, ease: 'easeOut' }}
                    className="relative"
                >
                    <HeroPreview />
                </motion.div>
            </div>
        </section>
    )
}

function HeroPreview() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const metrics = t('landing.heroPreview.metrics', { returnObjects: true }) as MetricCopy[]
    const steps = t('landing.flow.steps', { returnObjects: true }) as IconText[]

    return (
        <div className="relative mx-auto max-w-2xl">
            <div className="absolute -inset-4 rounded-lg border border-[#2E3A45]/10 bg-white/32" />
            <div className="relative overflow-hidden rounded-lg border border-[#c9d4d0] bg-white shadow-[0_34px_100px_-58px_rgba(15,23,42,0.64)]">
                <div className="flex items-center justify-between border-b border-slate-200 bg-[#fbfaf6] px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#2E3A45]/28" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#3AAFA9]/50" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/55" />
                    </div>
                    <p className="text-sm font-black text-[#2E3A45]">{t('landing.heroPreview.title')}</p>
                </div>

                <div className="grid lg:grid-cols-[168px_minmax(0,1fr)]">
                    <aside className="hidden border-e border-slate-200 bg-[#f6f3ea] p-4 lg:block">
                        <p className="mb-4 text-xs font-black uppercase text-slate-500">{t('landing.preview.navTitle')}</p>
                        {(t('landing.preview.nav', { returnObjects: true }) as string[]).map((item, index) => {
                            const Icon = previewNavIcons[index] ?? ClipboardList
                            return (
                                <div
                                    key={item}
                                    className={cn(
                                        'mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold',
                                        index === 0 ? 'bg-[#172027] text-white' : 'text-slate-600'
                                    )}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{item}</span>
                                </div>
                            )
                        })}
                    </aside>

                    <div className="min-w-0 p-5">
                        <div className="rounded-lg bg-[#172027] p-5 text-white">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase text-[#9BE3DF]">{t('landing.heroPreview.eyebrow')}</p>
                                    <h2 className="mt-2 text-2xl font-black leading-8">{t('landing.heroPreview.heading')}</h2>
                                    <p className="mt-3 max-w-md text-sm leading-7 text-slate-300">{t('landing.heroPreview.body')}</p>
                                </div>
                                <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-black">
                                    <ShieldCheck className="h-4 w-4" />
                                    {t('landing.heroPreview.badge')}
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {metrics.map(({ label, value }, index) => {
                                const Icon = previewNavIcons[index] ?? ClipboardList
                                return (
                                    <div key={label} className="rounded-lg border border-slate-200 bg-[#fbfaf6] p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-bold text-slate-500">{label}</p>
                                            <Icon className="h-4 w-4 text-[#2E8F8A]" />
                                        </div>
                                        <p className="mt-3 text-2xl font-black text-[#172027]">{value}</p>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <p className="text-sm font-black text-[#172027]">{t('landing.heroPreview.recordTitle')}</p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{t('landing.heroPreview.recordMeta')}</p>
                                </div>
                                <span className="inline-flex w-fit rounded-lg border border-[#3AAFA9]/25 bg-[#3AAFA9]/10 px-3 py-1.5 text-xs font-black text-[#2E8F8A]">
                                    {t('landing.heroPreview.recordStatus')}
                                </span>
                            </div>

                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f1ede2]">
                                <motion.span
                                    className="block h-full w-2/3 rounded-full bg-[#3AAFA9]"
                                    initial={{ width: '18%' }}
                                    animate={{ width: '68%' }}
                                    transition={{ duration: 1.4, delay: 0.45, ease: 'easeOut' }}
                                />
                            </div>

                            <div className="mt-4 grid gap-2 sm:grid-cols-4">
                                {steps.slice(1, 5).map(({ title }, index) => {
                                    const Icon = flowIcons[index + 1] ?? CheckCircle2
                                    return (
                                        <div key={title} className="relative rounded-lg bg-[#f6f3ea] px-3 py-2">
                                            {index === 2 && (
                                                <motion.span
                                                    className="absolute top-2 h-2 w-2 rounded-full bg-[#2E8F8A]"
                                                    animate={isRTL ? { x: [0, -8, 0] } : { x: [0, 8, 0] }}
                                                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                                />
                                            )}
                                            <Icon className="mb-2 h-4 w-4 text-[#2E8F8A]" />
                                            <p className="text-xs font-black text-[#2E3A45]">{title}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function ValueStrip() {
    const { t } = useTranslation()
    const items = t('landing.trust.items', { returnObjects: true }) as string[]

    return (
        <section className="border-y border-[#d8ded8] bg-white px-4 py-7 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-5">
                {items.map((item, index) => {
                    const Icon = valueIcons[index] ?? CheckCircle2
                    return (
                        <motion.div
                            key={item}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                            variants={rise}
                            className="flex min-h-[84px] items-center gap-3 border-b border-slate-200 py-4 md:border-b-0 md:border-e md:px-4 md:last:border-e-0"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3AAFA9]/10 text-[#2E8F8A]">
                                <Icon className="h-5 w-5" />
                            </span>
                            <p className="text-sm font-black leading-6 text-[#172027]">{item}</p>
                        </motion.div>
                    )
                })}
            </div>
        </section>
    )
}

function OperationalRealitySection() {
    const { t } = useTranslation()
    const items = t('landing.opportunity.items', { returnObjects: true }) as IconText[]

    return (
        <section className="bg-white px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
                <SectionIntro
                    eyebrow={t('landing.opportunity.eyebrow')}
                    title={t('landing.opportunity.title')}
                    body={t('landing.opportunity.body')}
                />

                <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-90px' }} variants={stagger} className="space-y-4">
                    <motion.div variants={rise} className="rounded-lg border border-[#2E3A45]/12 bg-[#172027] p-6 text-white">
                        <p className="text-2xl font-black leading-10">{t('landing.opportunity.closing')}</p>
                    </motion.div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {items.map(({ title, body }, index) => {
                            const Icon = realityIcons[index] ?? CheckCircle2
                            return (
                                <motion.div key={title} variants={rise} className="rounded-lg border border-slate-200 bg-[#fbfaf6] p-5">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-[#2E8F8A] shadow-card">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <span className="text-xs font-black text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                                    </div>
                                    <h3 className="text-lg font-black leading-7 text-[#172027]">{title}</h3>
                                    <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
                                </motion.div>
                            )
                        })}
                    </div>
                </motion.div>
            </div>
        </section>
    )
}

function ValuePillarsSection() {
    const { t } = useTranslation()
    const pillars = t('landing.pillars.items', { returnObjects: true }) as IconText[]

    return (
        <section className="relative overflow-hidden bg-[#f7f3ea] px-4 py-24 sm:px-6 lg:px-8">
            <PaperTexture />
            <div className="relative mx-auto max-w-7xl">
                <SectionIntro
                    eyebrow={t('landing.pillars.eyebrow')}
                    title={t('landing.pillars.title')}
                    body={t('landing.pillars.body')}
                    centered
                />

                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-90px' }}
                    variants={stagger}
                    className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-5"
                >
                    {pillars.slice(0, 5).map((pillar, index) => {
                        const Icon = pillarIcons[index] ?? ClipboardCheck
                        return (
                            <motion.div key={pillar.title} variants={rise} className="rounded-lg border border-[#d8ded8] bg-white p-5 shadow-card">
                                <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-[#3AAFA9]/10 text-[#2E8F8A]">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <h3 className="text-xl font-black leading-8 text-[#172027]">{pillar.title}</h3>
                                <p className="mt-3 text-sm leading-7 text-slate-600">{pillar.body}</p>
                            </motion.div>
                        )
                    })}
                </motion.div>
            </div>
        </section>
    )
}

function ConnectedWorkflowSection() {
    const { t, i18n } = useTranslation()
    const steps = t('landing.flow.steps', { returnObjects: true }) as IconText[]
    const FlowArrow = i18n.language === 'ar' ? ArrowLeft : ArrowRight

    return (
        <section id="workflow" className="relative overflow-hidden bg-[#101d22] px-4 py-24 text-white sm:px-6 lg:px-8">
            <InkTexture />
            <div className="relative mx-auto max-w-7xl">
                <SectionIntro
                    eyebrow={t('landing.flow.eyebrow')}
                    title={t('landing.flow.title')}
                    body={t('landing.flow.body')}
                    dark
                    centered
                />

                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-90px' }}
                    variants={stagger}
                    className="mt-14 overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]"
                >
                    <div className="grid md:grid-cols-3 lg:grid-cols-9">
                        {steps.map(({ title, body }, index) => {
                            const Icon = flowIcons[index] ?? ClipboardList
                            return (
                                <motion.div key={title} variants={rise} className="relative min-h-[210px] border-b border-white/10 p-5 md:border-e lg:border-b-0">
                                    <div className="mb-5 flex items-center justify-between gap-3">
                                        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-[#3AAFA9]/12 text-[#9BE3DF]">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <span className="text-xs font-black text-white/40">{String(index + 1).padStart(2, '0')}</span>
                                    </div>
                                    <h3 className="text-base font-black leading-7 text-white">{title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
                                    {index < steps.length - 1 && (
                                        <span className="absolute bottom-5 hidden items-center text-[#3AAFA9]/70 lg:flex ltr:right-[-13px] rtl:left-[-13px]">
                                            <FlowArrow className="h-6 w-6" />
                                        </span>
                                    )}
                                </motion.div>
                            )
                        })}
                    </div>
                </motion.div>

                <div className="mt-8 h-px overflow-hidden rounded-full bg-white/10">
                    <motion.div
                        className="h-full bg-[#3AAFA9]"
                        initial={{ width: '0%' }}
                        whileInView={{ width: '100%' }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                    />
                </div>
            </div>
        </section>
    )
}

function ProductPreviewSection() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const navItems = t('landing.preview.nav', { returnObjects: true }) as string[]
    const metrics = t('landing.preview.metrics', { returnObjects: true }) as MetricCopy[]
    const rows = t('landing.preview.rows', { returnObjects: true }) as PreviewRow[]
    const details = t('landing.preview.details', { returnObjects: true }) as IconText[]
    const headers = t('landing.preview.headers', { returnObjects: true }) as PreviewHeaders

    return (
        <section className="bg-white px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <SectionIntro
                    eyebrow={t('landing.preview.eyebrow')}
                    title={t('landing.preview.title')}
                    body={t('landing.preview.body')}
                    centered
                />

                <motion.div
                    initial={{ opacity: 0, y: 22 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                    className="mt-14 overflow-hidden rounded-lg border border-[#cfd8d4] bg-white shadow-[0_34px_100px_-58px_rgba(15,23,42,0.5)]"
                >
                    <div className="flex items-center justify-between border-b border-slate-200 bg-[#fbfaf6] px-4 py-3">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#2E3A45]/30" />
                            <span className="h-2.5 w-2.5 rounded-full bg-[#3AAFA9]/45" />
                            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/55" />
                        </div>
                        <p className="text-sm font-black text-[#2E3A45]">{t('landing.preview.windowTitle')}</p>
                    </div>

                    <div className="grid min-h-[560px] lg:grid-cols-[220px_minmax(0,1fr)_320px]">
                        <aside className={cn('hidden bg-[#f6f3ea] p-4 lg:block', isRTL ? 'border-l border-slate-200' : 'border-r border-slate-200')}>
                            <p className="mb-4 text-xs font-black uppercase text-slate-500">{t('landing.preview.navTitle')}</p>
                            {navItems.map((item, index) => {
                                const Icon = previewNavIcons[index] ?? ClipboardList
                                return (
                                    <div
                                        key={item}
                                        className={cn(
                                            'mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold',
                                            index === 0 ? 'bg-[#172027] text-white' : 'text-slate-600'
                                        )}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{item}</span>
                                    </div>
                                )
                            })}
                        </aside>

                        <div className="min-w-0 p-5 sm:p-6">
                            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <h2 className="text-2xl font-black leading-8 text-[#172027]">{t('landing.preview.boardTitle')}</h2>
                                    <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">{t('landing.preview.boardBody')}</p>
                                </div>
                                <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#3AAFA9]/25 bg-[#3AAFA9]/10 px-3 py-2 text-sm font-black text-[#2E8F8A]">
                                    <ShieldCheck className="h-4 w-4" />
                                    {t('landing.preview.badge')}
                                </span>
                            </div>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {metrics.map(({ label, value }, index) => {
                                    const Icon = previewNavIcons[index] ?? ClipboardList
                                    return (
                                        <div key={label} className="rounded-lg border border-slate-200 bg-[#fbfaf6] p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-bold text-slate-500">{label}</p>
                                                <Icon className="h-4 w-4 text-[#2E8F8A]" />
                                            </div>
                                            <p className="mt-3 text-2xl font-black text-[#172027]">{value}</p>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
                                <div className="grid grid-cols-[0.8fr_1.6fr] gap-3 bg-[#f6f3ea] px-4 py-3 text-xs font-black uppercase text-slate-500 sm:grid-cols-[0.8fr_1.7fr_1fr_1fr]">
                                    <span>{headers.code}</span>
                                    <span>{headers.work}</span>
                                    <span className="hidden sm:block">{headers.status}</span>
                                    <span className="hidden sm:block">{headers.owner}</span>
                                </div>

                                {rows.map((row) => (
                                    <div key={`${row.code}-${row.title}`} className="grid gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:grid-cols-[0.8fr_1.7fr_1fr_1fr]">
                                        <div>
                                            <p className="text-xs font-black uppercase text-[#2E8F8A]">{row.code}</p>
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-base font-black leading-7 text-[#172027]">{row.title}</h3>
                                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                                {row.location} | {row.asset}
                                            </p>
                                        </div>
                                        <div className="flex items-start sm:block">
                                            <span className="inline-flex rounded-lg border border-[#3AAFA9]/25 bg-[#3AAFA9]/10 px-2.5 py-1.5 text-xs font-black text-[#2E8F8A]">
                                                {row.status}
                                            </span>
                                        </div>
                                        <div className="flex items-start sm:block">
                                            <span className="inline-flex rounded-lg border border-slate-200 bg-[#fbfaf6] px-2.5 py-1.5 text-xs font-black text-slate-500">
                                                {row.owner}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <aside className={cn('border-t border-slate-200 bg-[#fbfaf6] p-5 lg:border-t-0 lg:p-6', isRTL ? 'lg:border-r' : 'lg:border-l')}>
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-black uppercase text-slate-500">{t('landing.preview.badge')}</p>
                                <motion.span
                                    className="h-2 w-2 rounded-full bg-[#2E8F8A]"
                                    animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.18, 1] }}
                                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                                />
                            </div>
                            <div className="mt-5 space-y-3">
                                {details.map(({ title, body }, index) => {
                                    const Icon = previewNavIcons[index] ?? FileText
                                    return (
                                        <div key={title} className="rounded-lg border border-slate-200 bg-white p-4">
                                            <Icon className="mb-3 h-5 w-5 text-[#2E8F8A]" />
                                            <h3 className="font-black text-[#172027]">{title}</h3>
                                            <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </aside>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}

function AudienceSection() {
    const { t } = useTranslation()
    const audiences = t('landing.audience.items', { returnObjects: true }) as string[]

    return (
        <section className="relative overflow-hidden bg-[#f7f3ea] px-4 py-24 sm:px-6 lg:px-8">
            <PaperTexture />
            <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
                <SectionIntro
                    eyebrow={t('landing.audience.eyebrow')}
                    title={t('landing.audience.title')}
                    body={t('landing.audience.body')}
                />

                <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-90px' }} variants={stagger} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {audiences.map((label, index) => {
                        const Icon = audienceIcons[index] ?? Building2
                        return (
                            <motion.div key={label} variants={rise} className="min-h-[150px] rounded-lg border border-[#d8ded8] bg-white p-5 shadow-card">
                                <Icon className="mb-5 h-6 w-6 text-[#2E8F8A]" />
                                <p className="text-base font-black leading-7 text-[#172027]">{label}</p>
                            </motion.div>
                        )
                    })}
                </motion.div>
            </div>
        </section>
    )
}

function ExecutiveValueSection() {
    const { t } = useTranslation()
    const benefits = t('landing.benefits.items', { returnObjects: true }) as IconText[]

    return (
        <section className="bg-white px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.84fr_1.16fr] lg:items-start">
                <SectionIntro
                    eyebrow={t('landing.benefits.eyebrow')}
                    title={t('landing.benefits.title')}
                    body={t('landing.benefits.body')}
                />

                <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-90px' }} variants={stagger} className="grid gap-4 sm:grid-cols-2">
                    {benefits.map(({ title, body }, index) => {
                        const Icon = benefitIcons[index] ?? CheckCircle2
                        return (
                            <motion.div key={title} variants={rise} className="rounded-lg border border-slate-200 bg-[#fbfaf6] p-5">
                                <div className="mb-4 flex items-center gap-3">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-[#2E8F8A] shadow-card">
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <h3 className="text-lg font-black leading-7 text-[#172027]">{title}</h3>
                                </div>
                                <p className="text-sm leading-7 text-slate-600">{body}</p>
                            </motion.div>
                        )
                    })}
                </motion.div>
            </div>
        </section>
    )
}

function FinalCta() {
    const { t } = useTranslation()

    return (
        <section className="relative overflow-hidden bg-[#101d22] px-4 py-24 text-white sm:px-6 lg:px-8">
            <InkTexture />
            <motion.div
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-90px' }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="relative mx-auto max-w-3xl text-center"
            >
                <p className="text-sm font-black uppercase text-[#9BE3DF]">{t('landing.finalCta.eyebrow')}</p>
                <h2 className="mx-auto mt-4 max-w-[760px] text-balance text-[clamp(2rem,4.2vw,3.25rem)] font-black leading-[1.34] tracking-normal sm:leading-[1.3]">
                    {t('landing.finalCta.title')}
                </h2>
                <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">{t('landing.finalCta.body')}</p>
                <div className="mt-9 flex justify-center">
                    <PrimaryCta />
                </div>
            </motion.div>
        </section>
    )
}

function PrimaryCta() {
    const { t, i18n } = useTranslation()
    const CtaArrow = i18n.language === 'ar' ? ArrowLeft : ArrowRight

    return (
        <Link
            to="/contact"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2E8F8A] px-6 text-base font-black text-white shadow-[0_18px_44px_-30px_rgba(46,143,138,0.95)] transition-colors hover:bg-[#267d78] sm:w-auto"
        >
            {t('landing.hero.primaryCta')}
            <CtaArrow className="h-4 w-4" />
        </Link>
    )
}

function SecondaryCta() {
    const { t } = useTranslation()

    return (
        <a
            href="#workflow"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-[#2E3A45]/18 bg-white px-6 text-base font-black text-[#2E3A45] transition-colors hover:border-[#3AAFA9]/45 hover:text-[#2E8F8A] sm:w-auto"
        >
            {t('landing.hero.secondaryCta')}
        </a>
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
        <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-90px' }}
            variants={stagger}
            className={cn('max-w-3xl', centered ? 'mx-auto text-center' : 'text-start')}
        >
            <motion.p variants={rise} className={cn('text-sm font-black uppercase', dark ? 'text-[#9BE3DF]' : 'text-[#2E8F8A]')}>
                {eyebrow}
            </motion.p>
            <motion.h2
                variants={rise}
                className={cn(
                    'mt-4 text-balance text-[clamp(1.85rem,3vw,2.5rem)] font-black leading-[1.34] tracking-normal sm:leading-[1.3]',
                    dark ? 'text-white' : 'text-[#172027]'
                )}
            >
                {title}
            </motion.h2>
            <motion.p variants={rise} className={cn('mt-4 text-base leading-8', dark ? 'text-slate-400' : 'text-slate-600')}>
                {body}
            </motion.p>
        </motion.div>
    )
}

function PaperTexture() {
    return (
        <div className="pointer-events-none absolute inset-0 opacity-[0.34] [background-image:linear-gradient(rgba(46,58,69,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(46,58,69,0.045)_1px,transparent_1px)] [background-size:38px_38px]" />
    )
}

function InkTexture() {
    return (
        <div className="pointer-events-none absolute inset-0 opacity-[0.11] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:40px_40px]" />
    )
}
