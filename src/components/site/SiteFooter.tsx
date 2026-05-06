import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MutqanLogo } from '@/components/ui/MutqanLogo'

export function SiteFooter() {
    const { t } = useTranslation()

    return (
        <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
                <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
                    <div>
                        <div className="mb-4 flex items-center gap-3">
                            <MutqanLogo
                                variant="horizontal"
                                size="md"
                                theme="light"
                                label={t('site.brand.name')}
                                subtitle={t('site.brand.descriptor')}
                            />
                        </div>
                        <p className="max-w-sm text-sm leading-7 text-slate-600">
                            {t('site.footer.description')}
                        </p>
                    </div>

                    <div>
                        <h3 className="mb-3 text-sm font-bold text-slate-950">{t('site.footer.linksTitle')}</h3>
                        <div className="space-y-2 text-sm">
                            <Link to="/about" className="block text-slate-600 transition-colors hover:text-slate-950">
                                {t('site.footer.about')}
                            </Link>
                            <Link to="/contact" className="block text-slate-600 transition-colors hover:text-slate-950">
                                {t('site.footer.contact')}
                            </Link>
                            <Link to="/privacy" className="block text-slate-600 transition-colors hover:text-slate-950">
                                {t('site.footer.privacy')}
                            </Link>
                            <Link to="/terms" className="block text-slate-600 transition-colors hover:text-slate-950">
                                {t('site.footer.terms')}
                            </Link>
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-3 text-sm font-bold text-slate-950">{t('site.footer.contactTitle')}</h3>
                        <a
                            href="mailto:info@mutqan-sa.com"
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-[#3AAFA9]/40 hover:text-[#2E8F8A]"
                            dir="ltr"
                        >
                            <Mail className="h-4 w-4" />
                            info@mutqan-sa.com
                        </a>
                    </div>
                </div>

                <div className="mt-8 border-t border-slate-100 pt-6 text-center text-xs text-slate-500">
                    © {new Date().getFullYear()} {t('site.brand.name')} {t('site.footer.rights')}
                </div>
            </div>
        </footer>
    )
}
