import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type LanguageToggleProps = {
    variant?: 'light' | 'dark'
    compact?: boolean
}

export function LanguageToggle({ variant = 'light', compact = false }: LanguageToggleProps) {
    const { i18n } = useTranslation()
    const isArabic = i18n.language === 'ar'
    const label = isArabic ? 'EN' : 'عربي'
    const title = isArabic ? 'Switch to English' : 'التبديل إلى العربية'

    return (
        <button
            type="button"
            onClick={() => i18n.changeLanguage(isArabic ? 'en' : 'ar')}
            title={title}
            aria-label={title}
            className={cn(
                'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border font-bold transition-colors',
                compact ? 'h-9 px-2 text-xs' : 'h-10 px-3 text-sm',
                variant === 'dark'
                    ? 'border-white/10 bg-white/[0.06] text-white/78 hover:bg-white/[0.1] hover:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#3AAFA9]/40 hover:text-[#2E8F8A]'
            )}
            dir="ltr"
        >
            <Languages className="h-4 w-4" />
            <span>{label}</span>
        </button>
    )
}
