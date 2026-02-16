import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
}

// Custom fetch that ignores AbortSignal to prevent React Query abort issues
const customFetch = (url: RequestInfo | URL, options: RequestInit = {}) => {
    // Remove signal to prevent AbortError
    const { signal, ...restOptions } = options
    void signal // Mark as intentionally unused
    return fetch(url, restOptions)
}

// Single Supabase client - used for everything
// Using custom fetch to avoid AbortError issues with React Query
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
    },
    global: {
        headers: {
            'x-client-info': 'mutqan-web/1.0.0',
        },
        fetch: customFetch,
    },
    db: {
        schema: 'public',
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
    },
})

// For mutations, use the SAME client to ensure session is always available
export const supabaseForMutations = supabase

export default supabase

