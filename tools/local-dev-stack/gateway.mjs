#!/usr/bin/env node
/**
 * LOCAL DEV ONLY — a small stand-in for the two Supabase HTTP services the
 * web app talks to, so the REAL application can be run and operated against
 * the REAL migrations on a plain local PostgreSQL server, with no Docker and
 * no network access to a Supabase project.
 *
 *   /auth/v1/*   a minimal GoTrue: password sign-in, token refresh, get user,
 *                sign out.
 *   /rest/v1/*   a minimal PostgREST: table/view reads with the subset of the
 *                query grammar this application actually uses, and RPC calls.
 *
 * It has NO security value and must never be pointed at real data:
 *   * the JWT secret is a constant in this file;
 *   * passwords are a salted SHA-256, matching 10_seed_demo.sql;
 *   * nothing is rate-limited and CORS is wide open.
 *
 * What makes it worth having is that it does NOT fake the database. Every
 * request runs against the real local database, inside a transaction, as the
 * real client role, with request.jwt.claims set exactly as PostgREST sets it:
 *
 *     begin;
 *       set local role authenticated;
 *       set local request.jwt.claims = '{"sub":"...","role":"authenticated"}';
 *       <the query>
 *     commit;
 *
 * so auth.uid(), auth_role(), every RLS policy and every SECURITY DEFINER
 * RPC behave here exactly as they do in production. A screen that works
 * against this gateway is a screen that worked against the real policies.
 *
 * Zero dependencies on purpose: it shells out to `psql` and signs tokens with
 * node:crypto, so there is nothing to install and nothing added to the repo's
 * lockfile.
 *
 * Usage:  node gateway.mjs            (listens on 54321)
 *         PORT=5555 node gateway.mjs
 */
import http from "node:http";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { writeFileSync, mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT ?? 54321);
const DB = process.env.LOCAL_DB ?? "ninth_round_local";
const JWT_SECRET = "local-dev-only-not-a-secret";
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const SQL_DIR = mkdtempSync(join(tmpdir(), "ninth-gateway-"));
// mkdtemp creates the directory 0700, which the `postgres` OS user cannot
// traverse, so psql would fail with "Permission denied" on every query file.
chmodSync(SQL_DIR, 0o755);
// psql needs to read the files we hand it, and on this box it runs as the
// `postgres` OS user via `su`.
const PSQL_AS_POSTGRES = process.getuid?.() === 0;

let sqlFileCounter = 0;

// ---------------------------------------------------------------------------
// psql plumbing
// ---------------------------------------------------------------------------

/** Runs one SQL script and returns its single-value output, or throws. */
async function runSql(sql) {
  const file = join(SQL_DIR, `q${++sqlFileCounter}.sql`);
  writeFileSync(file, sql, { mode: 0o644 });
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", file];
  try {
    const { stdout } = PSQL_AS_POSTGRES
      ? await execFileAsync("su", ["postgres", "-c", `psql ${args.map(shellQuote).join(" ")}`], { maxBuffer: 64 * 1024 * 1024 })
      : await execFileAsync("psql", args, { maxBuffer: 64 * 1024 * 1024 });
    return stdout.trim();
  } catch (e) {
    throw new SqlError(String(e.stderr ?? e.message ?? e));
  }
}

function shellQuote(s) {
  return `'${String(s).replaceAll("'", "'\\''")}'`;
}

class SqlError extends Error {
  constructor(raw) {
    const m = /ERROR:\s+(.*)/.exec(raw);
    super(m ? m[1].trim() : raw.trim());
    this.raw = raw;
    const code = /ERROR:\s+(?:.*\n)?.*?\n?.*?SQLSTATE[^0-9A-Z]*([0-9A-Z]{5})/.exec(raw);
    this.sqlstate = code ? code[1] : /permission denied/i.test(raw) ? "42501" : "P0001";
  }
}

/** A dollar-quoting tag that cannot appear inside `value`. */
function dq(value) {
  const s = String(value);
  let tag = "v";
  while (s.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${s}$${tag}$`;
}

function lit(value, type) {
  if (value === null || value === undefined) return type ? `null::${type}` : "null";
  // A JSON array sent for an ARRAY-typed parameter (uuid[], text[]) is a
  // Postgres array literal, exactly as PostgREST treats it — not jsonb.
  if (type && type.endsWith("[]") && Array.isArray(value)) {
    const items = value.map((v) => `"${String(v).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",");
    return `${dq(`{${items}}`)}::${type}`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "object") return `${dq(JSON.stringify(value))}::jsonb`;
  return type ? `${dq(value)}::${type}` : dq(value);
}

