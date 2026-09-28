import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * Per-page SEO metadata for the public marketing pages.
 *
 * The site is a client-rendered SPA, so every URL is served the same
 * index.html. Google renders JavaScript and reads the title, description
 * and canonical set here; social crawlers (WhatsApp, LinkedIn) do not run
 * JS and fall back to the static defaults in index.html.
 */

export const SITE_ORIGIN = 'https://mutqan-sa.com'

export type SeoPageKey = 'home' | 'about' | 'contact' | 'privacy' | 'terms'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
    }
    el.setAttribute('content', content)
}

export function usePageMeta(page: SeoPageKey) {
    const { t, i18n } = useTranslation()
    const { pathname } = useLocation()

    useEffect(() => {
        const previousTitle = document.title
        const previousDescription =
            document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.getAttribute('content') ?? ''

        const title = t(`seo.${page}.title`)
        const description = t(`seo.${page}.description`)
        const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '')
        const url = `${SITE_ORIGIN}${path}`

        document.title = title
        upsertMeta('name', 'description', description)
        upsertMeta('property', 'og:title', title)
        upsertMeta('property', 'og:description', description)
        upsertMeta('property', 'og:url', url)

        let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
        if (!canonical) {
            canonical = document.createElement('link')
            canonical.rel = 'canonical'
            document.head.appendChild(canonical)
        }
        canonical.href = url

        return () => {
            // Leave app pages with the neutral defaults instead of a stale marketing title.
            document.title = previousTitle
            upsertMeta('name', 'description', previousDescription)
            document.head.querySelector('link[rel="canonical"]')?.remove()
        }
    }, [page, pathname, t, i18n.language])
}
