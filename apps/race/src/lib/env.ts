/**
 * The only place THE NINTH reads its environment. These are THE NINTH's OWN Supabase project credentials —
 * never the gym-management project's. The anon key is public by design (RLS is the boundary);
 * the service-role key must never be read here or reach a client component (see .env.example).
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};
