-- Supplemental Migration to Enable RLS and Policies for remaining tables
-- Resolves "RLS Enabled No Policy" warnings for these tables

-- 1. Enable RLS
alter table public.bingo_buffer enable row level security;
alter table public.subscriptions enable row level security;
alter table public.tracked_anime_state enable row level security;

-- 2. Create policies to allow the bot (service_role) full access
-- Note: Service role always has access, but these policies satisfy the Supabase linter 
-- and ensure no public access is accidentally granted.
create policy "Enable all access for service role on bingo_buffer" on public.bingo_buffer for all to service_role using (true) with check (true);
create policy "Enable all access for service role on subscriptions" on public.subscriptions for all to service_role using (true) with check (true);
create policy "Enable all access for service role on tracked_anime_state" on public.tracked_anime_state for all to service_role using (true) with check (true);
