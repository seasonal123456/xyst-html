import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const providerAliases = {
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql"
};

const requested = process.argv[2]?.trim().toLowerCase();
const provider = providerAliases[requested];

if (!provider) {
  console.error("Usage: node scripts/prepare-prisma-schema.mjs <postgresql|mysql>");
  process.exit(1);
}

const root = process.cwd();
const sourcePath = path.join(root, "prisma", "schema.prisma");
const outputDir = path.join(root, "generated", "prisma");
const outputPath = path.join(outputDir, `schema.${provider}.prisma`);

const source = await readFile(sourcePath, "utf8");
let output = source.replace(/provider\s*=\s*"sqlite"/, `provider = "${provider}"`);

if (output === source) {
  console.error("Unable to replace sqlite datasource provider in prisma/schema.prisma.");
  process.exit(1);
}

const mysqlLongTextFields = new Map(
  Object.entries({
    Job: ["sellingPoints", "note", "prompt", "generatedImageUrl", "publicResultUrl", "adminNote", "error"],
    JobFile: ["originalName", "storedName", "url"],
    SiteJob: [
      "businessDescription",
      "websitePurpose",
      "codexPrompt",
      "previewUrl",
      "siteZipUrl",
      "screenshotUrl",
      "deliveryNote",
      "adminNote"
    ],
    SiteAsset: ["originalName", "storedName", "url"],
    StyleConcept: [
      "styleDescription",
      "suitableFor",
      "layoutStyle",
      "colorTendency",
      "visualTechniquesJson",
      "emotionalDescription",
      "imageUrl"
    ],
    CopyVersion: ["contentJson"],
    CopyAnnotation: ["selectedText", "note"],
    SiteRevision: ["revisionInstruction", "previewUrl", "screenshotUrl", "error"],
    ModelUsageLog: ["endpoint", "rawUsageJson", "metadataJson", "error"],
    CustomerAccount: ["note"],
    CreditRechargeRequest: ["note"]
  }).map(([model, fields]) => [model, new Set(fields)])
);

function applyMysqlNativeTypes(schema) {
  let currentModel = null;
  return schema
    .split(/\r?\n/)
    .map((line) => {
      const modelMatch = line.match(/^model\s+(\w+)\s+\{/);
      if (modelMatch) {
        currentModel = modelMatch[1];
        return line;
      }
      if (line === "}") {
        currentModel = null;
        return line;
      }
      if (!currentModel || line.includes("@db.")) return line;

      const fieldMatch = line.match(/^(\s{2})(\w+)(\s+)String(\??)(\s*.*)$/);
      if (!fieldMatch) return line;
      const [, indent, fieldName, spacing, optional, rest] = fieldMatch;
      if (!mysqlLongTextFields.get(currentModel)?.has(fieldName)) return line;
      return `${indent}${fieldName}${spacing}String${optional}${rest} @db.LongText`;
    })
    .join("\n");
}

if (provider === "mysql") {
  output = applyMysqlNativeTypes(output);
}

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, output, "utf8");
console.log(outputPath);
