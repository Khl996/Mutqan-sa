import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import logoBlack from '@/assets/brand/mutqan-logo-black.svg?raw'
import logoColor from '@/assets/brand/mutqan-logo-color.svg?raw'
import logoSymbol from '@/assets/brand/mutqan-symbol.svg?raw'

type MutqanLogoVariant = 'horizontal' | 'vertical' | 'symbol' | 'monochrome'
type MutqanLogoSize = 'sm' | 'md' | 'lg'
type MutqanLogoTheme = 'light' | 'dark'

interface MutqanLogoProps {
    variant?: MutqanLogoVariant
    size?: MutqanLogoSize
    theme?: MutqanLogoTheme
    className?: string
    label?: string
    subtitle?: string
}

const lockupSizeClass: Record<MutqanLogoSize, string> = {
    sm: 'h-7 max-w-28',
    md: 'h-9 max-w-36',
    lg: 'h-12 max-w-48',
}

const symbolSizeClass: Record<MutqanLogoSize, string> = {
    sm: 'h-8 w-12',
    md: 'h-10 w-14',
    lg: 'h-12 w-16',
}

const wordmarkSizeClass: Record<MutqanLogoSize, string> = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
}

const subtitleSizeClass: Record<MutqanLogoSize, string> = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
}

function InlineSvgLogo({
    svg,
    label,
    className,
}: {
    svg: string
    label: string
    className?: string
}) {
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center overflow-hidden',
                '[&>svg]:block [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full',
                className
            )}
            role="img"
            aria-label={label}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    )
}

export function MutqanLogo({
    variant = 'horizontal',
    size = 'md',
    theme = 'light',
    className,
    label,
    subtitle,
}: MutqanLogoProps) {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const resolvedLabel = label ?? (isRTL ? '\u0645\u062a\u0642\u0646' : 'Mutqan')
    const symbolOnly = variant === 'symbol'
    const vertical = variant === 'vertical'
    const monochrome = variant === 'monochrome'
    const textColor = theme === 'dark' ? 'text-white' : 'text-[var(--mutqan-primary)]'
    const subtitleColor = theme === 'dark' ? 'text-white/70' : 'text-[var(--mutqan-muted)]'
    const canUseOfficialLockup = !vertical && !symbolOnly
    const officialLockup = monochrome ? logoBlack : logoColor
    const officialSymbol = logoSymbol
    const darkInvertClass = theme === 'dark' ? '[&>svg]:brightness-0 [&>svg]:invert' : ''

    if (symbolOnly) {
        return (
            <span
                className={cn('inline-flex items-center justify-center', className)}
                role="img"
                aria-label={resolvedLabel}
            >
                <InlineSvgLogo
                    svg={officialSymbol}
                    label={resolvedLabel}
                    className={cn(symbolSizeClass[size], darkInvertClass)}
                />
            </span>
        )
    }

    if (canUseOfficialLockup) {
        return (
            <span className={cn('inline-flex min-w-0 flex-col items-start justify-center gap-1', className)}>
                <InlineSvgLogo
                    svg={officialLockup}
                    label={resolvedLabel}
                    className={cn(lockupSizeClass[size], darkInvertClass)}
                />
                {subtitle && (
                    <span className={cn('block font-cairo font-semibold leading-tight', subtitleSizeClass[size], subtitleColor)}>
                        {subtitle}
                    </span>
                )}
            </span>
        )
    }

    return (
        <span
            className={cn(
                'inline-flex items-center',
                vertical ? 'flex-col gap-2 text-center' : 'gap-3',
                className
            )}
            dir={isRTL ? 'rtl' : 'ltr'}
        >
            <InlineSvgLogo
                svg={officialSymbol}
                label={resolvedLabel}
                className={cn(symbolSizeClass[size], darkInvertClass)}
            />
            <span className={cn('min-w-0', vertical && 'flex flex-col items-center')}>
                <span className={cn('block font-cairo font-extrabold leading-none', wordmarkSizeClass[size], textColor)}>
                    {resolvedLabel}
                </span>
                {subtitle && (
                    <span className={cn('block font-cairo font-semibold leading-tight', subtitleSizeClass[size], subtitleColor)}>
                        {subtitle}
                    </span>
                )}
            </span>
        </span>
    )
}
