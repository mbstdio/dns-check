#!/usr/bin/env node

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

type RecordType = keyof Pick<Resolver, "resolve4" | "resolve6" | "resolveCaa" | "resolveCname" | "resolveMx" | "resolveNaptr" | "resolveNs" | "resolvePtr" | "resolveSoa" | "resolveSrv" | "resolveTxt">;
type ResolverDefinition = { name: string; ip: string };
type LookupResult = ResolverDefinition & { elapsed: number; status: "✓ OK" | "✗ NO" | "✗ Failed"; response: string };

const DEFAULT_RESOLVERS: ResolverDefinition[] = [
  { name: "Google", ip: "8.8.8.8" },
  { name: "Cloudflare", ip: "1.1.1.1" },
  { name: "Quad9", ip: "9.9.9.9" },
  { name: "OpenDNS", ip: "208.67.222.222" },
  { name: "AdGuard DNS", ip: "94.140.14.14" },
  { name: "CleanBrowsing", ip: "185.228.168.9" },
  { name: "Completel SAS", ip: "83.145.86.7" },
  { name: "ServiHosting Networks S.L.", ip: "84.236.142.130" },
  { name: "Universitaet Leipzig", ip: "139.18.25.33" },
  { name: "Universidad LatinoAmericana S.C.", ip: "200.33.3.123" },
  { name: "Swisscom AG", ip: "195.186.1.111" },
  { name: "NTT", ip: "118.3.227.163" }
];

const RECORD_TYPES: Record<string, RecordType> = {
  A: "resolve4", AAAA: "resolve6", CAA: "resolveCaa", CNAME: "resolveCname",
  MX: "resolveMx", NAPTR: "resolveNaptr", NS: "resolveNs", PTR: "resolvePtr",
  SOA: "resolveSoa", SRV: "resolveSrv", TXT: "resolveTxt",
};

function configPath(): string {
  const base = process.env.APPDATA ?? (process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support")
    : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"));
  return path.join(base, "dns-check", "resolvers.json");
}

async function customResolvers(): Promise<ResolverDefinition[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(configPath(), "utf8"));
    if (!Array.isArray(parsed)) throw new Error("invalid format");
    return parsed.filter((value): value is ResolverDefinition => Boolean(value) && typeof value.name === "string" && typeof value.ip === "string");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error(`Warning: unable to read custom resolvers (${error instanceof Error ? error.message : "unknown error"}).`);
    return [];
  }
}

async function saveCustomResolvers(resolvers: ResolverDefinition[]): Promise<void> {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), `${JSON.stringify(resolvers, null, 2)}\n`, "utf8");
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): void {
  console.log(`Usage:
  dns-check <domain> [-t TYPE] [-e EXPECTED_VALUE]
  dns-check add -ip <IP_ADDRESS> -name <name>
  dns-check resolvers
  dns-check remove <name>

Record types: ${Object.keys(RECORD_TYPES).join(", ")} (A by default)
  -e, --expected  Value that must be present in the DNS response`);
}

async function addResolver(args: string[]): Promise<void> {
  const ip = valueAfter(args, "-ip") ?? valueAfter(args, "--ip");
  const name = valueAfter(args, "-name") ?? valueAfter(args, "--name");
  if (!ip || !name || isIP(ip) === 0) {
    console.error("Usage: dns-check add -ip <IP address> -name <name>");
    process.exitCode = 1;
    return;
  }
  const resolvers = await customResolvers();
  const existing = resolvers.findIndex((resolver) => resolver.name.toLowerCase() === name.toLowerCase());
  if (existing >= 0) resolvers[existing] = { name, ip };
  else resolvers.push({ name, ip });
  await saveCustomResolvers(resolvers);
  console.log(`Resolver \"${name}\" (${ip}) saved.`);
}

async function listResolvers(): Promise<void> {
  for (const resolver of [...DEFAULT_RESOLVERS, ...await customResolvers()]) console.log(`${resolver.name}: ${resolver.ip}`);
}

async function removeResolver(name: string | undefined): Promise<void> {
  if (!name) { console.error("Usage: dns-check remove <name>"); process.exitCode = 1; return; }
  const resolvers = await customResolvers();
  const retained = resolvers.filter((resolver) => resolver.name.toLowerCase() !== name.toLowerCase());
  if (retained.length === resolvers.length) { console.error(`No custom resolver named \"${name}\".`); process.exitCode = 1; return; }
  await saveCustomResolvers(retained);
  console.log(`Resolver \"${name}\" removed.`);
}

