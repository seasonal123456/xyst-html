create table if not exists public.generated_sites (
  id uuid primary key default gen_random_uuid(),
  site_job_id text not null unique,
  customer_account_id text,
  netlify_site_id text,
  netlify_deploy_id text,
  published_url text not null,
  display_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_site_leads (
  id uuid primary key default gen_random_uuid(),
  generated_site_id uuid references public.generated_sites(id) on delete cascade,
  site_job_id text not null,
  name text,
  company text,
  phone text,
  email text,
  message text,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists generated_site_leads_site_job_id_idx on public.generated_site_leads(site_job_id);
create index if not exists generated_site_leads_created_at_idx on public.generated_site_leads(created_at desc);

alter table public.generated_sites enable row level security;
alter table public.generated_site_leads enable row level security;

-- MVP default: no direct browser access. The main ECS app writes with the service-role key.
-- Add anon/authenticated policies only after the customer-facing access model is finalized.
