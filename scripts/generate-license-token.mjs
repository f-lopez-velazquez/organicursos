import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Falta --${key}`);
  }
  return value;
}

function toIsoDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString();
}

const args = parseArgs(process.argv.slice(2));
const privateKeyPath = requireArg(args, "private-key");
const licensedTo = requireArg(args, "licensed-to");
const email = requireArg(args, "email");
const tier = args.tier ?? "professional";
const company = args.company ?? null;
const days = args.days ?? "365";
const licenseId = args["license-id"] ?? `atlas-${Date.now()}`;
const notBefore = args["not-before"] ?? null;
const features = (args.features ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const claims = {
  iss: "Atlas Courses",
  aud: "atlas-courses-desktop",
  licenseId,
  tier,
  licensedTo,
  email,
  company,
  issuedAt: new Date().toISOString(),
  expiresAt: args["expires-at"] ?? toIsoDays(days),
  notBefore,
  features,
};

const payload = Buffer.from(JSON.stringify(claims));
const privateKeyPem = readFileSync(privateKeyPath, "utf8");
const signature = sign(null, payload, createPrivateKey(privateKeyPem));

const token = `ATLAS1.${payload.toString("base64url")}.${signature.toString("base64url")}`;

process.stdout.write(`${token}\n`);
