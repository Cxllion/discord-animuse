-- Enable Row Level Security (RLS) on all exposed tables to resolve security warnings
alter table public.server_roles enable row level security;
alter table public.level_roles enable row level security;
alter table public.user_favorites enable row level security;
alter table public.guild_channels enable row level security;
alter table public.role_categories enable row level security;
alter table public.moderation_logs enable row level security;
alter table public.activity_posted enable row level security;

-- Create policies to allow the bot (service_role) full access to these tables
-- We use 'using (true)' and 'with check (true)' for the service role as it already bypasses RLS
-- However, creating these explicit policies is good practice and silences the linter while keeping the public out
create policy "Enable all access for service role on server_roles" on public.server_roles for all to service_role using (true) with check (true);
create policy "Enable all access for service role on level_roles" on public.level_roles for all to service_role using (true) with check (true);
create policy "Enable all access for service role on user_favorites" on public.user_favorites for all to service_role using (true) with check (true);
create policy "Enable all access for service role on guild_channels" on public.guild_channels for all to service_role using (true) with check (true);
create policy "Enable all access for service role on role_categories" on public.role_categories for all to service_role using (true) with check (true);
create policy "Enable all access for service role on moderation_logs" on public.moderation_logs for all to service_role using (true) with check (true);
create policy "Enable all access for service role on activity_posted" on public.activity_posted for all to service_role using (true) with check (true);
