import { getGeminiApiKey, getPublicSupabaseConfig, requireAuthForAiFeedback } from '../lib/config.js';
import { sendJson } from '../lib/http.js';

export default function health(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow','GET');
    return sendJson(response,405,{error:'The health endpoint accepts GET requests only.'});
  }
  const supabase=getPublicSupabaseConfig();
  return sendJson(response,200,{ok:true,service:'FluentPath',geminiConfigured:Boolean(getGeminiApiKey()),supabaseConfigured:Boolean(supabase.url&&supabase.publishableKey),requireAuthForAiFeedback:requireAuthForAiFeedback()});
}
