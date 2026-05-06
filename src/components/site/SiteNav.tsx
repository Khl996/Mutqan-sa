import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '@/components/site/LanguageToggle'
import { MutqanLogo } from '@/components/ui/MutqanLogo'
import { cn } from '@/lib/utils'

type SiteNavProps = {
    variant?: 'light' | 'dark'
}

export function SiteNav({ variant = 'light' }: SiteNavProps) {
    const { t, i18n } = useTranslation()
    const isDark = variant === 'dark'
    const isRTL = i18n.language === 'ar'
    const CtaArrow = isRTL ? ArrowLeft : ArrowRight

    return (
        <nav
            className={cn(
                'absolute inset-x-0 top-0 z-50',
                isDark ? 'text-white' : 'text-slate-900'
            )}
        >
            <div className="mx-auto flex h-24 max-w-7xl items-center justify-between gap-3 px-4 sm:h-28 sm:px-6 lg:px-8">
                <Link to="/" className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label={t('site.brand.name')}>
                    <MutqanLogo
                        variant="horizontal"
                        size="lg"
                        theme={isDark ? 'dark' : 'light'}
                        label={t('site.brand.name')}
                        subtitle={t('site.brand.descriptor')}
                        className="shrink-0 [&_[role=img]]:h-12 [&_[role=img]]:max-w-[190px] sm:[&_[role=img]]:h-14 sm:[&_[role=img]]:max-w-[230px]"
                    />
                </Link>

                <div
                    className={cn(
                        'flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 backdrop-blur-xl sm:gap-3 sm:px-3',
                        isDark ? 'border-white/10 bg-[#071113]/36' : 'border-slate-200/70 bg-white/78'
                    )}
                >
                    <Link
                        to="/about"
                        className={cn(
                            'hidden text-sm font-semibold transition-colors md:inline-flex',
                            isDark ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-950'
                        )}
                    >
                        {t('site.nav.about')}
                    </Link>
                    <Link
                        to="/contact"
                        className={cn(
                            'hidden text-sm font-semibold transition-colors sm:inline-flex',
                            isDark ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-950'
                        )}
                    >
                        {t('site.nav.contact')}
                    </Link>
                    <Link
                        to="/login"
                        className={cn(
                            'text-xs font-semibold transition-colors sm:text-sm',
                            isDark ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-950'
                        )}
                    >
                        {t('site.nav.login')}
                    </Link>
                    <LanguageToggle variant={isDark ? 'dark' : 'light'} compact />
                    <Link
                        to="/contact"
                        className={cn(
                            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-all sm:gap-2 sm:px-4 sm:text-sm',
                            isDark
                                ? 'bg-[#3AAFA9] text-white shadow-[0_12px_32px_-18px_rgba(58,175,169,0.9)] hover:bg-[#45bdb7]'
                                : 'bg-[#2E3A45] text-white shadow-card hover:bg-[#3a4a57]'
                        )}
                    >
                        <span className="sm:hidden">{t('site.nav.startShort')}</span>
                        <span className="hidden sm:inline">{t('site.nav.start')}</span>
                        <CtaArrow className="h-4 w-4" />
                    </Link>
                </div>
            </div>
        </nav>
    )
}
