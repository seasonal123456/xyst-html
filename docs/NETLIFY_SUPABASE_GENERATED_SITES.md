# Netlify + Supabase Generated Sites

This document describes the MVP publishing layer for generated customer websites.

## Goal

- Keep the main workbench on Aliyun ECS.
- Publish finished static websites to Netlify.
- Prepare Supabase as an optional lightweight backend for lead forms and per-site data.
- Keep original uploaded customer materials in the current storage path; only publish the final static website package.

## Netlify Publishing

Set these server-side environment variables:

```env
SITE_PUBLISH_PROVIDER=netlify
NETLIFY_AUTH_TOKEN=netlify_personal_access_token
NETLIFY_API_BASE_URL=https://api.netlify.com/api/v1
NETLIFY_SITE_NAME_PREFIX=xinyingst-site
NETLIFY_SITE_ID=
```

Behavior:

- When `SITE_PUBLISH_PROVIDER` is not `netlify`, nothing changes.
- When enabled, preview generation still writes the normal `previewUrl`.
- The publisher then extracts `index.html` and referenced assets from the preview, refuses to publish if required assets are missing, creates a ZIP, and deploys it to Netlify.
- Existing `netlifySiteId` is reused for later revisions so the customer URL stays stable.
- Results are stored on `SiteJob`:
  - `publishedUrl`
  - `publishProvider`
  - `publishStatus`
  - `publishError`
  - `netlifySiteId`
  - `netlifySiteName`
  - `netlifyDeployId`
  - `publishedAt`

Manual admin republish endpoint:

```http
POST /api/admin/site-jobs/:id/publish
```

## Supabase Preparation

Set these server-side variables when a Supabase project is ready:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server_only_service_role_key
SUPABASE_ANON_KEY=public_anon_key
SUPABASE_GENERATED_SITE_SCHEMA=public
```

Recommended first MVP use:

- Generated website contact forms submit leads to an API route on the main ECS app.
- The ECS app writes leads to Supabase using `SUPABASE_SERVICE_ROLE_KEY`.
- Do not expose the service-role key to generated static websites.
- If generated sites call Supabase directly later, use anon key + Row Level Security only.

Initial SQL is in:

```text
docs/supabase/generated-sites.sql
```

## ICP Note

Netlify and Supabase are typically overseas-hosted. If a generated site is mainly for mainland China public operation, domain and hosting compliance should be reviewed separately from the Aliyun ECS ICP filing.
