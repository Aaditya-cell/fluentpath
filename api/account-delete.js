import { getPublicSupabaseConfig, getSupabaseSecretConfig } from '../lib/config.js';
import { sendJson } from '../lib/http.js';

function recentAuthTime(accessToken){
  const segments=accessToken.split('.');
  if(segments.length!==3)return false;
  try{
    const claims=JSON.parse(Buffer.from(segments[1],'base64url').toString('utf8'));
    const authTime=Number(claims.auth_time);
    const now=Math.floor(Date.now()/1000);
    return Number.isFinite(authTime)&&authTime<=now+30&&now-authTime<=300;
  }catch{return false}
}

export default async function accountDelete(request,response){
  if(request.method!=='POST'){
    response.setHeader('Allow','POST');
    return sendJson(response,405,{error:'The account deletion endpoint accepts POST requests only.'});
  }
  const supabase=getPublicSupabaseConfig();
  const secret=getSupabaseSecretConfig();
  if(!supabase.url||!supabase.publishableKey||!secret.key)return sendJson(response,503,{error:'Secure account deletion is not configured. Please contact the project owner.'});
  const authorization=request.headers?.authorization||request.headers?.Authorization||'';
  const match=typeof authorization==='string'&&authorization.match(/^Bearer\s+(.+)$/i);
  if(!match)return sendJson(response,401,{error:'Sign in again to confirm account deletion.'});
  const accessToken=match[1];
  try{
    const verification=await fetch(`${supabase.url.replace(/\/$/,'')}/auth/v1/user`,{
      method:'GET',
      headers:{apikey:supabase.publishableKey,Authorization:`Bearer ${accessToken}`},
      signal:AbortSignal.timeout(1500)
    });
    if(verification.status===401||verification.status===403)return sendJson(response,401,{error:'Your sign-in has expired. Sign in again before deleting your account.'});
    if(!verification.ok)return sendJson(response,503,{error:'Your sign-in could not be verified. Please try again shortly.'});
    const user=await verification.json().catch(()=>null);
    if(!user?.id)return sendJson(response,401,{error:'Your sign-in could not be verified. Sign in again before deleting your account.'});
    if(!recentAuthTime(accessToken))return sendJson(response,401,{error:'For your security, sign in again with your password before deleting your account.'});

    const adminHeaders={apikey:secret.key};
    if(secret.legacy)adminHeaders.Authorization=`Bearer ${secret.key}`;
    const deletion=await fetch(`${supabase.url.replace(/\/$/,'')}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,{
      method:'DELETE',
      headers:adminHeaders,
      signal:AbortSignal.timeout(3000)
    });
    if(!deletion.ok)return sendJson(response,502,{error:'Supabase could not delete the account. Check the server setup or contact support.'});
    return sendJson(response,200,{ok:true});
  }catch(error){
    if(error.name==='TimeoutError'||error.name==='AbortError')return sendJson(response,504,{error:'Account deletion timed out. Check the account status before retrying.'});
    return sendJson(response,503,{error:'Account deletion could not reach Supabase. Please try again shortly.'});
  }
}
