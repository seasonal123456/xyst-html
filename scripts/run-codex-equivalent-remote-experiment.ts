import * as nextEnvModule from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPrompt } from "../src/lib/site/codex-site-generator";
import { runPreparedRemoteHtmlExperiment } from "../src/lib/site/remote-html-site-generator";

const nextEnv = nextEnvModule as typeof nextEnvModule & {
  default?: typeof nextEnvModule;
  "module.exports"?: typeof nextEnvModule;
};
const loadEnvConfig = nextEnv.loadEnvConfig || nextEnv.default?.loadEnvConfig || nextEnv["module.exports"]?.loadEnvConfig;
if (!loadEnvConfig) throw new Error("Unable to load @next/env loadEnvConfig.");
loadEnvConfig(process.cwd());

async function main() {
  const sourceDir = path.resolve(
    process.argv[2] || "comparisons/cmti38l1508df1js6w2qhvfp8-local-codex-20260901"
  );
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const outputDir = path.resolve(
    process.argv[3] || `comparisons/cmti38l1508df1js6w2qhvfp8-remote-codex-equivalent-high-${stamp}`
  );
  await mkdir(outputDir, { recursive: true });

  const brief = JSON.parse(await readFile(path.join(sourceDir, "site-brief.json"), "utf8")) as {
    siteJobId?: string;
    imagePolicy?: { requiredImageUrls?: string[] };
  };
  const prompt = buildPrompt(brief, "raw_html");
  await writeFile(path.join(outputDir, "prompt.md"), prompt, "utf8");
  await writeFile(path.join(outputDir, "site-brief.json"), JSON.stringify(brief, null, 2), "utf8");

  const visualDir = path.join(sourceDir, "visual-references");
  const imageFiles = [
    {
      path: path.join(visualDir, "01-style-reference.png"),
      label: "Design reference image. Analyze visual structure only; never display this image in the website."
    },
    {
      path: path.join(visualDir, "02-content-image.png"),
      label: "Allowed website content image 1. Use the corresponding first allowed URL from the brief in HTML."
    },
    {
      path: path.join(visualDir, "03-content-image.png"),
      label: "Allowed website content image 2. Use the corresponding second allowed URL from the brief in HTML."
    },
    {
      path: path.join(visualDir, "04-content-image.png"),
      label: "Allowed website content image 3. Use the corresponding third allowed URL from the brief in HTML."
    }
  ];

  const result = await runPreparedRemoteHtmlExperiment({
    prompt,
    siteJobId: brief.siteJobId || "cmti38l1508df1js6w2qhvfp8",
    outputDir,
    imageFiles,
    requiredImageUrls: brief.imagePolicy?.requiredImageUrls || [],
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    maxOutputTokens: 48_000
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
