import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from '@/components/site/LanguageToggle'
import { MutqanLogo } from '@/components/ui/MutqanLogo'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

type SiteNavProps = {
    variant?: 'light' | 'dark'
}

export function SiteNav({ variant = 'light' }: SiteNavProps) {
    const { t, i18n } = useTranslation()
    const { resolvedTheme } = useTheme()
    const isDark = variant === 'dark'
    const effectiveDark = isDark || resolvedTheme === 'dark'
    const isRTL = i18n.language === 'ar'
    const CtaArrow = isRTL ? ArrowLeft : ArrowRight

    return (
        <nav
            className={cn(
                'absolute inset-x-0 top-0 z-50',
                effectiveDark ? 'text-white' : 'text-[var(--mutqan-text)]'
            )}
        >
            <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:h-24 sm:px-6 lg:px-8">
                <Link to="/" className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label={t('site.brand.name')}>
                    <MutqanLogo
                        variant="horizontal"
                        size="lg"
                        theme={effectiveDark ? 'dark' : 'light'}
                        label={t('site.brand.name')}
                        subtitle={t('site.brand.descriptor')}
                        className="shrink-0 [&_[role=img]]:h-10 [&_[role=img]]:max-w-[170px] sm:[&_[role=img]]:h-12 sm:[&_[role=img]]:max-w-[210px]"
                    />
                </Link>

                <div
                    className={cn(
                        'flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 backdrop-blur-xl sm:gap-3 sm:px-3',
                        effectiveDark ? 'border-white/10 bg-[#0b1320]/36' : 'border-[var(--mutqan-border)] bg-white/78'
                    )}
                >
                    <Link
                        to="/about"
                        className={cn(
                            'hidden text-sm font-semibold transition-colors md:inline-flex',
                            effectiveDark ? 'text-white/70 hover:text-white' : 'text-[var(--mutqan-muted)] hover:text-[var(--mutqan-text)]'
                        )}
                    >
                        {t('site.nav.about')}
                    </Link>
                    <Link
                        to="/contact"
                        className={cn(
                            'hidden text-sm font-semibold transition-colors sm:inline-flex',
                            effectiveDark ? 'text-white/70 hover:text-white' : 'text-[var(--mutqan-muted)] hover:text-[var(--mutqan-text)]'
                        )}
                    >
                        {t('site.nav.contact')}
                    </Link>
                    <Link
                        to="/login"
                        className={cn(
                            'text-xs font-semibold transition-colors sm:text-sm',
                            effectiveDark ? 'text-white/70 hover:text-white' : 'text-[var(--mutqan-muted)] hover:text-[var(--mutqan-text)]'
                        )}
                    >
                        {t('site.nav.login')}
                    </Link>
                    <LanguageToggle variant={effectiveDark ? 'dark' : 'light'} compact />
                    <Link
                        to="/contact"
                        className={cn(
                            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-all sm:gap-2 sm:px-4 sm:text-sm',
                            effectiveDark
                                ? 'bg-[var(--mutqan-accent)] text-white shadow-[0_12px_32px_-18px_rgba(0,178,169,0.9)] hover:bg-[#00968f]'
                                : 'bg-[#0b1320] text-white shadow-card hover:bg-[#172235]'
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
