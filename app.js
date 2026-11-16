let taskData = {};
let prompts = {};
let activeTask = null;
let taskRotationMemory = {};
let activeExam = 'IELTS';
let taskTimerInterval=null,taskTimerDuration=0,taskTimerRemaining=0;
const skillVisuals = {
  Listening:{icon:'◖',color:'#e5f4ee',desc:'Train your ear for key details'},
  Reading:{icon:'▤',color:'#e9edff',desc:'Build speed and understanding'},
  Writing:{icon:'✎',color:'#fff0e5',desc:'Organise ideas with confidence'},
  Speaking:{icon:'◌',color:'#f1eafd',desc:'Practise fluency and clear delivery'}
};
async function loadPracticeBank() {
  const responses = await Promise.all([
    fetch('/data/practice-bank.json', {cache:'no-store'}),
    fetch('/data/extended-practice-bank.json', {cache:'no-store'})
  ]);
  if (responses.some(response=>!response.ok)) throw new Error('Practice content could not be loaded.');
  const [bank,extension] = await Promise.all(responses.map(response=>response.json()));
  const allTasks=[...bank.tasks,...extension.tasks];
  const taskCount=document.getElementById('practice-task-count');
  if(taskCount)taskCount.textContent=allTasks.length.toLocaleString();
  for (const examKey of ['IELTS','PTE']) {
    const examName = examKey === 'IELTS' ? 'IELTS Academic' : 'PTE Academic';
    const tasks = allTasks.filter(task => task.exam === examName);
    taskData[examKey] = {};
    prompts[examKey] = {};
    for (const task of tasks) {
      const visual = skillVisuals[task.skill];
      if (!taskData[examKey][task.skill]) {
        taskData[examKey][task.skill] = {skill:task.skill,icon:visual.icon,color:visual.color,desc:visual.desc};
        prompts[examKey][task.skill] = [];
      }
      const duration = task.suggestedTimeMinutes ? task.suggestedTimeMinutes + ' min' : Math.max(1,Math.round((task.suggestedResponseSeconds || 60) / 60)) + ' min';
      let hint = task.instructions;
      if (task.minimumWords && task.maximumWords) hint += ' Write ' + task.minimumWords + '–' + task.maximumWords + ' words.';
      else if (task.minimumWords) hint += ' Write at least ' + task.minimumWords + ' words.';
      prompts[examKey][task.skill].push({
        id:task.id,skill:task.skill,title:task.title,format:task.format,description:task.instructions,
        prompt:task.prompt || '',hint,time:duration,passage:task.passage,diagram:task.diagram,chart:task.chart,
        script:task.audioScript,
        questions:task.questions?.map(q=>({...q,answer:q.answerIndex}))||null
      });
    }
  }
}
function showContentLoadError() {
  const message = '<div class="content-load-error"><b>Practice content did not load.</b><p>Restart the FluentPath server from this project folder and refresh the page.</p></div>';
  document.querySelectorAll('.skill-grid').forEach(grid => {grid.innerHTML = message;});
}
const guestAttemptStorageKey = 'fluentpath.attempts.v1';
let cloudClient=null,cloudUser=null,cloudSyncState='Guest mode',passwordRecoveryPending=false,requireAuthForAiFeedback=false,accountDeletionEnabled=false;
function accountAttemptStorageKey(userId=cloudUser?.id){return userId?`fluentpath.account.attempts.v1.${userId}`:guestAttemptStorageKey}
function createAttemptId(){return window.crypto?.randomUUID?window.crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)})}
function readStoredAttempts(key){try{const items=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(items))return[];let changed=false;const normalized=items.map(item=>{if(item&&typeof item==='object'&&!item.id){changed=true;return{...item,id:createAttemptId()}}return item}).filter(item=>item&&typeof item==='object');if(changed)localStorage.setItem(key,JSON.stringify(normalized.slice(-50)));return normalized}catch{return[]}}
function writeStoredAttempts(key,attempts){try{localStorage.setItem(key,JSON.stringify(attempts.slice(-50)));return true}catch{return false}}
function readAttempts(){return readStoredAttempts(accountAttemptStorageKey())}
function saveAttempt(attempt){
  try{
    const item={...attempt,id:attempt.id||createAttemptId()};
    const attempts=readAttempts();attempts.push(item);writeStoredAttempts(accountAttemptStorageKey(),attempts);
    renderWeeklyRhythm();
    if(document.getElementById('progress-view').classList.contains('active-view'))renderProgress();
    if(cloudClient&&cloudUser)void syncAttemptToAccount(item,cloudUser.id);
  }catch{/* Keep the practice flow usable if browser storage is disabled. */}
}
function renderWeeklyRhythm() {
  const daysHost=document.getElementById('week-days'),dotsHost=document.getElementById('weekly-dots');
  if(!daysHost||!dotsHost)return;
  const activeDays=new Set(readAttempts().map(attempt=>new Date(attempt.completedAt).toDateString()));
  daysHost.replaceChildren();dotsHost.replaceChildren();
  for(let offset=6;offset>=0;offset--){const day=new Date();day.setDate(day.getDate()-offset);const label=document.createElement('span');label.textContent=day.toLocaleDateString(undefined,{weekday:'narrow'});daysHost.append(label);const dot=document.createElement('i');const complete=activeDays.has(day.toDateString());if(complete)dot.classList.add('done');dot.title=day.toLocaleDateString()+(complete?' · practiced':' · no session');dotsHost.append(dot)}
}
function renderProgress() {
  const host = document.getElementById('progress-dashboard');
  const attempts = readAttempts().sort((a,b)=>b.completedAt.localeCompare(a.completedAt));
  if (!attempts.length) {
    host.innerHTML = '<div class="empty-progress"><div class="empty-icon">↗</div><h2>Your progress starts with one session</h2><p>Complete a practice task and your recent activity will appear here. Attempts stay in this browser.</p><button class="primary-button" id="start-first-practice">Explore practice <span>→</span></button></div>';
    document.getElementById('start-first-practice').addEventListener('click',()=>navigate('practice'));
    return;
  }
  const ieltsCount = attempts.filter(a=>a.exam==='IELTS').length;
  const pteCount = attempts.filter(a=>a.exam==='PTE').length;
  const objective = attempts.filter(a=>Number.isInteger(a.correct)&&Number.isInteger(a.total));
  const correct = objective.reduce((sum,a)=>sum+a.correct,0);
  const total = objective.reduce((sum,a)=>sum+a.total,0);
  host.innerHTML = '<div class="progress-stats"></div><section class="recent-card"><div class="section-kicker">RECENT SESSIONS</div><div class="attempt-list"></div></section><p class="progress-storage-note" id="progress-storage-note"></p>';
  document.getElementById('progress-storage-note').textContent=cloudUser?cloudSyncState+' · Attempt details sync to your account.': 'Guest progress is saved only in this browser on this device.';
  const stats = host.querySelector('.progress-stats');
  const statData = [['Recent sessions',String(attempts.length)],['IELTS',String(ieltsCount)],['PTE Academic',String(pteCount)],['Objective answers',total?correct+' / '+total:'—']];
  for (const [label,value] of statData) {const card=document.createElement('div');card.className='progress-stat';const number=document.createElement('b');number.textContent=value;const caption=document.createElement('span');caption.textContent=label;card.append(number,caption);stats.append(card)}
  const list = host.querySelector('.attempt-list');
  for (const attempt of attempts.slice(0,12)) {
    const row=document.createElement('article');row.className='attempt-row';
    const main=document.createElement('div');main.className='attempt-main';
    const title=document.createElement('b');title.textContent=attempt.title;
    const detail=document.createElement('span');detail.textContent=attempt.exam==='IELTS'?'IELTS Academic · '+attempt.skill:'PTE Academic · '+attempt.skill;
    main.append(title,detail);row.append(main);
    const result=document.createElement('span');result.className='attempt-result';result.textContent=Number.isInteger(attempt.correct)?attempt.correct+'/'+attempt.total:'Feedback reviewed';row.append(result);
    const date=document.createElement('time');date.className='attempt-date';date.dateTime=attempt.completedAt;date.textContent=new Date(attempt.completedAt).toLocaleDateString();row.append(date);list.append(row);
  }
}
function setAccountMessage(message,kind=''){const host=document.getElementById('account-message');if(!host)return;host.textContent=message;host.dataset.kind=kind}
function updateAccountUI(){
  const signedIn=Boolean(cloudUser),profileName=document.getElementById('profile-name'),profileNote=document.getElementById('profile-note'),avatar=document.getElementById('profile-avatar'),accountButton=document.getElementById('account-button');
  if(profileName)profileName.textContent=signedIn?(cloudUser.email||'Learner'):'Guest learner';
  if(profileNote)profileNote.textContent=signedIn?cloudSyncState:'Saved on this device';
  if(avatar)avatar.textContent=signedIn?(cloudUser.email||'L').trim().charAt(0).toUpperCase():'G';
  if(accountButton)accountButton.textContent=signedIn?'Account':'Sign in';
  const recovery=passwordRecoveryPending;
  const visibility={
    'account-sign-in':signedIn||recovery,
    'account-create':signedIn||recovery,
    'account-reset':signedIn||recovery,
    'account-update-password':!recovery,
    'account-import':!signedIn||recovery||readStoredAttempts(guestAttemptStorageKey).length===0,
    'account-delete-progress':!signedIn||recovery,
    'account-delete-account':!signedIn||recovery||!accountDeletionEnabled,
    'account-clear-guest':signedIn||recovery||readStoredAttempts(guestAttemptStorageKey).length===0,
    'account-sign-out':!signedIn||recovery
  };
  for(const [id,hidden] of Object.entries(visibility)){const node=document.getElementById(id);if(node)node.hidden=hidden}
  for(const id of ['account-sign-in','account-create','account-reset','account-update-password']){const node=document.getElementById(id);if(node)node.disabled=!cloudClient}
  const title=document.getElementById('account-title');if(title)title.textContent=recovery?'Set a new password':signedIn?'Your account':'Save your progress';
  const password=document.getElementById('account-password');if(password)password.autocomplete=recovery?'new-password':'current-password';
}
function cloudAttemptRow(attempt,userId){return{id:attempt.id||createAttemptId(),user_id:userId,exam:attempt.exam,skill:attempt.skill,title:String(attempt.title||'Practice session').slice(0,180),completed_at:attempt.completedAt,correct:Number.isInteger(attempt.correct)?attempt.correct:null,total:Number.isInteger(attempt.total)?attempt.total:null,attempt_type:attempt.type}}
function attemptFromCloud(row){return{id:row.id,exam:row.exam,skill:row.skill,title:row.title,completedAt:row.completed_at,correct:row.correct??undefined,total:row.total??undefined,type:row.attempt_type}}
async function loadAccountAttempts(user){
  const storageKey=accountAttemptStorageKey(user.id);
  try{
    const local=readStoredAttempts(storageKey);
    if(local.length){const {error}=await cloudClient.from('practice_attempts').upsert(local.map(item=>cloudAttemptRow(item,user.id)),{onConflict:'id',ignoreDuplicates:true});if(error)throw error}
    const {data,error}=await cloudClient.from('practice_attempts').select('id,exam,skill,title,completed_at,correct,total,attempt_type').eq('user_id',user.id).order('completed_at',{ascending:false}).limit(50);
    if(error)throw error;
    const merged=new Map();for(const item of local)merged.set(item.id,item);for(const row of data||[]){const item=attemptFromCloud(row);merged.set(item.id,item)}
    const attempts=[...merged.values()].sort((a,b)=>a.completedAt.localeCompare(b.completedAt)).slice(-50);
    writeStoredAttempts(storageKey,attempts);cloudSyncState='Account synced';
  }catch{cloudSyncState='Saved here · account sync needs setup'}
  if(cloudUser?.id===user.id){updateAccountUI();renderWeeklyRhythm();if(document.getElementById('progress-view').classList.contains('active-view'))renderProgress()}
}
async function syncAttemptToAccount(attempt,userId){
  if(!cloudClient||cloudUser?.id!==userId)return;
  try{const {error}=await cloudClient.from('practice_attempts').upsert(cloudAttemptRow(attempt,userId),{onConflict:'id',ignoreDuplicates:true});if(error)throw error;cloudSyncState='Account synced'}catch{cloudSyncState='Saved here · account sync needs setup'}
  if(cloudUser?.id===userId){updateAccountUI();if(document.getElementById('progress-view').classList.contains('active-view'))renderProgress()}
}
async function applyAuthSession(user){
  if((user?.id||null)===(cloudUser?.id||null))return;
  cloudUser=user||null;cloudSyncState=cloudUser?'Syncing account…':'Guest mode';updateAccountUI();renderWeeklyRhythm();
  if(cloudUser)await loadAccountAttempts(cloudUser);
  else if(document.getElementById('progress-view').classList.contains('active-view'))renderProgress();
}
async function initializeAccounts(){
  try{
    const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw new Error('Account setup could not be read.');
    const config=await response.json();requireAuthForAiFeedback=Boolean(config.requireAuthForAiFeedback);accountDeletionEnabled=Boolean(config.supabaseAdminConfigured);if(!config.supabaseConfigured){updateAccountUI();return}
    if(!window.supabase?.createClient){const sdkLoaded=await loadSupabaseSdk();if(!sdkLoaded){cloudSyncState='Account library did not load';updateAccountUI();return}}
    cloudClient=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    cloudClient.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{if(event==='PASSWORD_RECOVERY'){passwordRecoveryPending=true;setAccountMessage('Choose a new password for your account.','success');const dialog=document.getElementById('account-dialog');if(!dialog.open)dialog.showModal();updateAccountUI()}void applyAuthSession(session?.user||null)},0)});
    const {data,error}=await cloudClient.auth.getSession();if(error)throw error;await applyAuthSession(data.session?.user||null);updateAccountUI();
  }catch{cloudSyncState='Account setup unavailable';updateAccountUI()}
}
function loadSupabaseSdk(){return new Promise(resolve=>{let settled=false;const finish=loaded=>{if(settled)return;settled=true;clearTimeout(timer);resolve(Boolean(loaded&&window.supabase?.createClient))};const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';script.async=true;script.onload=()=>finish(true);script.onerror=()=>finish(false);const timer=setTimeout(()=>finish(false),7000);document.head.append(script)})}
async function performAccountAction(action){
  if(!cloudClient){setAccountMessage('Account sync is not configured. Follow ACCOUNT_SETUP.md, then restart the project.');return}
  const email=document.getElementById('account-email'),password=document.getElementById('account-password');
  password.autocomplete=action==='create'||action==='update-password'?'new-password':'current-password';
  if(!email.reportValidity())return;if(action!=='reset'&&!password.reportValidity())return;
  if((action==='create'||action==='update-password')&&password.value.length<8){setAccountMessage('Use at least 8 characters for a new password.','error');return}
  const buttons=['account-sign-in','account-create','account-reset','account-update-password'];buttons.forEach(id=>{document.getElementById(id).disabled=true});
  try{
    if(action==='create'){
      const {data,error}=await cloudClient.auth.signUp({email:email.value.trim(),password:password.value,options:{emailRedirectTo:window.location.origin}});if(error)throw error;
      setAccountMessage(data.session?'Your account is ready. You are signed in.':'Check your email to confirm the account, then sign in.','success');
    }else if(action==='sign-in'){
      const {error}=await cloudClient.auth.signInWithPassword({email:email.value.trim(),password:password.value});if(error)throw error;setAccountMessage('You are signed in. Loading your practice history…','success');
    }else if(action==='reset'){
      const {error}=await cloudClient.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:window.location.origin});if(error)throw error;setAccountMessage('If an account matches that email, password reset instructions have been sent.','success');
    }else if(action==='update-password'){
      const {error}=await cloudClient.auth.updateUser({password:password.value});if(error)throw error;passwordRecoveryPending=false;password.value='';updateAccountUI();setAccountMessage('Your password has been updated.','success');
    }
  }catch(error){setAccountMessage(error.message||'That account action could not be completed. Try again.','error')}
  finally{buttons.forEach(id=>{const button=document.getElementById(id);button.disabled=!cloudClient})}
}
async function importGuestHistory(){
  if(!cloudClient||!cloudUser)return;
  const guest=readStoredAttempts(guestAttemptStorageKey);if(!guest.length){setAccountMessage('There are no guest sessions on this device to sync.');return}
  if(!window.confirm(`Copy ${guest.length} guest session${guest.length===1?'':'s'} from this browser into ${cloudUser.email||'your account'}?`))return;
  const button=document.getElementById('account-import');button.disabled=true;
  try{const {error}=await cloudClient.from('practice_attempts').upsert(guest.map(item=>cloudAttemptRow(item,cloudUser.id)),{onConflict:'id',ignoreDuplicates:true});if(error)throw error;await loadAccountAttempts(cloudUser);setAccountMessage(`${guest.length} guest session${guest.length===1?'':'s'} synced to your account.`,'success')}
  catch{setAccountMessage('Guest sessions remain on this device. Account sync could not complete; check the account setup and retry.','error')}
  finally{button.disabled=false;updateAccountUI()}
}
async function deleteAccountHistory(){
  if(!cloudClient||!cloudUser)return;
  if(!window.confirm('Delete all synced practice history from your account? This cannot be undone. Guest history on this device will remain.'))return;
  const button=document.getElementById('account-delete-progress');button.disabled=true;
  try{const userId=cloudUser.id;const {error}=await cloudClient.from('practice_attempts').delete().eq('user_id',userId);if(error)throw error;localStorage.removeItem(accountAttemptStorageKey(userId));cloudSyncState='Account history deleted';updateAccountUI();renderWeeklyRhythm();if(document.getElementById('progress-view').classList.contains('active-view'))renderProgress();setAccountMessage('Your synced practice history has been deleted.','success')}
  catch{setAccountMessage('The history was not deleted. Check your account setup and try again.','error')}
  finally{button.disabled=false}
}
async function deleteAccount(){
  if(!cloudClient||!cloudUser||!accountDeletionEnabled)return;
  const password=document.getElementById('account-password');
  if(!password.reportValidity())return;
  if(!window.confirm('Permanently delete your FluentPath account and synced practice data? This cannot be undone. Separate guest history saved on this device will remain.'))return;
  const button=document.getElementById('account-delete-account');button.disabled=true;
  try{
    const {error:reauthError}=await cloudClient.auth.signInWithPassword({email:cloudUser.email,password:password.value});
    if(reauthError)throw new Error('Password verification failed. Your account was not deleted.');
    const {data,error:sessionError}=await cloudClient.auth.getSession();
    if(sessionError||!data.session?.access_token)throw new Error('Your sign-in could not be verified. Your account was not deleted.');
    const response=await fetch('/api/account-delete',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`}});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Account deletion could not be completed.');
    const userId=cloudUser.id;
    localStorage.removeItem(accountAttemptStorageKey(userId));
    password.value='';
    await cloudClient.auth.signOut({scope:'local'});
    cloudUser=null;cloudSyncState='Guest mode';passwordRecoveryPending=false;updateAccountUI();renderWeeklyRhythm();
    if(document.getElementById('progress-view').classList.contains('active-view'))renderProgress();
    setAccountMessage('Your account and synced practice data were deleted. Guest history on this device remains.','success');
  }catch(error){setAccountMessage(error.message||'Account deletion could not be completed. Contact support if the problem continues.','error')}
  finally{button.disabled=false;updateAccountUI()}
}
function clearGuestHistory(){
  const attempts=readStoredAttempts(guestAttemptStorageKey);if(!attempts.length){setAccountMessage('There is no guest history on this device.');return}
  if(!window.confirm(`Clear ${attempts.length} guest session${attempts.length===1?'':'s'} saved on this device? This cannot be undone.`))return;
  try{localStorage.removeItem(guestAttemptStorageKey)}catch{setAccountMessage('Browser storage could not be cleared.','error');return}
  updateAccountUI();renderWeeklyRhythm();if(document.getElementById('progress-view').classList.contains('active-view'))renderProgress();setAccountMessage('Guest history was cleared from this device.','success');
}
function openAccountDialog(){
  setAccountMessage('');updateAccountUI();
  if(!cloudClient)setAccountMessage('Account sync is not configured yet. Set up your Supabase project using ACCOUNT_SETUP.md; guest practice remains available.');
  const dialog=document.getElementById('account-dialog');if(!dialog.open)dialog.showModal();
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function renderCards(target){
  const host=document.getElementById(target);
  if(target==='library-grid'){
    const cards=Object.entries(prompts[activeExam]).flatMap(([skill,items])=>items.map(item=>{
      const visual=taskData[activeExam][skill];
      return `<article class="skill-card task-library-card" tabindex="0" role="button" data-skill="${escapeHtml(skill)}" data-task-id="${escapeHtml(item.id)}"><span class="skill-arrow">↗</span><div class="skill-icon" style="background:${visual.color}">${visual.icon}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(skill+' · '+item.format)}</p></article>`;
    }));
    host.innerHTML=cards.join('');
  }else{
    host.innerHTML=Object.values(taskData[activeExam]).map(item=>{
      const count=prompts[activeExam][item.skill].length;
      return `<article class="skill-card" tabindex="0" role="button" data-skill="${escapeHtml(item.skill)}"><span class="skill-arrow">↗</span><div class="skill-icon" style="background:${item.color}">${item.icon}</div><h3>${escapeHtml(item.skill)}</h3><p>${escapeHtml(item.desc)} · ${count} tasks</p></article>`;
    }).join('');
  }
  host.querySelectorAll('.skill-card').forEach(card=>{
    const activate=()=>openTask(card.dataset.skill,card.dataset.taskId);
    card.addEventListener('click',activate);
    card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate()}});
  });
}
function setExam(exam){activeExam=exam;document.querySelectorAll('.exam-tab').forEach(tab=>{const selected=tab.dataset.exam===exam;tab.classList.toggle('selected',selected);tab.setAttribute('aria-pressed',String(selected))});renderCards('skill-grid');renderCards('library-grid')}
function navigate(view){
  if(view!=='task')pauseTaskTimer();
  document.querySelectorAll('.view').forEach(section=>section.classList.toggle('active-view',section.id===`${view}-view`));
  const navView=view==='task'?'practice':view;
  document.querySelectorAll('.nav-item').forEach(item=>{
    const selected=item.dataset.view===navView;
    item.classList.toggle('active',selected);
    if(selected)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  });
  document.getElementById('crumb').textContent={home:'Overview',practice:'Practice',plans:'Plans',progress:'My progress'}[view]||'Practice';
  if(view==='progress')renderProgress();
  const heading=document.querySelector(`#${view}-view h1`);
  if(heading){if(!heading.hasAttribute('tabindex'))heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true})}
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({top:0,behavior:reducedMotion?'auto':'smooth'});
}
function chooseNextTask(skill,requestedId){
  const options=prompts[activeExam]?.[skill]||[];
  if(!options.length)return null;
  const storageKey='fluentpath.task-rotation.v1',historyKey=activeExam+':'+skill;
  let state={...taskRotationMemory},history=[];
  try{
    const stored=JSON.parse(localStorage.getItem(storageKey)||'{}');
    if(stored&&typeof stored==='object'&&!Array.isArray(stored))state={...state,...stored};
    const validIds=new Set(options.map(task=>task.id));
    history=Array.isArray(state[historyKey])?state[historyKey].filter(id=>validIds.has(id)):[];
  }catch{
    const validIds=new Set(options.map(task=>task.id));
    history=Array.isArray(state[historyKey])?state[historyKey].filter(id=>validIds.has(id)):[];
  }

  let item=requestedId?options.find(task=>task.id===requestedId):null;
  if(!item){
    let available=options.filter(task=>!history.includes(task.id));
    if(!available.length){
      const lastSeen=history.at(-1)||(activeTask?.skill===skill?activeTask.id:'');
      available=options.filter(task=>task.id!==lastSeen);
      if(!available.length)available=options;
      history=[];
    }
    item=available[Math.floor(Math.random()*available.length)]||options[0];
  }
  history=history.filter(id=>id!==item.id);
  history.push(item.id);
  state[historyKey]=history.slice(-options.length);
  taskRotationMemory=state;
  try{localStorage.setItem(storageKey,JSON.stringify(state))}catch{/* Keep task selection working when storage is unavailable. */}
  return item;
}
function openTask(skill,taskId){
  if(recorder?.state==='recording')recorder.stop();
  if(recordingUrl)URL.revokeObjectURL(recordingUrl);
  recordingUrl=null;recordedBlob=null;
  const item=chooseNextTask(skill,taskId);
  if(!item)return;
  activeTask=item;
  resetTaskTimer(item);
  document.getElementById('task-exam').textContent=activeExam;
  document.getElementById('task-skill').textContent=skill.toUpperCase();
  document.getElementById('task-title').textContent=item.title;
  document.getElementById('task-description').textContent=item.description;
  document.getElementById('prompt-text').textContent=item.prompt||(skill==='Reading'?'Read the passage, then answer the questions.':skill==='Listening'?'Listen to the recording, then answer the questions.':'');
  document.getElementById('prompt-hint').textContent=item.hint;
  document.getElementById('task-disclaimer').textContent=skill==='Writing'?'When you request feedback, your response is sent to Gemini. Feedback is formative practice guidance, not an official exam score.':skill==='Speaking'?'When you request feedback, your recording is sent to Gemini. Feedback is formative practice guidance, not an official exam score.':'These answer checks run locally against the sample answer key.';
  document.getElementById('time-pill').textContent=item.time;
  document.getElementById('aside-time').textContent='About '+item.time;
  document.getElementById('response-input').value='';
  document.getElementById('feedback-box').hidden=true;
  const consent=document.getElementById('ai-consent');
  consent.hidden=!['Writing','Speaking'].includes(skill);
  document.getElementById('ai-consent-checkbox').checked=false;
  document.getElementById('writing-interaction').hidden=skill!=='Writing';
  document.getElementById('practice-interaction').replaceChildren();
  if(skill==='Reading'||skill==='Listening')renderQuiz(skill);
  if(skill==='Speaking')renderSpeaking();
  if(skill==='Writing'&&item.script)renderWritingAudio();
  if(skill==='Writing'&&item.chart)renderWritingChart();
  updateCount();navigate('task');
}
function renderQuiz(skill){
  const data=activeTask,host=document.getElementById('practice-interaction');
  if(!data?.questions?.length)return;
  document.getElementById('feedback-box').hidden=true;
  if(skill==='Listening'){
    host.innerHTML='<div class="audio-panel"><div><b>Listen to the recording</b><p>This sample is read aloud by your browser.</p></div><button class="secondary-button" id="play-audio">▶ Play audio</button><button class="link-button" id="show-script">Show transcript</button><p class="transcript" id="transcript" hidden>'+escapeHtml(data.script)+'</p></div>';
    document.getElementById('play-audio').addEventListener('click',()=>{
      if(!('speechSynthesis'in window)){showFeedback('Audio playback is not available in this browser. You can reveal the transcript to continue.');return}
      speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(data.script);utterance.lang='en-US';speechSynthesis.speak(utterance);
    });
    document.getElementById('show-script').addEventListener('click',event=>{
      const transcript=document.getElementById('transcript');transcript.hidden=!transcript.hidden;
      event.currentTarget.textContent=transcript.hidden?'Show transcript':'Hide transcript';
    });
  }else{
    host.innerHTML='<div class="reading-passage"><div class="aside-label">PASSAGE</div><p>'+escapeHtml(data.passage)+'</p></div>';
    if(Array.isArray(data.diagram)&&data.diagram.length){
      host.insertAdjacentHTML('beforeend','<ol class="process-diagram" aria-label="Process diagram">'+data.diagram.map(step=>'<li>'+escapeHtml(step)+'</li>').join('')+'</ol>');
    }
  }
  const renderQuestion=(question,index)=>{
    const name='practice-answer-'+index,options=Array.isArray(question.options)?question.options:[];
    let control='';
    if(question.kind==='multi'){
      control='<div class="answer-options">'+options.map((option,optionIndex)=>'<label class="answer-option"><input type="checkbox" name="'+name+'" value="'+optionIndex+'"><span>'+escapeHtml(option)+'</span></label>').join('')+'</div>';
    }else if(question.kind==='select'){
      control='<label class="quiz-control-label" for="'+name+'">Choose an answer</label><select class="quiz-select" id="'+name+'" name="'+name+'"><option value="">Select…</option>'+options.map((option,optionIndex)=>'<option value="'+optionIndex+'">'+escapeHtml(option)+'</option>').join('')+'</select>';
    }else if(question.kind==='matching'){
      const items=Array.isArray(question.items)?question.items:[];
      control='<div class="matching-grid">'+items.map((item,itemIndex)=>'<label class="matching-row"><span>'+escapeHtml(item)+'</span><select class="quiz-select" name="'+name+'-'+itemIndex+'" aria-label="Match '+escapeHtml(item)+'"><option value="">Choose a match…</option>'+options.map((option,optionIndex)=>'<option value="'+optionIndex+'">'+escapeHtml(option)+'</option>').join('')+'</select></label>').join('')+'</div>';
    }else if(question.kind==='text'){
      control='<label class="quiz-control-label" for="'+name+'">Type your answer</label><input class="quiz-text-answer" id="'+name+'" name="'+name+'" type="text" autocomplete="off">';
    }else if(question.kind==='order'){
      const items=Array.isArray(question.items)?question.items:[];
      control='<p class="quiz-control-label">Use the arrow buttons to arrange the paragraphs.</p><div class="order-list" data-order-list="'+index+'">'+items.map((item,itemIndex)=>'<div class="order-item" data-item-index="'+itemIndex+'"><span>'+escapeHtml(item)+'</span><span class="order-move-controls"><button class="order-move" type="button" data-move="up" aria-label="Move paragraph '+(itemIndex+1)+' up">↑</button><button class="order-move" type="button" data-move="down" aria-label="Move paragraph '+(itemIndex+1)+' down">↓</button></span></div>').join('')+'</div>';
    }else if(question.kind==='highlight'){
      const tokens=Array.isArray(question.tokens)?question.tokens:[];
      control='<p class="quiz-control-label">Select the words that differ from the recording.</p><div class="highlight-word-list">'+tokens.map((token,tokenIndex)=>'<button class="highlight-word" type="button" aria-pressed="false" data-token-index="'+tokenIndex+'">'+escapeHtml(token)+'</button>').join(' ' )+'</div>';
    }else if(question.kind==='word-bank'){
      control='<p class="quiz-control-label">Drag a word to the blank, or select one from the word bank.</p><div class="word-bank-control"><button class="word-bank-target" type="button" data-selected="" aria-label="Choose a word for this blank">Drop or choose a word…</button><div class="word-bank-options">'+options.map((option,optionIndex)=>'<button class="word-bank-choice" type="button" draggable="true" data-value="'+optionIndex+'">'+escapeHtml(option)+'</button>').join('')+'</div></div>';
    }else{
      control='<div class="answer-options">'+options.map((option,optionIndex)=>'<label class="answer-option"><input type="radio" name="'+name+'" value="'+optionIndex+'"><span>'+escapeHtml(option)+'</span></label>').join('')+'</div>';
    }
    return '<div class="quiz-question" data-question="'+index+'"><h3>'+ (index+1)+'. '+escapeHtml(question.question)+'</h3>'+control+'</div>';
  };
  host.insertAdjacentHTML('beforeend','<div class="quiz-card"><div class="question-label">'+data.questions.length+' ITEMS · CHECK YOUR ANSWERS</div>'+data.questions.map(renderQuestion).join('')+'<button class="primary-button" id="check-answer">Check answers <span>→</span></button></div>');
  host.querySelectorAll('.highlight-word').forEach(button=>button.addEventListener('click',()=>{
    const selected=button.getAttribute('aria-pressed')!=='true';
    button.setAttribute('aria-pressed',String(selected));button.classList.toggle('selected',selected);
  }));
  host.querySelectorAll('.order-move').forEach(button=>button.addEventListener('click',()=>{
    const item=button.closest('.order-item'),list=item?.parentElement;if(!item||!list)return;
    const sibling=button.dataset.move==='up'?item.previousElementSibling:item.nextElementSibling;
    if(!sibling)return;
    if(button.dataset.move==='up')list.insertBefore(item,sibling);else list.insertBefore(sibling,item);
    list.querySelectorAll('.order-item').forEach((row,position)=>row.querySelectorAll('.order-move').forEach(control=>control.disabled=(control.dataset.move==='up'&&position===0)||(control.dataset.move==='down'&&position===list.children.length-1)));
  }));
  const setWordChoice=(target,value)=>{
    const holder=target.closest('.word-bank-control');if(!holder)return;
    if(value===undefined||value===null||value==='')return;
    const selected=Number(value);if(!Number.isInteger(selected))return;
    holder.querySelector('.word-bank-target').dataset.selected=String(selected);
    holder.querySelector('.word-bank-target').textContent=optionsForWordBank(holder,selected);
    holder.querySelectorAll('.word-bank-choice').forEach(choice=>choice.setAttribute('aria-pressed',String(Number(choice.dataset.value)===selected)));
  };
  const optionsForWordBank=(holder,selected)=>holder.querySelector('.word-bank-choice[data-value="'+selected+'"]')?.textContent||'';
  host.querySelectorAll('.word-bank-choice').forEach(button=>{
    button.addEventListener('click',()=>setWordChoice(button,button.dataset.value));
    button.addEventListener('dragstart',event=>event.dataTransfer?.setData('text/plain',button.dataset.value));
  });
  host.querySelectorAll('.word-bank-target').forEach(target=>{
    target.addEventListener('dragover',event=>event.preventDefault());
    target.addEventListener('drop',event=>{event.preventDefault();setWordChoice(target,event.dataTransfer?.getData('text/plain'))});
  });
  document.getElementById('check-answer').addEventListener('click',()=>{
    const normalize=value=>String(value??'').trim().toLowerCase().replace(/[.,!?;:]/g,'').replace(/\s+/g,' ');
    const results=data.questions.map((question,index)=>{
      const name='practice-answer-'+index,kind=question.kind||'single';
      if(kind==='multi'){
        const selected=[...document.querySelectorAll('input[name="'+name+'"]:checked')].map(input=>Number(input.value)).sort((a,b)=>a-b);
        const expected=[...(question.answerIndices||[])].map(Number).sort((a,b)=>a-b);
        return{complete:selected.length>0,correct:JSON.stringify(selected)===JSON.stringify(expected)};
      }
      if(kind==='select'){
        const selected=document.getElementById(name)?.value||'';
        return{complete:selected!=='',correct:Number(selected)===question.answer};
      }
      if(kind==='matching'){
        const selected=question.items.map((_,itemIndex)=>document.querySelector('select[name="'+name+'-'+itemIndex+'"]').value);
        const complete=selected.every(value=>value!=='');
        const expected=question.answerIndices||[];
        return{complete,correct:complete&&JSON.stringify(selected.map(Number))===JSON.stringify(expected.map(Number))};
      }
      if(kind==='text'){
        const answer=document.getElementById(name)?.value||'',expected=question.acceptedAnswers||[question.answerText||''];
        return{complete:Boolean(answer.trim()),correct:expected.some(value=>normalize(value)===normalize(answer))};
      }
      if(kind==='order'){
        const selected=[...host.querySelectorAll('.order-list[data-order-list="'+index+'"] .order-item')].map(item=>Number(item.dataset.itemIndex));
        const complete=selected.length===question.items.length;
        return{complete,correct:complete&&JSON.stringify(selected)===JSON.stringify(question.answerOrder)};
      }
      if(kind==='highlight'){
        const selected=[...host.querySelectorAll('.quiz-question[data-question="'+index+'"] .highlight-word[aria-pressed="true"]')].map(button=>Number(button.dataset.tokenIndex)).sort((a,b)=>a-b);
        const expected=[...(question.answerIndices||[])].map(Number).sort((a,b)=>a-b);
        return{complete:selected.length>0,correct:JSON.stringify(selected)===JSON.stringify(expected)};
      }
      if(kind==='word-bank'){
        const selected=host.querySelector('.quiz-question[data-question="'+index+'"] .word-bank-target')?.dataset.selected||'';
        return{complete:selected!=='',correct:Number(selected)===question.answer};
      }
      const selected=document.querySelector('input[name="'+name+'"]:checked');
      return{complete:Boolean(selected),correct:Boolean(selected)&&Number(selected.value)===question.answer};
    });
    if(results.some(result=>!result.complete)){showFeedback('Complete every item before checking your answers.');return}
    const score=results.filter(result=>result.correct).length;
    saveAttempt({exam:activeExam,skill,title:activeTask.title,completedAt:new Date().toISOString(),correct:score,total:data.questions.length,type:'objective'});
    const details=data.questions.map((question,index)=>'<li><b>'+(index+1)+'. '+(results[index].correct?'Correct':'Review')+':</b> '+escapeHtml(question.explanation||'Review the passage or audio and try this question type again.')+'</li>').join('');
    const box=document.getElementById('feedback-box');
    box.innerHTML='<div class="sample-label">PRACTICE RESULT · SAMPLE CONTENT</div><h3>You got '+score+' out of '+data.questions.length+'</h3><ul>'+details+'</ul><button class="secondary-button retry-button" id="retry-quiz">Try again</button>';
    box.hidden=false;box.setAttribute('aria-busy','false');host.querySelectorAll('.quiz-card input,.quiz-card select,.quiz-card button').forEach(input=>input.disabled=true);
    document.getElementById('check-answer').disabled=true;
    document.getElementById('retry-quiz').addEventListener('click',()=>renderQuiz(skill));
    box.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  });
}

