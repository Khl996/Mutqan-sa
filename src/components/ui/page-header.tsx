import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
    title: ReactNode
    description?: ReactNode
    eyebrow?: ReactNode
    icon?: ReactNode
    actions?: ReactNode
    className?: string
}

export function PageHeader({
    title,
    description,
    eyebrow,
    icon,
    actions,
    className,
}: PageHeaderProps) {
    return (
        <div className={cn(
            'flex flex-col gap-4 rounded-lg border bg-card px-4 py-4 shadow-sm sm:px-5 md:flex-row md:items-start md:justify-between',
            className
        )}>
            <div className="flex min-w-0 items-start gap-3">
                {icon ? (
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-secondary/10 text-secondary">
                        {icon}
                    </div>
                ) : null}

                <div className="min-w-0 space-y-1">
                    {eyebrow ? (
                        <div className="font-cairo text-xs font-semibold text-muted-foreground">
                            {eyebrow}
                        </div>
                    ) : null}
                    <h1 className="font-cairo text-2xl font-bold leading-tight text-primary">
                        {title}
                    </h1>
                    {description ? (
                        <p className="max-w-3xl font-cairo text-sm leading-6 text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>

            {actions ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                    {actions}
                </div>
            ) : null}
        </div>
    )
}
