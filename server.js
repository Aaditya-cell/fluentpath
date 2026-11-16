import { getGeminiApiKey as geminiApiKey, getPublicSupabaseConfig as publicSupabaseConfig, getSupabaseSecretConfig, requireAuthForAiFeedback } from './lib/config.js';
import { sendJson } from './lib/http.js';
import { handleFeedback } from './lib/feedback.js';
import accountDelete from './api/account-delete.js';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicFiles = new Set(['index.html','styles.css','accessibility.css','app.js','data/practice-bank.json','data/extended-practice-bank.json']);

async function loadLocalEnv() {
  try {
    const raw = await readFile(path.join(root, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const mimeTypes = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!publicFiles.has(relative)) {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Not found');
    return;
  }
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep) && target !== root) return sendJson(res, 403, {error:'Forbidden.'});
  try {
    const fileStat = await stat(target);
    if (!fileStat.isFile()) throw Object.assign(new Error('Not found'), {code:'ENOENT'});
    const content = await readFile(target);
    res.writeHead(200, {'Content-Type':mimeTypes[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(content);
  } catch {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Not found');
  }
}

await loadLocalEnv();
const server = http.createServer((req,res) => {
  const requestPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname.replace(/\/+$/, '') || '/';
  if (requestPath === '/api/config') {
    if (req.method !== 'GET') {
      res.setHeader('Allow','GET');
      return sendJson(res,405,{error:'The configuration endpoint accepts GET requests only.'});
    }
    const supabase = publicSupabaseConfig();
    const admin=getSupabaseSecretConfig();
    return sendJson(res,200,{supabaseUrl:supabase.url,supabasePublishableKey:supabase.publishableKey,supabaseConfigured:Boolean(supabase.url && supabase.publishableKey),supabaseAdminConfigured:Boolean(admin.key),requireAuthForAiFeedback:requireAuthForAiFeedback()});
  }
  if (req.method === 'GET' && requestPath === '/api/health') {
    return sendJson(res,200,{ok:true,service:'FluentPath',geminiConfigured:Boolean(geminiApiKey()),supabaseConfigured:(()=>{const config=publicSupabaseConfig();return Boolean(config.url&&config.publishableKey)})(),requireAuthForAiFeedback:requireAuthForAiFeedback()});
  }
  if (requestPath === '/api/feedback') {
    if (req.method === 'POST') return handleFeedback(req,res);
    res.setHeader('Allow','POST');
    return sendJson(res,405,{error:'The feedback endpoint accepts POST requests only.'});
  }
  if (requestPath === '/api/account-delete') return accountDelete(req,res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res,405,{error:'Method not allowed.'});
  return serveStatic(req,res);
});
const port = Number(process.env.PORT || 8001);
server.listen(port, '127.0.0.1', () => console.log(`FluentPath is running at http://localhost:${port}`));
