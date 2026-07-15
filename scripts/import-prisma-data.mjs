import { readFile } from "fs/promises";
import path from "path";

const orderedModels = [
  ["CustomerAccount", "customerAccount"],
  ["Job", "job"],
  ["SiteJob", "siteJob"],
  ["CreditRechargeRequest", "creditRechargeRequest"],
  ["CustomerSession", "customerSession"],
  ["JobFile", "jobFile"],
  ["SiteAsset", "siteAsset"],
  ["StyleConcept", "styleConcept"],
  ["CopyVersion", "copyVersion"],
  ["CopyAnnotation", "copyAnnotation"],
  ["SiteRevision", "siteRevision"],
  ["ModelUsageLog", "modelUsageLog"]
];

function parseArgs() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  return {
    file: fileIndex >= 0 ? args[fileIndex + 1] : "",
    dryRun: args.includes("--dry-run"),
    allowSqlite: args.includes("--allow-sqlite")
  };
}

async function loadDotEnv(filePath) {
  let text = "";
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function chunk(rows, size = 100) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function normalizeRows(modelMeta, rows) {
  const dateFields = new Set(modelMeta.fields.filter((field) => field.type === "DateTime").map((field) => field.name));
  return rows.map((row) => {
    const next = { ...row };
    for (const fieldName of dateFields) {
      if (next[fieldName]) next[fieldName] = new Date(next[fieldName]);
    }
    return next;
  });
}

const args = parseArgs();
if (!args.file) {
  console.error("Usage: node scripts/import-prisma-data.mjs --file generated/db-export/sqlite-....json");
  process.exit(1);
}

const payload = JSON.parse(await readFile(path.resolve(process.cwd(), args.file), "utf8"));

if (args.dryRun) {
  for (const [modelName] of orderedModels) {
    console.log(`${modelName}: ${(payload.models?.[modelName] || []).length}`);
  }
  process.exit(0);
}

await loadDotEnv(path.join(process.cwd(), ".env"));

if (!args.allowSqlite && process.env.DATABASE_URL?.trim().startsWith("file:")) {
  console.error("Refusing to import into SQLite. Set DATABASE_URL to the RDS connection string first.");
  process.exit(1);
}

const { Prisma, PrismaClient } = await import("@prisma/client");
const modelMetaByName = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));

const prisma = new PrismaClient();

try {
  for (const [modelName, clientName] of orderedModels) {
    const rows = payload.models?.[modelName] || [];
    if (!rows.length) continue;
    const modelMeta = modelMetaByName.get(modelName);
    const normalized = modelMeta ? normalizeRows(modelMeta, rows) : rows;

    for (const batch of chunk(normalized)) {
      await prisma[clientName].createMany({
        data: batch,
        skipDuplicates: true
      });
    }
    console.log(`${modelName}: imported ${rows.length}`);
  }
} finally {
  await prisma.$disconnect();
}
