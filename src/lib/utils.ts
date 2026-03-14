import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, locale = 'ar-SA') {
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(new Date(date))
}

export function formatDateTime(date: string | Date, locale = 'ar-SA') {
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(date))
}

export function formatRelativeTime(date: string | Date, locale = 'ar-SA') {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diff / (1000 * 60 * 60))
    const diffMinutes = Math.floor(diff / (1000 * 60))

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

    if (diffDays > 0) return rtf.format(-diffDays, 'day')
    if (diffHours > 0) return rtf.format(-diffHours, 'hour')
    if (diffMinutes > 0) return rtf.format(-diffMinutes, 'minute')
    return rtf.format(0, 'second')
}

export function formatCurrency(amount: number, currency = 'SAR', locale = 'ar-SA') {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
    }).format(amount)
}

export function formatNumber(num: number, locale = 'ar-SA') {
    return new Intl.NumberFormat(locale).format(num)
}

export function generateCode(prefix: string, date = new Date()) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `${prefix}-${year}${month}${day}-${random}`
}

export function slugify(text: string) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
}

export function truncate(text: string, length: number) {
    if (text.length <= length) return text
    return text.slice(0, length) + '...'
}

export function getInitials(name: string) {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
}

export function isRTL(text: string) {
    const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
    return rtlChars.test(text)
}