/** Wraps a query so it runs as the request's role, with PostgREST's GUCs. */
function asRequest(claims, body) {
  const role = claims?.role ?? "anon";
  const roleName = role === "service_role" ? "service_role" : role === "authenticated" ? "authenticated" : "anon";
  return [
    "begin;",
    `set local role ${roleName};`,
    `set local request.jwt.claims = ${dq(JSON.stringify(claims ?? { role: "anon" }))};`,
    body,
    "commit;",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Catalog: function signatures and foreign keys, read once at startup.
// ---------------------------------------------------------------------------
let FUNCTIONS = new Map();
let FOREIGN_KEYS = new Map(); // "child->parent" -> {childColumn, parentColumn}

async function loadCatalog() {
  // Argument names, types and modes come from the catalog rather than from
  // parsing pg_get_function_identity_arguments: a TABLE-returning function
  // lists its OUT columns in proargnames too, and only proargmodes says
  // which entries are real inputs.
  const fnJson = await runSql(`
    select coalesce(json_agg(json_build_object(
      'name', f.proname,
      'retset', f.proretset,
      'isvoid', f.rettype = 'void',
      'args', f.args
    )), '[]'::json)::text
    from (
      select p.proname, p.proretset, pg_get_function_result(p.oid) as rettype,
             coalesce((
               select json_agg(json_build_object('name', a.name, 'type', format_type(a.atype, null)) order by a.ord)
               from unnest(
                      coalesce(p.proargnames, array[]::text[]),
                      coalesce(p.proallargtypes, p.proargtypes::oid[]),
                      coalesce(p.proargmodes,
                               array_fill('i'::"char", array[coalesce(array_length(p.proargnames, 1), 0)]))
                    ) with ordinality as a(name, atype, amode, ord)
               where a.amode in ('i', 'b') and a.name is not null and a.name <> ''
             ), '[]'::json) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
    ) f;
  `);
  for (const f of JSON.parse(fnJson)) {
    // Keep the LAST definition seen for an overloaded name only if it has the
    // most arguments — the app always calls the fullest signature.
    const prev = FUNCTIONS.get(f.name);
    if (!prev || f.args.length > prev.args.length) FUNCTIONS.set(f.name, f);
  }

  const fkJson = await runSql(`
    select coalesce(json_agg(json_build_object(
      'child', c.relname, 'parent', pc.relname,
      'childColumn', ca.attname, 'parentColumn', pa.attname
    )), '[]'::json)::text
    from pg_constraint k
    join pg_class c  on c.oid  = k.conrelid
    join pg_class pc on pc.oid = k.confrelid
    join pg_attribute ca on ca.attrelid = k.conrelid  and ca.attnum = k.conkey[1]
    join pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = k.confkey[1]
    where k.contype = 'f' and array_length(k.conkey, 1) = 1;
  `);
  for (const fk of JSON.parse(fkJson)) {
    FOREIGN_KEYS.set(`${fk.child}->${fk.parent}`, fk);
  }
  console.log(`[gateway] catalog: ${FUNCTIONS.size} functions, ${FOREIGN_KEYS.size} single-column foreign keys`);
}

// ---------------------------------------------------------------------------
// JWT (HS256)
// ---------------------------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString("base64url");

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  if (!token || token.split(".").length !== 3) return null;
  const [header, body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return { ...payload, expired: true };
    return payload;
  } catch {
    return null;
  }
}

export const ANON_KEY = signJwt({ role: "anon", iss: "ninth-round-local-gateway" });
export const SERVICE_ROLE_KEY = signJwt({ role: "service_role", iss: "ninth-round-local-gateway" });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function hashPassword(password, salt) {
  return `sha256$${salt}$${crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex")}`;
}

async function findUserByEmail(email) {
  const json = await runSql(
    `select coalesce(to_json(u), 'null')::text from (
       select id, email, encrypted_password, raw_user_meta_data, created_at
       from auth.users where lower(email) = lower(${dq(email)}) limit 1
     ) u;`,
  );
  return JSON.parse(json || "null");
}

async function findUserById(id) {
  const json = await runSql(
    `select coalesce(to_json(u), 'null')::text from (
       select id, email, raw_user_meta_data, created_at
       from auth.users where id = ${dq(id)}::uuid limit 1
     ) u;`,
  );
  return JSON.parse(json || "null");
}

function publicUser(row) {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: row.created_at,
    phone: "",
    confirmed_at: row.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.created_at,
    is_anonymous: false,
  };
}

