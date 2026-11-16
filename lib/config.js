export function getGeminiApiKey() {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return !key || key === 'your_gemini_api_key_here' ? '' : key;
}

export function getPublicSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !publishableKey || publishableKey === 'your_supabase_publishable_key_here') return {url:'',publishableKey:''};
  if (!isPublicSupabaseKey(publishableKey)) return {url:'',publishableKey:''};
  try {
    const parsed = new URL(url);
    const localHost=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
    if ((parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&localHost))||parsed.username||parsed.password||parsed.search||parsed.hash) return {url:'',publishableKey:''};
  } catch { return {url:'',publishableKey:''}; }
  return {url,publishableKey};
}

export function getSupabaseSecretConfig() {
  const key=(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key||key==='your_supabase_secret_key_here'||key==='your_supabase_service_role_key_here')return{key:'',legacy:false};
  if(key.startsWith('sb_secret_'))return{key,legacy:false};
  if(key.startsWith('sb_publishable_'))return{key:'',legacy:false};
  return jwtRole(key)==='service_role'?{key,legacy:true}:{key:'',legacy:false};
}

function isPublicSupabaseKey(key) {
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;
  return jwtRole(key)==='anon';
}

function jwtRole(key) {
  const segments=key.split('.');
  if(segments.length!==3)return'';
  try{return JSON.parse(Buffer.from(segments[1],'base64url').toString('utf8')).role||''}catch{return''}
}

export function requireAuthForAiFeedback() {
  return (process.env.REQUIRE_AUTH_FOR_AI || '').trim().toLowerCase() === 'true';
}
