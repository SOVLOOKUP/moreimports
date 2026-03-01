
import ky from "ky";
import { camelCase, pascalCase } from "es-toolkit";
import { parseDocument } from "htmlparser2";
import { selectOne, selectAll } from "css-select";
import { generate } from "ts-to-zod";
import { load } from "cheerio"

// 配置并发请求数量
const CONCURRENT_REQUESTS = 4; // 控制并发数以减少网络抖动导致的失败
const MAX_RETRY_ATTEMPTS = 4;
const generatedPath = "./src/protocal/generated/";
const readmePath = "./README.md";
const readmeAutoSectionStart = "<!-- AUTO-GENERATED-IMPORTS:START -->";
const readmeAutoSectionEnd = "<!-- AUTO-GENERATED-IMPORTS:END -->";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { response?: { status?: number } })?.response?.status;

  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }

  return /(socket connection was closed unexpectedly|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed)/i.test(
    message
  );
}

async function fetchTextWithRetry(url: string, service: string) {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await ky.get(url, { timeout: 20000, retry: 0 }).text();
    } catch (error) {
      const canRetry = isTransientNetworkError(error) && attempt < MAX_RETRY_ATTEMPTS;
      if (!canRetry) {
        throw error;
      }

      const delay = 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.warn(
        `\n${service} 请求失败（第 ${attempt}/${MAX_RETRY_ATTEMPTS} 次），${Math.round(delay)}ms 后重试...`
      );
      await sleep(delay);
    }
  }

  throw new Error(`处理 ${service} 失败：重试后仍无法获取`);
}

// 进度显示函数（改进版，包含时间估算）
class ProgressTracker {
  private startTime: number = Date.now();
  private completed: number = 0;
  private total: number = 0;

  constructor(total: number) {
    this.total = total;
  }

  update(service: string) {
    this.completed++;
    const elapsed = (Date.now() - this.startTime) / 1000; // 秒
    const progress = this.completed / this.total;
    const eta = progress > 0 ? (elapsed / progress) * (1 - progress) : 0;

    const percentage = Math.round(progress * 100);
    const barLength = 30;
    const filledLength = Math.round((percentage / 100) * barLength);
    const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

    const timeInfo = eta > 0 ? `, ETA: ${Math.round(eta)}s` : "";
    process.stdout.write(
      `\r[${bar}] ${percentage}% (${this.completed}/${this.total}) - ${service}${timeInfo}`
    );
  }

  complete() {
    console.log("\n"); // 换行以避免覆盖
  }
}

// 递归提取htmlparser2节点的所有文本内容（核心辅助函数）
function extractNodeText(node: any) {
  if (node.type === "text") {
    return node.data || "";
  }
  if (node.type === "tag" && node.children) {
    return node.children.map(extractNodeText).join("");
  }
  return "";
}

// 提取文本内容（优化版，仅提取单个节点）
function extractTextByCSS(html: string, cssSelector: string) {
  try {
    const dom = parseDocument(html);
    const node = selectOne(cssSelector, dom);
    return node ? extractNodeText(node).trim() : "";
  } catch (error) {
    console.error(`CSS选择器提取文本失败: ${error}`);
    return "";
  }
}

// 类型转换函数（优化版）
const typeMap = {
  String: "string",
  usize: "number",
  u32: "number",
  u64: "number",
  bool: "boolean",
  i64: "number",
  Duration: "number",
};

function convertType(rstype: string) {
  let result = rstype
    .replaceAll("#[non_exhaustive]", "")
    .replace("pub struct", "export interface")
    .replaceAll("pub ", "")
    .replaceAll(/Show \d+ fields/g, "");

  // 使用for循环替代多次replaceAll调用，提高性能
  for (const [rustType, tsType] of Object.entries(typeMap)) {
    result = result
      .replaceAll(`: ${rustType},`, `: ${tsType};`)
      .replaceAll(`: Vec<${rustType}>,`, `: ${tsType}[];`)
      .replaceAll(`: Option<${rustType}>,`, `?: ${tsType};`)
      .replaceAll(`: Option<Vec<${rustType}>>,`, `?: ${tsType}[];`);
  }

  return result;
}

function generateReadmeAutoSection(schemas: string[]) {
  const sortedSchemas = [...schemas].sort((a, b) => a.localeCompare(b));
  const previewSchemas = sortedSchemas
    .slice(0, 12)
    .map((schema) => `\`${schema}\``)
    .join(", ");

  const exampleSchemas = ["s3", "fs", "http"].filter((schema) =>
    sortedSchemas.includes(schema)
  );
  const directImportExamples = (exampleSchemas.length > 0
    ? exampleSchemas
    : sortedSchemas.slice(0, 3)
  )
    .map(
      (schema) =>
        `import ${camelCase(schema)}Module from "${schema}://<base64-options>/path/to/module.js";`
    )
    .join("\n");

  const grouped = sortedSchemas.reduce<Record<string, string[]>>(
    (acc, schema) => {
      const first = schema[0]?.toUpperCase() ?? "#";
      const groupKey = /[A-Z]/.test(first) ? first : "#";

      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }

      acc[groupKey]!.push(schema);
      return acc;
    },
    {}
  );

  const groupedList = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, items]) =>
        `- **${key}**: ${items.map((item) => `\`${item}\``).join(" · ")}`
    )
    .join("\n");

  return `## Available Protocol Modules (Auto-generated)

This project currently supports **${sortedSchemas.length}** protocol modules that can be imported directly.

Preview: ${previewSchemas}${sortedSchemas.length > 12 ? " ..." : ""}

### Quick Start