function wrapCell(value: string, width: number): string[] {
  if (value.length <= width) return [value];
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + word.length + 1 <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.flatMap((item) => item.length <= width
    ? [item]
    : Array.from({ length: Math.ceil(item.length / width) }, (_, index) => item.slice(index * width, (index + 1) * width)));
}

function formatDnsValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function formatResponse(result: unknown): string {
  if (Array.isArray(result)) return result.map(formatDnsValue).join(", ");
  return formatDnsValue(result);
}

function matchesExpectedValue(result: unknown, expectedValue: string): boolean {
  const values = Array.isArray(result) ? result : [result];
  return values.some((value) => formatDnsValue(value) === expectedValue);
}

function tableLayout(headers: string[]): { widths: number[]; border: (left: string, middle: string, right: string) => string; formatLine: (cells: string[]) => string } {
  const responseWidth = Math.max(24, Math.min(52, (process.stdout.columns ?? 120) - 82));
  const columnLimits = [34, 15, 10, 10, responseWidth];
  const widths = headers.map((header, column) => Math.max(header.length, columnLimits[column]));
  const border = (left: string, middle: string, right: string) => `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;
  const formatLine = (cells: string[]) => `│ ${cells.map((cell, column) => cell.padEnd(widths[column])).join(" │ ")} │`;
  return { widths, border, formatLine };
}

function printTableHeader(headers: string[]): ReturnType<typeof tableLayout> {
  const layout = tableLayout(headers);
  console.log(layout.border("╭", "┬", "╮"));
  console.log(layout.formatLine(headers));
  console.log(layout.border("├", "┼", "┤"));
  return layout;
}

function printTableRow(layout: ReturnType<typeof tableLayout>, row: string[]): void {
  const cells = row.map((cell, column) => wrapCell(cell, layout.widths[column]));
  const height = Math.max(...cells.map((cell) => cell.length));
  for (let line = 0; line < height; line++) console.log(layout.formatLine(cells.map((cell) => cell[line] ?? "")));
}

async function lookup(domain: string, recordType: string, expectedValue?: string): Promise<void> {
  const method = RECORD_TYPES[recordType.toUpperCase()];
  if (!method) { console.error(`Unsupported DNS record type: ${recordType}`); process.exitCode = 1; return; }
  const resolvers = [...DEFAULT_RESOLVERS, ...await customResolvers()];
  console.log(`\nDNS lookup · ${recordType.toUpperCase()} · ${domain}${expectedValue === undefined ? "" : ` · expected value: ${expectedValue}`}`);
  console.log(`${resolvers.length} resolver(s) queried\n`);
  const layout = printTableHeader(["Resolver", "IP", "Latency", "Status", "DNS response"]);
  await Promise.all(resolvers.map(async ({ name, ip }): Promise<LookupResult> => {
    const resolver = new Resolver();
    resolver.setServers([ip]);
    const startedAt = performance.now();
    try {
      const result = await resolver[method](domain);
      return {
        name,
        ip,
        elapsed: Math.round(performance.now() - startedAt),
        status: expectedValue === undefined || matchesExpectedValue(result, expectedValue) ? "✓ OK" : "✗ NO",
        response: formatResponse(result),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      process.exitCode = 2;
      return { name, ip, elapsed: Math.round(performance.now() - startedAt), status: "✗ Failed", response: message };
    }
  }).map((promise) => promise.then((result) => {
    printTableRow(layout, [result.name, result.ip, `${result.elapsed} ms`, result.status, result.response]);
    return result;
  })));
  console.log(layout.border("╰", "┴", "╯"));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h") return usage();
  if (command === "add") return addResolver(args.slice(1));
  if (command === "resolvers" || command === "list") return listResolvers();
  if (command === "remove") return removeResolver(args[1]);
  if (command.startsWith("-")) { usage(); process.exitCode = 1; return; }
  const recordType = valueAfter(args, "-t") ?? valueAfter(args, "--type") ?? "A";
  const expectedValue = valueAfter(args, "-e") ?? valueAfter(args, "--expected");
  await lookup(command, recordType, expectedValue);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected error");
  process.exitCode = 1;
});
