import { createClient, SupabaseClient } from '@supabase/supabase-js';

/*
================================================================================
SUPABASE SETUP & CONFIGURATION INSTRUCTIONS
================================================================================
1. Create a free project on https://supabase.com
2. Run the following SQL script in your Supabase SQL Editor:

CREATE TABLE IF NOT EXISTS pins (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('passagier', 'chauffeur')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  bestemming_lat DOUBLE PRECISION,
  bestemming_lng DOUBLE PRECISION,
  bestemming_tekst TEXT,
  haast BOOLEAN DEFAULT FALSE,
  telefoon TEXT,
  aangemaakt_op TIMESTAMPTZ DEFAULT NOW(),
  laatst_geupdate_op TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) & Public Access
ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public pins access" ON pins FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime on the pins table
ALTER PUBLICATION supabase_realtime ADD TABLE pins;

3. Copy your Project URL and Anon Public Key below or into .env as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
================================================================================
*/

export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://gcgdriqyrjrutlijcgof.supabase.co';
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_JnuTaDRJo6HHX5q7EtXdQQ_4X8hN3Td';

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(SUPABASE_URL) &&
    Boolean(SUPABASE_ANON_KEY) &&
    !SUPABASE_URL.includes('YOUR_SUPABASE_PROJECT') &&
    !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')
  );
};

let client: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
  }
}

export const supabase = client;

export interface SupabasePin {
  id: string;
  type: 'passagier' | 'chauffeur';
  lat: number;
  lng: number;
  bestemming_lat?: number | null;
  bestemming_lng?: number | null;
  bestemming_tekst?: string | null;
  haast: boolean;
  telefoon?: string | null;
  user_id?: string | null;
  aangemaakt_op: string;
  laatst_geupdate_op: string;
}

export async function getOrCreateAnonymousUser(): Promise<string | null> {
  if (!supabase) {
    console.warn('[Supabase Auth] Supabase client is not configured.');
    return null;
  }

  try {
    // 1. Check for active session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.warn('[Supabase Auth] Error checking session:', sessionError.message);
    }

    if (sessionData?.session?.user) {
      const existingUserId = sessionData.session.user.id;
      console.log('[Supabase Auth] Active anonymous session found. User ID:', existingUserId);
      return existingUserId;
    }

    // 2. Sign in anonymously if no session exists
    console.log('[Supabase Auth] No active session found. Signing in anonymously...');
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

    if (authError) {
      console.warn('[Supabase Auth] Anonymous sign-in not enabled on Supabase project:', authError.message);
      return null;
    }

    if (authData?.user) {
      const newUserId = authData.user.id;
      console.log('[Supabase Auth] Anonymous sign-in successful! User ID:', newUserId);
      return newUserId;
    }
  } catch (err) {
    console.warn('[Supabase Auth] Exception during anonymous sign-in:', err);
  }

  return null;
}

// Calculate Haversine distance in meters
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
