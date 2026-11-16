import assert from 'node:assert/strict';
import { test } from 'node:test';
import feedbackRoute from '../api/feedback.js';
import configRoute from '../api/config.js';
import healthRoute from '../api/health.js';
import accountDeleteRoute from '../api/account-delete.js';

function responseRecorder(){
  return{
    status:null,
    headers:{},
    body:null,
    setHeader(name,value){this.headers[name]=value},
    writeHead(status,headers){this.status=status;Object.assign(this.headers,headers)},
    end(body){this.body=body}
  };
}

test('Vercel routes reject unsupported HTTP methods with an Allow header',async()=>{
  const feedback=responseRecorder();
  const config=responseRecorder();
  const health=responseRecorder();
  const accountDelete=responseRecorder();
  await feedbackRoute({method:'GET'},feedback);
  configRoute({method:'POST'},config);
  healthRoute({method:'POST'},health);
  await accountDeleteRoute({method:'GET'},accountDelete);
  assert.equal(feedback.status,405);
  assert.equal(feedback.headers.Allow,'POST');
  assert.equal(config.status,405);
  assert.equal(config.headers.Allow,'GET');
  assert.equal(health.status,405);
  assert.equal(health.headers.Allow,'GET');
  assert.equal(accountDelete.status,405);
  assert.equal(accountDelete.headers.Allow,'POST');
});

test('public config and health routes never return the Gemini secret',()=>{
  const keys=['GEMINI_API_KEY','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','REQUIRE_AUTH_FOR_AI'];
  const previous=new Map(keys.map(key=>[key,process.env[key]]));
  process.env.GEMINI_API_KEY='test-only-secret';
  process.env.SUPABASE_URL='https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  process.env.SUPABASE_SECRET_KEY='sb_secret_test';
  process.env.REQUIRE_AUTH_FOR_AI='true';
  try{
    const config=responseRecorder();
    const health=responseRecorder();
    configRoute({method:'GET'},config);
    healthRoute({method:'GET'},health);
    const publicConfig=JSON.parse(config.body);
    const publicHealth=JSON.parse(health.body);
    assert.equal(publicConfig.supabaseConfigured,true);
    assert.equal(publicConfig.supabaseAdminConfigured,true);
    assert.equal(publicConfig.requireAuthForAiFeedback,true);
    assert.equal(Object.hasOwn(publicConfig,'geminiApiKey'),false);
    assert.equal(Object.hasOwn(publicConfig,'supabaseSecretKey'),false);
    assert.equal(publicHealth.geminiConfigured,true);
    assert.equal(Object.hasOwn(publicHealth,'geminiApiKey'),false);
  }finally{
    for(const [key,value] of previous){if(value===undefined)delete process.env[key];else process.env[key]=value}
  }
});

function makeAccessToken(authTime=Math.floor(Date.now()/1000)){
  const payload=Buffer.from(JSON.stringify({auth_time:authTime,sub:'untrusted-claimed-id'})).toString('base64url');
  return `header.${payload}.signature`;
}
function jsonResponse(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}

test('account deletion verifies the fresh caller and deletes only that Supabase user',async t=>{
  const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const previous=new Map(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  t.after(()=>{
    globalThis.fetch=originalFetch;
    for(const [key,value] of previous){if(value===undefined)delete process.env[key];else process.env[key]=value}
  });
  process.env.SUPABASE_URL='https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  process.env.SUPABASE_SECRET_KEY='sb_secret_test';
  let deleteRequest;
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('/auth/v1/user'))return jsonResponse({id:'verified-learner-id'});
    deleteRequest={url:String(url),options};
    return jsonResponse({});
  };
  const response=responseRecorder();
  await accountDeleteRoute({method:'POST',headers:{authorization:`Bearer ${makeAccessToken()}`},body:{userId:'attacker-selected-id'}},response);
  assert.equal(response.status,200);
  assert.equal(JSON.parse(response.body).ok,true);
  assert.equal(deleteRequest.url.endsWith('/auth/v1/admin/users/verified-learner-id'),true);
  assert.equal(deleteRequest.options.method,'DELETE');
  assert.equal(deleteRequest.options.headers.apikey,'sb_secret_test');
  assert.equal(Object.hasOwn(deleteRequest.options.headers,'Authorization'),false);
});

test('account deletion requires recent authentication and a configured admin key',async t=>{
  const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const previous=new Map(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  t.after(()=>{
    globalThis.fetch=originalFetch;
    for(const [key,value] of previous){if(value===undefined)delete process.env[key];else process.env[key]=value}
  });
  process.env.SUPABASE_URL='https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  process.env.SUPABASE_SECRET_KEY='sb_secret_test';
  let calls=0;
  globalThis.fetch=async()=>{calls++;return jsonResponse({id:'verified-learner-id'})};
  const stale=responseRecorder();
  await accountDeleteRoute({method:'POST',headers:{authorization:`Bearer ${makeAccessToken(Math.floor(Date.now()/1000)-301)}`}},stale);
  assert.equal(stale.status,401);
  assert.equal(calls,1);

  delete process.env.SUPABASE_SECRET_KEY;
  const unavailable=responseRecorder();
  await accountDeleteRoute({method:'POST',headers:{authorization:`Bearer ${makeAccessToken()}`}},unavailable);
  assert.equal(unavailable.status,503);
  assert.equal(calls,1);
});

test('legacy service-role deletion uses its JWT bearer header only on the server call',async t=>{
  const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const previous=new Map(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  t.after(()=>{
    globalThis.fetch=originalFetch;
    for(const [key,value] of previous){if(value===undefined)delete process.env[key];else process.env[key]=value}
  });
  const jwt=role=>`header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
  const serviceRole=jwt('service_role');
  process.env.SUPABASE_URL='https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY=jwt('anon');
  process.env.SUPABASE_SERVICE_ROLE_KEY=serviceRole;
  let adminHeaders;
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('/auth/v1/user'))return jsonResponse({id:'verified-learner-id'});
    adminHeaders=options.headers;
    return jsonResponse({});
  };
  const response=responseRecorder();
  await accountDeleteRoute({method:'POST',headers:{authorization:`Bearer ${makeAccessToken()}`}},response);
  assert.equal(response.status,200);
  assert.equal(adminHeaders.apikey,serviceRole);
  assert.equal(adminHeaders.Authorization,`Bearer ${serviceRole}`);
});