function makeSession(row) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({
    sub: row.id,
    email: row.email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    iss: "ninth-round-local-gateway",
  });
  return {
    access_token,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    expires_at: now + ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: `local-refresh-${row.id}`,
    user: publicUser(row),
  };
}

// ---------------------------------------------------------------------------
// PostgREST query translation
// ---------------------------------------------------------------------------
const OPERATORS = {
  eq: (c, v) => `${c} = ${dq(v)}`,
  neq: (c, v) => `${c} <> ${dq(v)}`,
  gt: (c, v) => `${c} > ${dq(v)}`,
  gte: (c, v) => `${c} >= ${dq(v)}`,
  lt: (c, v) => `${c} < ${dq(v)}`,
  lte: (c, v) => `${c} <= ${dq(v)}`,
  like: (c, v) => `${c} like ${dq(v)}`,
  ilike: (c, v) => `${c} ilike ${dq(v)}`,
  is: (c, v) =>
    v === "null" ? `${c} is null`
      : v === "true" ? `${c} is true`
      : v === "false" ? `${c} is false`
      : `${c} is ${dq(v)}`,
  in: (c, v) => {
    const inner = v.replace(/^\(/, "").replace(/\)$/, "");
    const items = inner.length === 0 ? [] : splitTopLevel(inner).map((s) => dq(stripQuotes(s)));
    return items.length === 0 ? "false" : `${c} in (${items.join(", ")})`;
  },
};

/** One PostgREST filter, `op.operand` or negated `not.op.operand`. */
function filterSql(relation, key, value) {
  let negate = false;
  let rest = value;
  if (rest.startsWith("not.")) { negate = true; rest = rest.slice(4); }
  const match = /^([a-z]+)\.(.*)$/s.exec(rest);
  if (!match) throw new SqlError(`ERROR:  the local gateway does not understand the filter "${key}=${value}"`);
  const [, op, operand] = match;
  const build = OPERATORS[op];
  if (!build) throw new SqlError(`ERROR:  the local gateway does not implement the PostgREST operator "${op}" (used on "${key}")`);
  const sql = build(`${ident(relation)}.${ident(key)}`, operand);
  return negate ? `not (${sql})` : sql;
}

function stripQuotes(s) {
  const t = s.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/** Splits on commas that are not inside quotes or parentheses. */
function splitTopLevel(s) {
  const out = [];
  let depth = 0, quoted = false, current = "";
  for (const ch of s) {
    if (ch === '"') { quoted = !quoted; current += ch; continue; }
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && ch === "," && depth === 0) { out.push(current); current = ""; continue; }
    current += ch;
  }
  if (current.trim() !== "") out.push(current);
  return out;
}

function ident(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new SqlError(`ERROR:  unsupported identifier "${name}"`);
  return `"${name}"`;
}

/** Parses a PostgREST `select=` into plain columns and to-one embeds. */
function parseSelect(select, relation) {
  if (!select || select.trim() === "*") return { columns: ["*"], embeds: [] };
  const columns = [];
  const embeds = [];
  for (const part of splitTopLevel(select)) {
    const piece = part.trim();
    // alias:target(cols)  |  target(cols)  |  target!hint(cols)
    // `target` is either a table name or the name of the foreign-key COLUMN
    // on this relation (PostgREST accepts both).
    const embed = /^(?:([a-zA-Z_][a-zA-Z0-9_]*):)?([a-zA-Z_][a-zA-Z0-9_]*)(?:![a-zA-Z0-9_]+)?\s*\((.*)\)$/.exec(piece);
    if (embed) {
      const [, alias, target, inner] = embed;
      let fk = FOREIGN_KEYS.get(`${relation}->${target}`);
      let table = target;
      if (!fk) {
        for (const candidate of FOREIGN_KEYS.values()) {
          if (candidate.child === relation && candidate.childColumn === target) { fk = candidate; table = candidate.parent; break; }
        }
      }
      if (!fk) throw new SqlError(`ERROR:  the local gateway cannot embed "${target}" in "${relation}" (no single-column foreign key between them)`);
      embeds.push({ table, alias: alias ?? table, columns: splitTopLevel(inner).map((c) => c.trim()), fk });
      continue;
    }
    columns.push(piece);
  }
  if (columns.length === 0) columns.push("*");
  return { columns, embeds };
}

