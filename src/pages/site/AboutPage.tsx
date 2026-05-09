import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft,
    ArrowRight,
    Building2,
    CheckCircle2,
    ClipboardList,
    Factory,
    ShieldCheck,
    Stethoscope,
    Wrench,
    type LucideIcon,
} from 'lucide-react'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteNav } from '@/components/site/SiteNav'

type TextItem = {
    title: string
    body: string
}

const principleIcons: LucideIcon[] = [Wrench, ClipboardList, ShieldCheck]
const sectorIcons: LucideIcon[] = [Building2, Stethoscope, Factory]

export default function AboutPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const CtaArrow = isRTL ? ArrowLeft : ArrowRight
    const principles = t('aboutPage.principles', { returnObjects: true }) as TextItem[]
    const sectors = t('aboutPage.sectors', { returnObjects: true }) as string[]
    const proofPoints = t('aboutPage.proofPoints', { returnObjects: true }) as string[]

    return (
        <div className="min-h-screen bg-slate-50 font-cairo text-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
            <SiteNav variant="dark" />

            <main>
                <section
                    className="relative overflow-hidden bg-[#0b1320] px-4 pb-16 pt-36 text-white sm:px-6 sm:pt-44 lg:px-8"
                    style={{
                        backgroundImage:
                            'linear-gradient(180deg, rgba(118,213,208,0.08) 0%, transparent 42%), linear-gradient(115deg, transparent 0%, rgba(0,178,169,0.12) 44%, transparent 66%), linear-gradient(135deg, #0b1320 0%, #111f2e 55%, #132233 100%)',
                    }}
                >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-transparent via-[#7be4df] to-transparent opacity-75" />
                    <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
                    <div className="relative mx-auto max-w-4xl text-center">
                        <p className="text-sm font-bold text-[#7be4df]">{t('aboutPage.heroEyebrow')}</p>
                        <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
                            {t('aboutPage.heroTitle')}
                        </h1>
                        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                            {t('aboutPage.heroBody')}
                        </p>
                    </div>
                </section>

                <section className="px-4 py-16 sm:px-6 lg:px-8">
                    <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                        <div>
                            <p className="text-sm font-black text-[var(--mutqan-accent)]">{t('aboutPage.storyEyebrow')}</p>
                            <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950">
                                {t('aboutPage.storyTitle')}
                            </h2>
                            <p className="mt-5 text-base leading-8 text-slate-600">
                                {t('aboutPage.storyBodyOne')}
                            </p>
                            <p className="mt-4 text-base leading-8 text-slate-600">
                                {t('aboutPage.storyBodyTwo')}
                            </p>
                            <Link
                                to="/contact"
                                className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#0b1320] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#172235]"
                            >
                                {t('aboutPage.cta')}
                                <CtaArrow className="h-4 w-4" />
                            </Link>
                        </div>

                        <div className="grid gap-3">
                            {principles.map(({ title, body }, index) => {
                                const Icon = principleIcons[index]
                                return (
                                    <div key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
                                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#00b2a9]/10 text-[var(--mutqan-accent)]">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <h3 className="text-xl font-black text-slate-950">{title}</h3>
                                        <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>

                <section className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-7xl">
                        <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
                            <div>
                                <p className="text-sm font-black text-[var(--mutqan-accent)]">{t('aboutPage.visionEyebrow')}</p>
                                <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950">
                                    {t('aboutPage.visionTitle')}
                                </h2>
                                <p className="mt-4 text-base leading-8 text-slate-600">
                                    {t('aboutPage.visionBody')}
                                </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                {sectors.map((label, index) => {
                                    const Icon = sectorIcons[index]
                                    return (
                                        <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center">
                                            <Icon className="mx-auto mb-4 h-7 w-7 text-[var(--mutqan-accent)]" />
                                            <h3 className="font-black text-slate-950">{label}</h3>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="mt-10 grid gap-3 md:grid-cols-3">
                            {proofPoints.map((item) => (
                                <div key={item} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                                    <CheckCircle2 className="h-4 w-4 text-[var(--mutqan-accent)]" />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    )
}
