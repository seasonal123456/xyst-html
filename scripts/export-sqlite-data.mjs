import { mkdir, readFile, writeFile } from "fs/promises";
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
  const outIndex = args.indexOf("--out");
  return {
    out:
      outIndex >= 0 && args[outIndex + 1]
        ? args[outIndex + 1]
        : path.join("generated", "db-export", `sqlite-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
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

await loadDotEnv(path.join(process.cwd(), ".env"));

if (!process.env.DATABASE_URL?.trim().startsWith("file:")) {
  console.error("Refusing to export: DATABASE_URL is not a SQLite file URL.");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const outputPath = path.resolve(process.cwd(), parseArgs().out);
const payload = {
  exportedAt: new Date().toISOString(),
  sourceProvider: "sqlite",
  models: {}
};

try {
  for (const [modelName, clientName] of orderedModels) {
    payload.models[modelName] = await prisma[clientName].findMany();
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(outputPath);
} finally {
  await prisma.$disconnect();
}
