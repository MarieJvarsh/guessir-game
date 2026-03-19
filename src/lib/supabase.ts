import { createBrowserClient } from '@supabase/ssr'

export const supabaseUrl = 'https://vkeyfjhhlutyfclpssll.supabase.co'
export const supabaseAnonKey = 'sb_publishable_WPzrW3xrMZE3YUApQM2wTQ_6VMFMg0O'

export const createClient = () => createBrowserClient(supabaseUrl, supabaseAnonKey)