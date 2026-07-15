# Production Database RDS Migration

## Current Finding

- OSS was checked with the official Aliyun OSS SDK on 2026-07-07.
- `ai-site-uploads-prod` and `ai-site-generated-prod` only contain website assets under `ai-website-workbench/`.
- No `.db`, `.sqlite`, `.sqlite3`, `.sql`, `.dump`, `.bak`, or obvious database backup object was found.
- The current app is still configured for SQLite, so `sqlite_in_production` is a real launch blocker.
- The current OSS access key cannot query RDS instances; Aliyun returned `403 Forbidden` for RDS read APIs.
- Aliyun console check confirmed no RDS instance in `cn-guangzhou` for this account.
- The production ECS is in `cn-guangzhou-a`, VPC `vpc-7xvq998a9qrtjv360tb3i`, vSwitch `vsw-7xvigp1vaswgyjrfptyvq`, private IP `172.17.155.4`.
- A server-side SQLite backup was created at `/opt/xinyingst/shared/backups/prod.db.before-rds-20260707-173826`.

## Recommended MVP Fix

Use Aliyun RDS MySQL 8.0 or PostgreSQL as the production database. Do not point Prisma at OSS; OSS can store uploads, generated websites, screenshots, ZIP packages, or database backups, but the app runtime needs a database connection string.

## Migration Steps

1. Export the current SQLite data:

```powershell
$env:PATH = "D:\codex002\tools\node-v24.16.0-win-x64;" + $env:PATH
npm run db:export:sqlite
```

The command prints a JSON file path under `generated/db-export/`.

2. Create or select an Aliyun RDS instance.

Recommended for MVP: MySQL 8.0 in `cn-guangzhou`, private network with ECS access, VPC `vpc-7xvq998a9qrtjv360tb3i`, vSwitch `vsw-7xvigp1vaswgyjrfptyvq`, and a dedicated database/user for this app.

3. Generate the matching Prisma schema:

```powershell
npm run prisma:schema:mysql
```

For PostgreSQL:

```powershell
npm run prisma:schema:postgres
```

4. In the same terminal, set the RDS connection string temporarily:

```powershell
$env:DATABASE_URL = "mysql://USER:PASSWORD@HOST:3306/DB_NAME"
```

For PostgreSQL:

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public"
```

5. Push the schema and generate Prisma Client for the target database:

```powershell
npm run prisma:push:mysql
npm run prisma:generate:mysql
```

For PostgreSQL:

```powershell
npm run prisma:push:postgres
npm run prisma:generate:postgres
```

6. Import the exported data:

```powershell
npm run db:import:prisma -- --file generated/db-export/sqlite-REPLACE_ME.json
```

7. Set the production deployment environment:

```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DB_NAME
PUBLIC_SITE_BASE_URL=https://xinyingst.com
```

8. Restart the app and check `/api/admin/launch-readiness`.

## Return Local Dev To SQLite

After doing production migration work locally, restore the local Prisma Client:

```powershell
$env:DATABASE_URL = "file:./dev.db"
npm run prisma:generate
```
