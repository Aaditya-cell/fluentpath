import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPublicSupabaseConfig, getSupabaseSecretConfig } from '../lib/config.js';

const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'];
function configure(t,values){
  const previous=new Map(keys.map(key=>[key,process.env[key]]));
  for(const key of keys){if(Object.hasOwn(values,key))process.env[key]=values[key];else delete process.env[key]}
  t.after(()=>{for(const [key,value] of previous){if(value===undefined)delete process.env[key];else process.env[key]=value}});
}

test('only exposes known public Supabase key formats over a safe project URL',async t=>{
  await t.test('accepts a publishable key over HTTPS',t=>{
    configure(t,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_demo'});
    assert.deepEqual(getPublicSupabaseConfig(),{url:'https://project.supabase.co',publishableKey:'sb_publishable_demo'});
  });
  await t.test('rejects a Supabase secret key',t=>{
    configure(t,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_secret_demo'});
    assert.deepEqual(getPublicSupabaseConfig(),{url:'',publishableKey:''});
  });
  await t.test('rejects a legacy service-role JWT',t=>{
    const payload=Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url');
    configure(t,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:`header.${payload}.signature`});
    assert.deepEqual(getPublicSupabaseConfig(),{url:'',publishableKey:''});
  });
  await t.test('recognizes a server-only secret key',t=>{
    configure(t,{SUPABASE_SECRET_KEY:'sb_secret_demo'});
    assert.deepEqual(getSupabaseSecretConfig(),{key:'sb_secret_demo',legacy:false});
  });
  await t.test('recognizes a legacy service-role JWT only as a server key',t=>{
    const payload=Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url');
    const legacy=`header.${payload}.signature`;
    configure(t,{SUPABASE_SERVICE_ROLE_KEY:legacy});
    assert.deepEqual(getSupabaseSecretConfig(),{key:legacy,legacy:true});
    assert.deepEqual(getPublicSupabaseConfig(),{url:'',publishableKey:''});
  });
  await t.test('accepts a legacy anon JWT',t=>{
    const payload=Buffer.from(JSON.stringify({role:'anon'})).toString('base64url');
    configure(t,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:`header.${payload}.signature`});
    assert.deepEqual(getPublicSupabaseConfig(),{url:'https://project.supabase.co',publishableKey:`header.${payload}.signature`});
  });
  await t.test('rejects insecure remote URLs but permits a local self-hosted URL',t=>{
    configure(t,{SUPABASE_URL:'http://project.example',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_demo'});
    assert.deepEqual(getPublicSupabaseConfig(),{url:'',publishableKey:''});
    process.env.SUPABASE_URL='http://127.0.0.1:54321';
    assert.equal(getPublicSupabaseConfig().url,'http://127.0.0.1:54321');
  });
});
