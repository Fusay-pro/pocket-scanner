import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars not set — falling back to localStorage');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export const isSupabaseConfigured =
  Boolean(supabaseUrl) && supabaseUrl !== 'your_supabase_project_url';
