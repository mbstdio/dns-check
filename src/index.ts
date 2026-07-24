#!/usr/bin/env node

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

type RecordType = keyof Pick<Resolver, "resolve4" | "resolve6" | "resolveCaa" | "resolveCname" | "resolveMx" | "resolveNaptr" | "resolveNs" | "resolvePtr" | "resolveSoa" | "resolveSrv" | "resolveTxt">;
type ResolverDefinition = { name: string; ip: string };
type LookupResult = ResolverDefinition & { elapsed: number; status: "✓ OK" | "✗ NON" | "✗ Échec"; response: string };

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
    if (!Array.isArray(parsed)) throw new Error("format invalide");
    return parsed.filter((value): value is ResolverDefinition => Boolean(value) && typeof value.name === "string" && typeof value.ip === "string");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error(`Attention : impossible de lire les résolveurs personnalisés (${error instanceof Error ? error.message : "erreur inconnue"}).`);
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
  dns-check <domaine> [-t TYPE] [-e VALEUR_ATTENDUE]
  dns-check add -ip <adresse> -name <nom>
  dns-check resolvers
  dns-check remove <nom>

Types : ${Object.keys(RECORD_TYPES).join(", ")} (A par défaut)
  -e, --expected  Valeur qui doit être présente dans la réponse DNS`);
}

async function addResolver(args: string[]): Promise<void> {
  const ip = valueAfter(args, "-ip") ?? valueAfter(args, "--ip");
  const name = valueAfter(args, "-name") ?? valueAfter(args, "--name");
  if (!ip || !name || isIP(ip) === 0) {
    console.error("Usage : dns-check add -ip <adresse IP> -name <nom>");
    process.exitCode = 1;
    return;
  }
  const resolvers = await customResolvers();
  const existing = resolvers.findIndex((resolver) => resolver.name.toLowerCase() === name.toLowerCase());
  if (existing >= 0) resolvers[existing] = { name, ip };
  else resolvers.push({ name, ip });
  await saveCustomResolvers(resolvers);
  console.log(`Résolveur \"${name}\" (${ip}) enregistré.`);
}

async function listResolvers(): Promise<void> {
  for (const resolver of [...DEFAULT_RESOLVERS, ...await customResolvers()]) console.log(`${resolver.name}: ${resolver.ip}`);
}

async function removeResolver(name: string | undefined): Promise<void> {
  if (!name) { console.error("Usage : dns-check remove <nom>"); process.exitCode = 1; return; }
  const resolvers = await customResolvers();
  const retained = resolvers.filter((resolver) => resolver.name.toLowerCase() !== name.toLowerCase());
  if (retained.length === resolvers.length) { console.error(`Aucun résolveur personnalisé nommé \"${name}\".`); process.exitCode = 1; return; }
  await saveCustomResolvers(retained);
  console.log(`Résolveur \"${name}\" supprimé.`);
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

function printTable(headers: string[], rows: string[][]): void {
  const responseWidth = Math.max(24, Math.min(52, (process.stdout.columns ?? 120) - 82));
  const columnLimits = [34, 15, 10, 10, responseWidth];
  const widths = headers.map((header, column) => Math.min(columnLimits[column], Math.max(header.length, ...rows.map((row) => row[column].length))));
  const border = (left: string, middle: string, right: string) => `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;
  const formatLine = (cells: string[]) => `│ ${cells.map((cell, column) => cell.padEnd(widths[column])).join(" │ ")} │`;

  console.log(border("╭", "┬", "╮"));
  console.log(formatLine(headers));
  console.log(border("├", "┼", "┤"));
  for (const row of rows) {
    const cells = row.map((cell, column) => wrapCell(cell, widths[column]));
    const height = Math.max(...cells.map((cell) => cell.length));
    for (let line = 0; line < height; line++) console.log(formatLine(cells.map((cell) => cell[line] ?? "")));
  }
  console.log(border("╰", "┴", "╯"));
}

async function lookup(domain: string, recordType: string, expectedValue?: string): Promise<void> {
  const method = RECORD_TYPES[recordType.toUpperCase()];
  if (!method) { console.error(`Type DNS non pris en charge : ${recordType}`); process.exitCode = 1; return; }
  const resolvers = [...DEFAULT_RESOLVERS, ...await customResolvers()];
  console.log(`\nRésolution DNS · ${recordType.toUpperCase()} · ${domain}${expectedValue === undefined ? "" : ` · valeur attendue : ${expectedValue}`}`);
  console.log(`${resolvers.length} résolveur(s) interrogé(s)\n`);
  const results = await Promise.all(resolvers.map(async ({ name, ip }): Promise<LookupResult> => {
    const resolver = new Resolver();
    resolver.setServers([ip]);
    const startedAt = performance.now();
    try {
      const result = await resolver[method](domain);
      return {
        name,
        ip,
        elapsed: Math.round(performance.now() - startedAt),
        status: expectedValue === undefined || matchesExpectedValue(result, expectedValue) ? "✓ OK" : "✗ NON",
        response: formatResponse(result),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "erreur inconnue";
      process.exitCode = 2;
      return { name, ip, elapsed: Math.round(performance.now() - startedAt), status: "✗ Échec", response: message };
    }
  }));
  printTable(
    ["Résolveur", "IP", "Délai", "Statut", "Réponse DNS"],
    results.map(({ name, ip, elapsed, status, response }) => [name, ip, `${elapsed} ms`, status, response]),
  );
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
  console.error(error instanceof Error ? error.message : "Erreur inattendue");
  process.exitCode = 1;
});