function buildSelectList(relation, parsed) {
  const cols = parsed.columns.map((c) => (c === "*" ? `${ident(relation)}.*` : `${ident(relation)}.${ident(c)}`));
  for (const e of parsed.embeds) {
    const innerCols = e.columns.map((c) => ident(c)).join(", ");
    cols.push(
      `(select row_to_json(_e) from (select ${innerCols} from public.${ident(e.table)} ` +
        `where ${ident(e.table)}.${ident(e.fk.parentColumn)} = ${ident(relation)}.${ident(e.fk.childColumn)}) _e) as ${ident(e.alias)}`,
    );
  }
  return cols.join(", ");
}

function buildRestQuery(relation, params) {
  const parsed = parseSelect(params.get("select"), relation);
  const where = [];
  const order = [];
  let limit = null, offset = null;

  for (const [key, value] of params.entries()) {
    if (key === "select") continue;
    if (key === "order") {
      for (const spec of splitTopLevel(value)) {
        const [col, ...mods] = spec.trim().split(".");
        const desc = mods.includes("desc");
        const nulls = mods.includes("nullslast") ? " nulls last" : mods.includes("nullsfirst") ? " nulls first" : "";
        order.push(`${ident(relation)}.${ident(col)} ${desc ? "desc" : "asc"}${nulls}`);
      }
      continue;
    }
    if (key === "limit") { limit = Number(value); continue; }
    if (key === "offset") { offset = Number(value); continue; }
    if (key === "apikey" || key === "columns" || key === "on_conflict") continue;

    where.push(filterSql(relation, key, value));
  }

  let sql = `select ${buildSelectList(relation, parsed)} from public.${ident(relation)}`;
  if (where.length) sql += ` where ${where.join(" and ")}`;
  if (order.length) sql += ` order by ${order.join(", ")}`;
  if (Number.isFinite(limit)) sql += ` limit ${limit}`;
  if (Number.isFinite(offset)) sql += ` offset ${offset}`;
  return sql;
}

async function restSelect(relation, params, claims) {
  const inner = buildRestQuery(relation, params);
  const out = await runSql(asRequest(claims, `select coalesce(json_agg(_t), '[]'::json)::text from (${inner}) _t;`));
  return JSON.parse(out || "[]");
}

/** Builds the WHERE clause shared by GET, PATCH and DELETE. */
function buildWhere(relation, params) {
  const where = [];
  for (const [key, value] of params.entries()) {
    if (["select", "order", "limit", "offset", "apikey", "columns", "on_conflict"].includes(key)) continue;
    where.push(filterSql(relation, key, value));
  }
  return where;
}

async function restInsert(relation, body, params, claims, wantsRepresentation) {
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return [];
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const values = rows
    .map((r) => `(${columns.map((c) => (r[c] === undefined ? "default" : lit(r[c]))).join(", ")})`)
    .join(", ");
  const onConflict = params.get("on_conflict");
  const conflict = onConflict
    ? ` on conflict (${onConflict.split(",").map((c) => ident(c.trim())).join(", ")}) do update set ` +
      columns.filter((c) => !onConflict.split(",").map((s) => s.trim()).includes(c))
        .map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")
    : "";
  const sql =
    `insert into public.${ident(relation)} (${columns.map(ident).join(", ")}) values ${values}${conflict} returning *`;
  if (!wantsRepresentation) {
    await runSql(asRequest(claims, `with _w as (${sql}) select count(*)::text from _w;`));
    return [];
  }
  const out = await runSql(asRequest(claims, `with _w as (${sql}) select coalesce(json_agg(_w), '[]'::json)::text from _w;`));
  return JSON.parse(out || "[]");
}

