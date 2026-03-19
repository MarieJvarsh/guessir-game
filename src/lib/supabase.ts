import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://vkeyfjhhlutyfclpssll.supabase.co'
export const supabaseAnonKey = 'sb_publishable_WPzrW3xrMZE3YUApQM2wTQ_6VMFMg0O'

export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
}