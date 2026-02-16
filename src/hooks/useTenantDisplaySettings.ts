import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTenantSettings } from './useTenantSettings'

/**
 * Hook to apply tenant display settings
 * This hook reads tenant settings and applies them to the UI
 */
export function useTenantDisplaySettings() {
    const { i18n } = useTranslation()
    const { data: settings } = useTenantSettings()

    // Apply default language setting
    useEffect(() => {
        if (settings?.display?.default_language) {
            // Only change if user hasn't overridden manually
            const userPreferredLang = localStorage.getItem('user-language-override')
            if (!userPreferredLang) {
                const tenantLang = settings.display.default_language
                if (i18n.language !== tenantLang) {
                    i18n.changeLanguage(tenantLang)
                }
            }
        }
    }, [settings?.display?.default_language, i18n])

    // Get display settings
    const dateFormat = settings?.display?.date_format ?? 'DD/MM/YYYY'
    const timeFormat = settings?.display?.time_format ?? '12h'
    const timezone = settings?.display?.timezone ?? 'Asia/Riyadh'

    // Format date according to settings
    const formatDate = (date: Date | string): string => {
        const d = typeof date === 'string' ? new Date(date) : date

        const day = d.getDate().toString().padStart(2, '0')
        const month = (d.getMonth() + 1).toString().padStart(2, '0')
        const year = d.getFullYear()

        switch (dateFormat) {
            case 'MM/DD/YYYY':
                return `${month}/${day}/${year}`
            case 'YYYY-MM-DD':
                return `${year}-${month}-${day}`
            case 'DD/MM/YYYY':
            default:
                return `${day}/${month}/${year}`
        }
    }

    // Format time according to settings
    const formatTime = (date: Date | string): string => {
        const d = typeof date === 'string' ? new Date(date) : date

        if (timeFormat === '24h') {
            return d.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: timezone
            })
        } else {
            return d.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: timezone
            })
        }
    }

    // Format datetime according to settings
    const formatDateTime = (date: Date | string): string => {
        return `${formatDate(date)} ${formatTime(date)}`
    }

    // Override user language preference manually
    const setUserLanguageOverride = (lang: 'ar' | 'en') => {
        localStorage.setItem('user-language-override', lang)
        i18n.changeLanguage(lang)
    }

    // Clear user override to use tenant default
    const clearUserLanguageOverride = () => {
        localStorage.removeItem('user-language-override')
        if (settings?.display?.default_language) {
            i18n.changeLanguage(settings.display.default_language)
        }
    }

    return {
        dateFormat,
        timeFormat,
        timezone,
        formatDate,
        formatTime,
        formatDateTime,
        setUserLanguageOverride,
        clearUserLanguageOverride
    }
}
