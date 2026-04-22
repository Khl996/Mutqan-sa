import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Mail, MessageSquareText, Phone, Wrench, type LucideIcon } from 'lucide-react'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteNav } from '@/components/site/SiteNav'

type TextItem = {
    title: string
    body: string
}

const cardIcons: LucideIcon[] = [MessageSquareText, Wrench, Building2, Phone]

export default function ContactPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const CtaArrow = isRTL ? ArrowLeft : ArrowRight
    const demoPrep = t('contactPage.prepItems', { returnObjects: true }) as string[]
    const cards = t('contactPage.cards', { returnObjects: true }) as TextItem[]
    const emailHref = `mailto:info@mutqan-sa.com?subject=${encodeURIComponent(t('contactPage.emailSubject'))}`

    return (
        <div className="min-h-screen bg-slate-50 font-cairo text-slate-950" dir={isRTL ? 'rtl' : 'ltr'}>
            <SiteNav variant="dark" />

            <main>
                <section
                    className="relative overflow-hidden bg-[#071113] px-4 pb-16 pt-36 text-white sm:px-6 sm:pt-44 lg:px-8"
                    style={{
                        backgroundImage:
                            'linear-gradient(180deg, rgba(118,213,208,0.08) 0%, transparent 42%), linear-gradient(115deg, transparent 0%, rgba(58,175,169,0.12) 44%, transparent 66%), linear-gradient(135deg, #071113 0%, #0d2225 55%, #11181d 100%)',
                    }}
                >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-transparent via-[#76D5D0] to-transparent opacity-75" />
                    <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
                    <div className="relative mx-auto max-w-4xl text-center">
                        <p className="text-sm font-bold text-[#76D5D0]">{t('contactPage.heroEyebrow')}</p>
                        <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
                            {t('contactPage.heroTitle')}
                        </h1>
                        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                            {t('contactPage.heroBody')}
                        </p>
                    </div>
                </section>

                <section className="px-4 py-16 sm:px-6 lg:px-8">
                    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-card">
                            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-[#3AAFA9]/10 text-[#2E8F8A]">
                                <Mail className="h-5 w-5" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-950">{t('contactPage.directTitle')}</h2>
                            <p className="mt-3 text-sm leading-7 text-slate-600">
                                {t('contactPage.directBody')}
                            </p>

                            <a
                                href={emailHref}
                                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E3A45] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#3a4a57] sm:w-auto"
                                dir="ltr"
                            >
                                info@mutqan-sa.com
                                <CtaArrow className="h-4 w-4" />
                            </a>

                            <div className="mt-7 grid gap-3 sm:grid-cols-2">
                                {cards.map(({ title, body }, index) => {
                                    const Icon = cardIcons[index]
                                    return (
                                        <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                            <Icon className="mb-3 h-5 w-5 text-[#2E8F8A]" />
                                            <h3 className="font-black text-slate-950">{title}</h3>
                                            <p className="mt-1 text-xs leading-6 text-slate-600">{body}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-card">
                            <h2 className="text-2xl font-black text-slate-950">{t('contactPage.prepTitle')}</h2>
                            <p className="mt-3 text-sm leading-7 text-slate-600">
                                {t('contactPage.prepBody')}
                            </p>

                            <div className="mt-6 space-y-3">
                                {demoPrep.map((item, index) => (
                                    <div key={item} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#3AAFA9]/10 text-sm font-black text-[#2E8F8A]">
                                            {index + 1}
                                        </span>
                                        <span className="text-sm font-bold text-slate-700">{item}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-7 rounded-lg border border-[#3AAFA9]/20 bg-[#3AAFA9]/8 p-5">
                                <h3 className="flex items-center gap-2 font-black text-slate-950">
                                    <CheckCircle2 className="h-5 w-5 text-[#2E8F8A]" />
                                    {t('contactPage.goalTitle')}
                                </h3>
                                <p className="mt-2 text-sm leading-7 text-slate-600">
                                    {t('contactPage.goalBody')}
                                </p>
                            </div>

                            <Link
                                to="/register"
                                className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 sm:w-auto"
                            >
                                {t('contactPage.trialCta')}
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    )
}