function speakPracticeScript(script){
  if(!('speechSynthesis'in window)){showFeedback('Audio playback is unavailable in this browser.');return}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(script);utterance.lang='en-US';speechSynthesis.speak(utterance);
}
function chartMarkup(chart){
  if(!chart?.categories?.length||!chart?.series?.length)return'';
  const values=chart.series.flatMap(series=>series.values||[]).map(Number).filter(Number.isFinite),maximum=Math.max(1,...values);
  const seriesMarkup=chart.series.map(series=>'<section class="chart-series"><h3>'+escapeHtml(series.name)+'</h3>'+chart.categories.map((category,index)=>{
    const value=Number(series.values?.[index])||0,width=Math.max(0,Math.min(100,value/maximum*100));
    return'<div class="chart-row"><span>'+escapeHtml(category)+'</span><span class="chart-track"><span style="width:'+width+'%"></span></span><b>'+escapeHtml(value+(chart.unit||''))+'</b></div>';
  }).join('')+'</section>').join('');
  const table='<table class="chart-data-table"><caption>Data values</caption><thead><tr><th>Category</th>'+chart.series.map(series=>'<th>'+escapeHtml(series.name)+'</th>').join('')+'</tr></thead><tbody>'+chart.categories.map((category,index)=>'<tr><th>'+escapeHtml(category)+'</th>'+chart.series.map(series=>'<td>'+escapeHtml((series.values?.[index]??'')+(chart.unit||''))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  return'<figure class="practice-chart"><figcaption>'+escapeHtml(chart.title||'Practice chart')+'</figcaption>'+seriesMarkup+table+'</figure>';
}
function renderWritingAudio(){
  const host=document.getElementById('practice-interaction');
  host.innerHTML='<div class="audio-panel"><div><b>Listen to the source recording</b><p>This original sample is read aloud by your browser.</p></div><button class="secondary-button" id="play-writing-source">▶ Play audio</button><button class="link-button" id="toggle-writing-transcript">Show transcript</button><p class="transcript" id="writing-source-transcript" hidden>'+escapeHtml(activeTask.script)+'</p></div>';
  document.getElementById('play-writing-source').addEventListener('click',()=>speakPracticeScript(activeTask.script));
  document.getElementById('toggle-writing-transcript').addEventListener('click',event=>{
    const transcript=document.getElementById('writing-source-transcript');transcript.hidden=!transcript.hidden;
    event.currentTarget.textContent=transcript.hidden?'Show transcript':'Hide transcript';
  });
}
function renderWritingChart(){document.getElementById('practice-interaction').innerHTML=chartMarkup(activeTask.chart)}

function showFeedback(message,correct=null){const box=document.getElementById('feedback-box');box.replaceChildren();box.setAttribute('aria-busy','false');const label=document.createElement('div');label.className='sample-label';label.textContent=correct===null?'PRACTICE FEEDBACK':'PRACTICE CHECK · SAMPLE CONTENT';const heading=document.createElement('h3');heading.textContent=correct===null?'Ready when you are':correct?'Correct answer':'Try again';const text=document.createElement('p');text.textContent=message;box.append(label,heading,text);box.hidden=false}
function renderFeedbackPending(){const box=document.getElementById('feedback-box');box.replaceChildren();box.setAttribute('aria-busy','true');const label=document.createElement('div');label.className='sample-label';label.textContent='GEMINI AI FEEDBACK';const heading=document.createElement('h3');heading.textContent='Checking your response';const text=document.createElement('p');text.textContent='Your work stays on this page. Feedback can take up to 15 seconds.';box.append(label,heading,text);box.hidden=false}
function renderAIResult(data){const box=document.getElementById('feedback-box');box.replaceChildren();box.setAttribute('aria-busy','false');const label=document.createElement('div');label.className='sample-label';label.textContent='GEMINI AI FEEDBACK · FORMATIVE PRACTICE';box.append(label);const overview=document.createElement('p');overview.className='ai-overview';overview.textContent=data.overview;box.append(overview);for(const [heading,items] of [['Strengths',data.strengths],['Next steps',data.improvements]]){const h=document.createElement('h3');h.textContent=heading;box.append(h);const list=document.createElement('ul');for(const item of items){const li=document.createElement('li');li.textContent=item;list.append(li)}box.append(list)}if(data.criteria.length){const h=document.createElement('h3');h.textContent='Skill notes';box.append(h);const list=document.createElement('ul');for(const item of data.criteria){const li=document.createElement('li'),strong=document.createElement('b');strong.textContent=`${item.name}: `;li.append(strong,document.createTextNode(item.comment));list.append(li)}box.append(list)}const note=document.createElement('p');note.className='ai-limit';note.textContent='AI feedback is for practice. It is not an official IELTS or PTE score.';box.append(note);box.hidden=false}
function renderLocalReview(skill,error){
  const box=document.getElementById('feedback-box');box.replaceChildren();box.setAttribute('aria-busy','false');
  const label=document.createElement('div');label.className='sample-label';label.textContent='QUICK SELF-REVIEW · AI UNAVAILABLE';box.append(label);
  const heading=document.createElement('h3');heading.textContent='Keep practising while AI is unavailable';box.append(heading);
  const message=document.createElement('p');message.className='local-review-message';
  const reason=error.name==='AbortError'||/7 seconds|8 seconds|15 seconds|timed out/i.test(error.message||'')
    ?'Gemini took longer than expected. Your response is still in the editor; please try again shortly.'
    :/Wrong server/i.test(error.message||'')
      ?'This page is connected to a preview server. Start FluentPath with npm start in the project folder, then open the local address printed in the terminal to use AI feedback.'
      :/sign.?in|session has expired|sign-in could not be verified/i.test(error.message||'')
        ?'Please sign in again to continue. Your work is still here.'
      :/feedback limits could not be checked/i.test(error.message||'')
        ?'We could not verify the AI practice limit right now. Your work is still here; please try again shortly.'
      :/not configured/i.test(error.message||'')
        ?'Add a valid Gemini API key to the .env file in the project folder, then restart FluentPath. Your work is still here.'
      :/feedback limit/i.test(error.message||'')
        ?'You have reached the AI feedback practice limit. Your work is still here; please try again later.'
      :/^(Gemini rejected the API key|Gemini denied access|Gemini project setup|Gemini could not find the configured model|Gemini rejected the request settings|Gemini usage limit)/i.test(error.message||'')
        ?error.message
      :/feedback did not match the format expected/i.test(error.message||'')
        ?error.message
      :/overload|busy|503|rate.limit|quota/i.test(error.message||'')
        ?'Gemini is busy right now. Your work is still here, and you can try again shortly.'
        :'Gemini could not return feedback just now. Your work is still here, and you can try again shortly.';
  message.textContent=reason;box.append(message);
  const list=document.createElement('ul');
  if(skill==='Writing'){
    const answer=document.getElementById('response-input').value.trim();
    const words=answer?answer.split(/\s+/).filter(Boolean).length:0;
    const sentences=answer?answer.split(/[.!?]+/).filter(part=>part.trim()).length:0;
    const paragraphs=answer?answer.split(/\n\s*\n/).filter(part=>part.trim()).length:0;
    const metrics=document.createElement('p');metrics.className='local-review-metrics';metrics.textContent=`Quick check: ${words} words · about ${sentences} sentences · ${paragraphs} paragraph${paragraphs===1?'':'s'}.`;box.append(metrics);
    for(const tip of ['Check that your opening answers the exact question.','Give each main idea a reason or example, then connect it back to your position.','Read once for missing articles, verb endings, punctuation, and repeated words.']){const li=document.createElement('li');li.textContent=tip;list.append(li)}
  }else{
    for(const tip of ['Did you cover every part of the speaking prompt?','Listen once for clear organization and pauses that keep your ideas easy to follow.','Choose one word or sentence to make clearer in your next attempt.']){const li=document.createElement('li');li.textContent=tip;list.append(li)}
  }
  box.append(list);
  const retry=document.createElement('button');retry.type='button';retry.className='secondary-button local-review-retry';retry.textContent='Try Gemini again';retry.addEventListener('click',async()=>{if(skill==='Speaking'){const audio=await recordedAudioData();if(!audio){showFeedback('Your recording is no longer available. Record your answer again to retry.');return}requestAIFeedback(skill,audio,recordedBlob.type)}else requestAIFeedback(skill)});box.append(retry);
  const note=document.createElement('p');note.className='ai-limit';note.textContent='This checklist is general practice guidance, not an AI assessment or an official exam score.';box.append(note);box.hidden=false;
}
function recordedAudioData(){if(!recordedBlob)return Promise.resolve(null);return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>resolve(null);reader.readAsDataURL(recordedBlob)})}
async function requestAIFeedback(skill,audioData=null,mimeType=null){
  const button=skill==='Writing'?document.getElementById('submit-response'):document.getElementById('speaking-feedback');
  const box=document.getElementById('feedback-box');
  const answer=document.getElementById('response-input').value.trim();
  if(skill==='Writing'&&answer.length<15){showFeedback('Write a little more before requesting AI feedback.');return}if(!document.getElementById('ai-consent-checkbox').checked){showFeedback('Please check the consent box before sending your work to Gemini.');return}
  let accessToken='';
  if(cloudClient){try{const {data}=await cloudClient.auth.getSession();accessToken=data.session?.access_token||''}catch{/* The API returns a clear verification error if hosted sign-in is required. */}}
  if(requireAuthForAiFeedback&&!accessToken){if(cloudClient){openAccountDialog();setAccountMessage('Sign in to your learner account before requesting AI feedback.','error')}else showFeedback('AI feedback requires a learner account, but account setup is unavailable right now. Your work is still here; please try again shortly.');return}
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),16000);
  button.disabled=true;button.dataset.originalText=button.innerHTML;button.textContent='Reviewing your answer…';renderFeedbackPending();
  try{
    const headers={'Content-Type':'application/json'};if(accessToken)headers.Authorization=`Bearer ${accessToken}`;
    const sourceMaterial=activeTask?.script||activeTask?.passage||(activeTask?.chart?JSON.stringify(activeTask.chart):'');
    const response=await fetch('/api/feedback',{method:'POST',headers,signal:controller.signal,body:JSON.stringify({exam:document.getElementById('task-exam').textContent,skill,title:document.getElementById('task-title').textContent,prompt:document.getElementById('prompt-text').textContent,sourceMaterial,answer,audioData,mimeType})});
    const responseText=await response.text();let result;
    try{result=JSON.parse(responseText)}catch{if(response.status===405)throw new Error('Wrong server: this page is using a static preview. In VS Code, run npm start in E:\\ielts pte, then open http://localhost:8001.');throw new Error(responseText.trim()||`The practice server returned an empty response (HTTP ${response.status}).`)}
    if(!response.ok)throw new Error(result.error||'Feedback request failed.');
    renderAIResult(result.feedback);
    saveAttempt({exam:document.getElementById('task-exam').textContent,skill,title:document.getElementById('task-title').textContent,completedAt:new Date().toISOString(),type:'ai-feedback'});
  }catch(error){renderLocalReview(skill,error);saveAttempt({exam:document.getElementById('task-exam').textContent,skill,title:document.getElementById('task-title').textContent,completedAt:new Date().toISOString(),type:'self-review'})}
  finally{clearTimeout(timeout);button.disabled=false;button.innerHTML=button.dataset.originalText}
}
let recorder=null,recordedChunks=[],recordingUrl=null,recordedBlob=null;
function renderSpeaking(){const host=document.getElementById('practice-interaction'),source=chartMarkup(activeTask.chart)+(activeTask.script?'<div class="audio-panel"><div><b>Listen to the sample prompt</b><p>This original sample is read aloud by your browser.</p></div><button class="secondary-button" id="play-speaking-source">▶ Play audio</button></div>':'');host.innerHTML=source+'<div class="record-card"><div class="question-label">YOUR SPEAKING RESPONSE</div><p>When you’re ready, record your answer. After you request feedback, the recording is sent to Gemini for formative analysis.</p><div class="record-controls"><button class="primary-button" id="record-button">● Start recording</button><span id="record-status" role="status" aria-live="polite">Microphone permission is needed.</span></div><audio id="recording-playback" controls hidden></audio><button class="primary-button ai-speaking-button" id="speaking-feedback" hidden>Get AI feedback <span>→</span></button></div>';
  if(activeTask.script)document.getElementById('play-speaking-source').addEventListener('click',()=>speakPracticeScript(activeTask.script));
 document.getElementById('record-button').addEventListener('click',async()=>{const button=document.getElementById('record-button'),status=document.getElementById('record-status');if(recorder?.state==='recording'){recorder.stop();button.textContent='● Start recording';status.textContent='Recording stopped. Play it back or request feedback.';return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});recordedChunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)recordedChunks.push(e.data)};recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());recordedBlob=new Blob(recordedChunks,{type:recorder.mimeType||'audio/webm'});if(recordingUrl)URL.revokeObjectURL(recordingUrl);recordingUrl=URL.createObjectURL(recordedBlob);const player=document.getElementById('recording-playback');player.src=recordingUrl;player.hidden=false;const tooLarge=recordedBlob.size>2800000,feedbackButton=document.getElementById('speaking-feedback');feedbackButton.hidden=tooLarge;if(tooLarge)status.textContent='This recording is over 2.8 MB. Record a shorter answer, then request feedback.'};recorder.start();document.getElementById('speaking-feedback').hidden=true;button.textContent='■ Stop recording';status.textContent='Recording… speak clearly, then stop when finished.'}catch(error){status.textContent=error.name==='NotAllowedError'?'Microphone access was blocked. Allow it in your browser settings and try again.':'Recording is unavailable here. Open this page on localhost or HTTPS and check your microphone.'}});document.getElementById('speaking-feedback').addEventListener('click',async()=>{if(!recordedBlob){showFeedback('Record an answer first.');return}const reader=new FileReader();reader.onload=()=>requestAIFeedback('Speaking',reader.result.split(',')[1],recordedBlob.type);reader.readAsDataURL(recordedBlob)})}