Use \`newURL\` first to build a module specifier (options are encoded automatically).

### Import Examples

\`\`\`ts
import { newURL } from "moreimports";

const specifier = newURL("s3", {
  bucket: "my-bucket",
  region: "ap-southeast-1",
  access_key_id: "<your-access-key>",
  secret_access_key: "<your-secret-key>",
}, "index.ts");

const mod = await import(specifier);
\`\`\`

You can also import with a direct protocol URL:

\`\`\`ts
import customModule from "<schema>://<base64-options>/path/to/module.js";

${directImportExamples}
\`\`\`

<details>
<summary>View all available protocols (grouped by initial)</summary>

${groupedList}

</details>
`;
}

async function updateReadme(schemas: string[]) {
  const currentReadme = await Bun.file(readmePath).text();
  const generatedSection = `${readmeAutoSectionStart}\n${generateReadmeAutoSection(schemas)}${readmeAutoSectionEnd}`;
  const autoSectionRegex = new RegExp(
    `${readmeAutoSectionStart}[\\s\\S]*?${readmeAutoSectionEnd}`
  );

  const nextReadme = autoSectionRegex.test(currentReadme)
    ? currentReadme.replace(autoSectionRegex, generatedSection)
    : `${currentReadme.trimEnd()}\n\n${generatedSection}\n`;

  await Bun.write(readmePath, nextReadme);
  console.log("已更新 README.md 自动文档区块");
}

// 并发处理函数（改进版，使用更高效的并发模式）
async function processUrlsConcurrently(urls: string[], services: string[]) {
  const results: string[] = new Array(urls.length);
  const progressTracker = new ProgressTracker(urls.length);

  let cursor = 0;
  const workerCount = Math.min(CONCURRENT_REQUESTS, urls.length);

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= urls.length) {
        break;
      }

      const service = services[index]!;
      const url = urls[index]!;
      console.log(`开始处理服务: ${service}`);

      try {
        const html = await fetchTextWithRetry(url, service);
        const rstype = extractTextByCSS(html, ".rust > code:nth-child(1)");
        results[index] = convertType(rstype);
        console.log(`完成处理服务: ${service}`);
      } catch (error) {
        console.error(`\n处理 ${service} 失败: ${error}`);
        results[index] = `// 处理 ${service} 失败`;
      } finally {
        progressTracker.update(service);
      }
    }
  };

  await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));

  progressTracker.complete();
  return results;
}

// 主函数
async function main() {
  console.log("开始获取 Opendal 服务列表...");

  // 获取服务列表
  const res = await ky
    .get(
      "https://docs.rs/opendal/latest/opendal/services/"
    )
    .text();

  const $ = load(res);
  const items = $(".item-table > dt > span > code").map((i, el) => $(el).text()).get();
  const schemas = items.map((item) => item.replace("services-", ""));

  console.log(`获取到 ${schemas.length} 个服务`);

  // 生成 schema.ts
  const schemaCode = `export type OpendalSchema = 
${schemas.map((item) => `  | "${item}"`).join("\n")}

export const schemas: OpendalSchema[] = ${JSON.stringify(schemas)};`;

  await Bun.write(`${generatedPath}schema.ts`, schemaCode);
  console.log("\n已生成 schema.ts");

  // 生成 options.ts
  // 处理 options
  const pascalCaseOptions = schemas.map((item) => pascalCase(item));
  const optionhtmlurl = pascalCaseOptions.map(
    (item) =>
      `https://docs.rs/opendal/latest/opendal/services/struct.${item}Config.html`
  );

  console.log("\n开始处理服务配置...");
  const optionhtml = await processUrlsConcurrently(
    optionhtmlurl,
    pascalCaseOptions
  );

  // 生成 options.ts
  const optioncode = `// Generate from https://docs.rs/opendal/latest/opendal/services/
${optionhtml.join("\n\n")}

export type OpendalOption = ${pascalCaseOptions
      .map((item) => `\n  | ${item}Config`)
      .join("")};`;

  await Bun.write(`${generatedPath}options.ts`, optioncode);
  console.log("已生成 options.ts");

  // 生成 optionsSchema.ts
  const out = generate({
    sourceText: optioncode,
  });

  await Bun.write(
    `${generatedPath}optionsSchema.ts`,
    out.getZodSchemasFile(`${generatedPath}options.ts`)
  );
  console.log("已生成 optionsSchema.ts");

  // 生成 schemaConfig.ts
  const camelCaseOptions = schemas.map(
    (item) => `${camelCase(item)}ConfigSchema`
  );
  const optionsExport = schemas
    .map((item) => `"${item}": ${camelCase(item)}ConfigSchema`)
    .join(",\n  ");

  const schemaConfig = `import { 
  ${camelCaseOptions.join(",\n  ")}
} from "./optionsSchema";

export default {
  ${optionsExport}
};`;

  await Bun.write(`${generatedPath}schemaConfig.ts`, schemaConfig);
  console.log("已生成 schemaConfig.ts");

  await updateReadme(schemas);

  console.log("\n完成！已生成所有文件");
}

// 执行主函数
await Promise.all([
  main(),
  (async () => {
    const bunLoaders: string[] = selectAll(
      `#table-of-contents-content > li[data-depth="1"]`,
      parseDocument(await ky.get("https://bun.com/docs/bundler/loaders").text())
    ).map((i) => extractNodeText(i));

    await Bun.write(
      `${generatedPath}bunLoaders.ts`,
      `// generate from https://bun.com/docs/bundler/loaders
// @ts-ignore
export const loader = new Set<Bun.Loader>([
  "${bunLoaders.join('",\n  "')}"
])`
    );
    console.log("已生成 bunLoaders.ts");
  })(),
]);