async function restUpdate(relation, body, params, claims, wantsRepresentation) {
  const sets = Object.keys(body).map((c) => `${ident(c)} = ${lit(body[c])}`);
  if (sets.length === 0) return [];
  const where = buildWhere(relation, params);
  const sql =
    `update public.${ident(relation)} set ${sets.join(", ")}` +
    (where.length ? ` where ${where.join(" and ")}` : "") +
    " returning *";
  const out = await runSql(asRequest(claims, `with _w as (${sql}) select coalesce(json_agg(_w), '[]'::json)::text from _w;`));
  return wantsRepresentation ? JSON.parse(out || "[]") : [];
}

async function restDelete(relation, params, claims, wantsRepresentation) {
  const where = buildWhere(relation, params);
  const sql =
    `delete from public.${ident(relation)}` +
    (where.length ? ` where ${where.join(" and ")}` : "") +
    " returning *";
  const out = await runSql(asRequest(claims, `with _w as (${sql}) select coalesce(json_agg(_w), '[]'::json)::text from _w;`));
  return wantsRepresentation ? JSON.parse(out || "[]") : [];
}

async function restRpc(name, body, claims) {
  const fn = FUNCTIONS.get(name);
  if (!fn) throw new SqlError(`ERROR:  function public.${name} does not exist`);
  // Only the arguments the caller actually sent. PostgREST does the same:
  // an omitted argument takes the function's own DEFAULT. Passing an
  // explicit NULL instead would override that default — which is what broke
  // log_audit_event_as(p_metadata default '{}') — and would also make an
  // omitted-vs-null distinction impossible to test.
  const args = fn.args
    .filter((a) => a.name && Object.prototype.hasOwnProperty.call(body ?? {}, a.name))
    .map((a) => `${a.name} := ${lit(body[a.name], a.type)}`)
    .join(", ");
  const call = `public.${name}(${args})`;

  if (fn.isvoid) {
    await runSql(asRequest(claims, `select ${call};`));
    return null;
  }
  if (fn.retset) {
    const out = await runSql(asRequest(claims, `select coalesce(json_agg(_t), '[]'::json)::text from ${call} _t;`));
    return JSON.parse(out || "[]");
  }
  const out = await runSql(asRequest(claims, `select coalesce(to_json(${call}), 'null')::text;`));
  return JSON.parse(out || "null");
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, prefer, accept, accept-profile, content-profile, " +
    "x-client-info, x-supabase-api-version, range, range-unit, x-upsert",
  "Access-Control-Expose-Headers": "content-range, content-length",
  "Access-Control-Max-Age": "86400",
};

function send(res, status, payload, extraHeaders = {}) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...CORS,
    ...extraHeaders,
  });
  res.end(body);
}

