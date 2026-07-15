import type { SiteJobDto } from "@/lib/site/site-types";

function supabaseUrl() {
  return process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") || "";
}

function supabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

function isConfigured() {
  return Boolean(supabaseUrl() && supabaseServiceRoleKey());
}

export async function syncGeneratedSiteToSupabase(job: SiteJobDto) {
  if (!isConfigured() || !job.publishedUrl) return;

  const payload = {
    site_job_id: job.id,
    netlify_site_id: job.netlifySiteId,
    netlify_deploy_id: job.netlifyDeployId,
    published_url: job.publishedUrl,
    display_name: job.customerName || job.businessDescription.slice(0, 80),
    status: "active",
    updated_at: new Date().toISOString()
  };

  const response = await fetch(`${supabaseUrl()}/rest/v1/generated_sites?on_conflict=site_job_id`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase generated_sites sync failed: HTTP ${response.status} ${text}`.slice(0, 600));
  }
}
