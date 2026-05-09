import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MutqanLogo } from '@/components/ui/MutqanLogo'
import { useTheme } from '@/contexts/ThemeContext'

export function SiteFooter() {
    const { t } = useTranslation()
    const { resolvedTheme } = useTheme()

    return (
        <footer className="border-t border-[var(--mutqan-border)] bg-[var(--mutqan-surface)]">
            <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
                <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
                    <div>
                        <div className="mb-4 flex items-center gap-3">
                            <MutqanLogo
                                variant="horizontal"
                                size="md"
                                theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
                                label={t('site.brand.name')}
                                subtitle={t('site.brand.descriptor')}
                            />
                        </div>
                        <p className="max-w-sm text-sm leading-7 text-[var(--mutqan-muted)]">
                            {t('site.footer.description')}
                        </p>
                    </div>

                    <div>
                        <h3 className="mb-3 text-sm font-bold text-[var(--mutqan-text)]">{t('site.footer.linksTitle')}</h3>
                        <div className="space-y-2 text-sm">
                            <Link to="/about" className="block text-[var(--mutqan-muted)] transition-colors hover:text-[var(--mutqan-text)]">
                                {t('site.footer.about')}
                            </Link>
                            <Link to="/contact" className="block text-[var(--mutqan-muted)] transition-colors hover:text-[var(--mutqan-text)]">
                                {t('site.footer.contact')}
                            </Link>
                            <Link to="/privacy" className="block text-[var(--mutqan-muted)] transition-colors hover:text-[var(--mutqan-text)]">
                                {t('site.footer.privacy')}
                            </Link>
                            <Link to="/terms" className="block text-[var(--mutqan-muted)] transition-colors hover:text-[var(--mutqan-text)]">
                                {t('site.footer.terms')}
                            </Link>
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-3 text-sm font-bold text-[var(--mutqan-text)]">{t('site.footer.contactTitle')}</h3>
                        <a
                            href="mailto:info@mutqan-sa.com"
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--mutqan-border)] px-3 py-2 text-sm font-semibold text-[var(--mutqan-muted)] transition-colors hover:border-[#00b2a9]/40 hover:text-[var(--mutqan-accent)]"
                            dir="ltr"
                        >
                            <Mail className="h-4 w-4" />
                            info@mutqan-sa.com
                        </a>
                    </div>
                </div>

                <div className="mt-8 border-t border-[var(--mutqan-border)] pt-6 text-center text-xs text-[var(--mutqan-muted)]">
                    © {new Date().getFullYear()} {t('site.brand.name')} {t('site.footer.rights')}
                </div>
            </div>
        </footer>
    )
}