function sendSqlError(res, e) {
  if (process.env.GATEWAY_LOG !== "0") console.log(`[gateway]   -> ${e.sqlstate}: ${e.message}`);
  const status = e.sqlstate === "42501" ? 403 : 400;
  send(res, status, { message: e.message, code: e.sqlstate, details: null, hint: null });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 8 * 1024 * 1024) reject(new Error("body too large"));
    });
    req.on("end", () => {
      if (data.trim() === "") return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function claimsFor(req) {
  const auth = req.headers.authorization ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const fromToken = token ? verifyJwt(token) : null;
  if (fromToken && !fromToken.expired) return fromToken;
  const apikey = req.headers.apikey ? verifyJwt(String(req.headers.apikey)) : null;
  if (apikey && !apikey.expired) return apikey;
  return { role: "anon" };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (process.env.GATEWAY_LOG !== "0" && req.method !== "OPTIONS") {
    console.log(`[gateway] ${req.method} ${req.url}`);
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  try {
    // --- health -----------------------------------------------------------
    if (path === "/" || path === "/health") {
      return send(res, 200, { gateway: "ninth-round-local", database: DB, functions: FUNCTIONS.size });
    }

    // --- auth -------------------------------------------------------------
    if (path === "/auth/v1/settings") {
      return send(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true, autoconfirm: true });
    }
    if (path === "/auth/v1/health") return send(res, 200, { name: "ninth-round-local-gateway", version: "0" });

    if (path === "/auth/v1/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type") ?? "password";
      const body = await readBody(req);

      if (grant === "password") {
        const email = String(body.email ?? "");
        const row = await findUserByEmail(email);
        if (!row) {
          return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", message: "Invalid login credentials" });
        }
        const [, salt] = String(row.encrypted_password).split("$");
        if (hashPassword(String(body.password ?? ""), salt) !== row.encrypted_password) {
          return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", message: "Invalid login credentials" });
        }
        return send(res, 200, makeSession(row));
      }

      if (grant === "refresh_token") {
        const id = String(body.refresh_token ?? "").replace(/^local-refresh-/, "");
        const row = await findUserById(id);
        if (!row) {
          return send(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token", message: "Invalid Refresh Token" });
        }
        return send(res, 200, makeSession(row));
      }
      return send(res, 400, { error: "unsupported_grant_type", message: `the local gateway does not implement grant_type=${grant}` });
    }

    if (path === "/auth/v1/user") {
      const claims = claimsFor(req);
      if (!claims.sub) return send(res, 401, { message: "invalid claim: missing sub claim" });
      const row = await findUserById(claims.sub);
      if (!row) return send(res, 401, { message: "User from sub claim in JWT does not exist" });
      if (req.method === "GET") return send(res, 200, publicUser(row));
      if (req.method === "PUT") return send(res, 200, publicUser(row));
    }

    if (path === "/auth/v1/logout" && req.method === "POST") {
      res.writeHead(204, CORS);
      return res.end();
    }

    if (path === "/auth/v1/recover" && req.method === "POST") return send(res, 200, {});

    // --- rest -------------------------------------------------------------
    if (path.startsWith("/rest/v1/rpc/") && req.method === "POST") {
      const name = path.slice("/rest/v1/rpc/".length);
      const body = await readBody(req);
      const data = await restRpc(name, body, claimsFor(req));
      // `.single()` sends Accept: application/vnd.pgrst.object+json, and real
      // PostgREST then returns ONE object (or 406 for zero / many rows) for a
      // set-returning function too — not an array.
      if (Array.isArray(data) && String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json")) {
        if (data.length === 1) return send(res, 200, data[0]);
        return send(res, 406, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: `Results contain ${data.length} rows`, hint: null });
      }
      return send(res, 200, data);
    }

    if (path.startsWith("/rest/v1/")) {
      const relation = path.slice("/rest/v1/".length);
      if (req.method === "GET" || req.method === "HEAD") {
        const rows = await restSelect(relation, url.searchParams, claimsFor(req));
        const wantsObject = String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
        if (wantsObject) {
          if (rows.length === 1) return send(res, 200, rows[0]);
          return send(res, 406, {
            message: `JSON object requested, multiple (or no) rows returned`,
            code: "PGRST116",
            details: `Results contain ${rows.length} rows`,
            hint: null,
          });
        }
        return send(res, 200, rows, { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      }
      const prefer = String(req.headers.prefer ?? "");
      const wantsRepresentation = prefer.includes("return=representation");
      const wantsObject = String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
      let rows;
      if (req.method === "POST") rows = await restInsert(relation, await readBody(req), url.searchParams, claimsFor(req), wantsRepresentation || wantsObject);
      else if (req.method === "PATCH" || req.method === "PUT") rows = await restUpdate(relation, await readBody(req), url.searchParams, claimsFor(req), wantsRepresentation || wantsObject);
      else if (req.method === "DELETE") rows = await restDelete(relation, url.searchParams, claimsFor(req), wantsRepresentation || wantsObject);
      else return send(res, 405, { message: `the local gateway does not implement ${req.method} on a relation` });

      if (!wantsRepresentation && !wantsObject) {
        res.writeHead(204, CORS);
        return res.end();
      }
      if (wantsObject) {
        if (rows.length === 1) return send(res, 201, rows[0]);
        return send(res, 406, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: `Results contain ${rows.length} rows`, hint: null });
      }
      return send(res, 201, rows);
    }

    return send(res, 404, { message: `the local gateway has no route for ${req.method} ${path}` });
  } catch (e) {
    if (e instanceof SqlError) return sendSqlError(res, e);
    console.error("[gateway]", e);
    return send(res, 500, { message: String(e?.message ?? e) });
  }
});

await loadCatalog();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[gateway] listening on http://127.0.0.1:${PORT}  (database: ${DB})`);
  console.log(`[gateway] NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${PORT}`);
  console.log(`[gateway] NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`);
  console.log(`[gateway] SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`);
});