function updateCount(){const words=document.getElementById('response-input').value.trim().split(/\s+/).filter(Boolean).length;document.getElementById('word-count').textContent=`${words} ${words===1?'word':'words'}`}
function renderTaskTimer(){
  const display=document.getElementById('task-timer-display'),button=document.getElementById('task-timer-start'),status=document.getElementById('task-timer-status');
  if(!display||!button||!status)return;
  const minutes=Math.floor(taskTimerRemaining/60),seconds=taskTimerRemaining%60;
  display.textContent=String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
  button.textContent=taskTimerInterval?'Pause timer':taskTimerRemaining===0?'Time is up':'Start timer';
  button.disabled=taskTimerRemaining===0;
  if(taskTimerRemaining===0)status.textContent='Time is up. You can still finish and check your practice.';
}
function pauseTaskTimer(){
  if(taskTimerInterval){clearInterval(taskTimerInterval);taskTimerInterval=null;const status=document.getElementById('task-timer-status');if(status)status.textContent='Timer paused';renderTaskTimer()}
}
function resetTaskTimer(item=activeTask){
  if(taskTimerInterval)clearInterval(taskTimerInterval);taskTimerInterval=null;
  taskTimerDuration=Math.max(0,Math.round((Number(item?.suggestedTimeMinutes)||0)*60||Number(item?.suggestedResponseSeconds)||0));
  taskTimerRemaining=taskTimerDuration;
  const panel=document.getElementById('practice-timer');if(panel)panel.hidden=taskTimerDuration===0;
  const status=document.getElementById('task-timer-status');if(status)status.textContent='Optional task timer';
  renderTaskTimer();
}
document.getElementById('task-timer-start').addEventListener('click',()=>{
  if(taskTimerInterval){pauseTaskTimer();return}
  if(taskTimerRemaining<=0)return;
  document.getElementById('task-timer-status').textContent='Time remaining';
  taskTimerInterval=setInterval(()=>{
    taskTimerRemaining=Math.max(0,taskTimerRemaining-1);
    if(taskTimerRemaining===0){clearInterval(taskTimerInterval);taskTimerInterval=null}
    renderTaskTimer();
  },1000);
  renderTaskTimer();
});
document.getElementById('task-timer-reset').addEventListener('click',()=>resetTaskTimer());
document.querySelectorAll('.exam-tab').forEach(tab=>tab.addEventListener('click',()=>setExam(tab.dataset.exam)));
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.goto)));
document.getElementById('back-button').addEventListener('click',()=>navigate('practice'));
document.getElementById('plans-practice-button').addEventListener('click',()=>navigate('practice'));
document.getElementById('plans-practice-button-secondary').addEventListener('click',()=>navigate('practice'));
const nextTaskButton=document.createElement('button');
nextTaskButton.type='button';nextTaskButton.id='next-task-button';nextTaskButton.className='back-button next-task-button';
nextTaskButton.textContent='↻ Try another task';
nextTaskButton.setAttribute('aria-label','Try another task in this skill');
document.getElementById('back-button').after(nextTaskButton);
nextTaskButton.addEventListener('click',()=>{
  if(!activeTask)return;
  const hasDraft=(activeTask.skill==='Writing'&&document.getElementById('response-input').value.trim())||(activeTask.skill==='Speaking'&&recordedBlob);
  if(hasDraft&&!window.confirm('Starting another task clears this unsaved response or recording. Continue?'))return;
  openTask(activeTask.skill);
});
document.getElementById('response-input').addEventListener('input',updateCount);
document.getElementById('submit-response').addEventListener('click',()=>requestAIFeedback('Writing'));
document.getElementById('account-button').addEventListener('click',openAccountDialog);
document.getElementById('help-button').addEventListener('click',()=>document.getElementById('help-dialog').showModal());
document.getElementById('help-close').addEventListener('click',()=>document.getElementById('help-dialog').close());
document.getElementById('help-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close()});
document.getElementById('account-close').addEventListener('click',()=>document.getElementById('account-dialog').close());
document.getElementById('account-sign-in').addEventListener('click',()=>performAccountAction('sign-in'));
document.getElementById('account-create').addEventListener('click',()=>performAccountAction('create'));
document.getElementById('account-reset').addEventListener('click',()=>performAccountAction('reset'));
document.getElementById('account-update-password').addEventListener('click',()=>performAccountAction('update-password'));
document.getElementById('account-import').addEventListener('click',importGuestHistory);
document.getElementById('account-delete-progress').addEventListener('click',deleteAccountHistory);
document.getElementById('account-delete-account').addEventListener('click',deleteAccount);
document.getElementById('account-clear-guest').addEventListener('click',clearGuestHistory);
document.getElementById('account-sign-out').addEventListener('click',async()=>{if(!cloudClient)return;const {error}=await cloudClient.auth.signOut();if(error){setAccountMessage(error.message||'Sign out could not complete.','error');return}passwordRecoveryPending=false;setAccountMessage('You are signed out.','success')});
document.getElementById('account-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close()});
updateAccountUI();
loadPracticeBank().then(()=>{renderCards('skill-grid');renderCards('library-grid');renderWeeklyRhythm()}).catch(showContentLoadError);
void initializeAccounts();
