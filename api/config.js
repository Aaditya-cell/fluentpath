import { getPublicSupabaseConfig, getSupabaseSecretConfig, requireAuthForAiFeedback } from '../lib/config.js';
import { sendJson } from '../lib/http.js';

export default function config(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow','GET');
    return sendJson(response,405,{error:'The configuration endpoint accepts GET requests only.'});
  }
  const supabase=getPublicSupabaseConfig();
  const admin=getSupabaseSecretConfig();
  return sendJson(response,200,{supabaseUrl:supabase.url,supabasePublishableKey:supabase.publishableKey,supabaseConfigured:Boolean(supabase.url&&supabase.publishableKey),supabaseAdminConfigured:Boolean(admin.key),requireAuthForAiFeedback:requireAuthForAiFeedback()});
}
