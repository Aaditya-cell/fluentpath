import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const baseBank=JSON.parse(readFileSync(new URL('../data/practice-bank.json',import.meta.url),'utf8'));
const extendedBank=JSON.parse(readFileSync(new URL('../data/extended-practice-bank.json',import.meta.url),'utf8'));
const bank={...baseBank,tasks:[...baseBank.tasks,...extendedBank.tasks]};

function createHost(){
  const host={cards:[],markup:''};
  Object.defineProperty(host,'innerHTML',{
    get(){return this.markup},
    set(markup){
      this.markup=String(markup);
      this.cards=[...this.markup.matchAll(/<article\b[^>]*>/g)].map(([tag])=>{
        const skill=tag.match(/data-skill="([^"]*)"/)?.[1]||'';
        const taskId=tag.match(/data-task-id="([^"]*)"/)?.[1]||'';
        return{dataset:{skill,taskId},handlers:{},addEventListener(name,handler){this.handlers[name]=handler}};
      });
    }
  });
  host.querySelectorAll=selector=>selector==='.skill-card'?host.cards:[];
  return host;
}

test('practice library shows every task and opens the selected task by id',async()=>{
  const hosts={'skill-grid':createHost(),'library-grid':createHost()};
  const opened=[];
  const store=new Map();
  const context={
    fetch:async url=>({ok:true,json:async()=>String(url).includes('extended-practice-bank')?extendedBank:baseBank}),
    document:{getElementById:id=>hosts[id]},
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    Math:{round:Math.round,max:Math.max,floor:()=>0,random:()=>0},
    openTask:(skill,id)=>opened.push({skill,id})
  };
  const setupEnd=app.indexOf('function showContentLoadError()');
  const libraryStart=app.indexOf('function escapeHtml(');
  const libraryEnd=app.indexOf('function setExam(');
  assert.ok(setupEnd>0&&libraryStart>setupEnd&&libraryEnd>libraryStart,'practice loader and library renderer must be present');
  vm.runInNewContext(app.slice(0,setupEnd)+'globalThis.loadBank=loadPracticeBank;globalThis.getGroupedTasks=()=>prompts;',context);
  await context.loadBank();
  vm.runInNewContext(app.slice(libraryStart,libraryEnd),context);
  context.renderCards('library-grid');
  context.renderCards('skill-grid');
  const ieltsIds=hosts['library-grid'].cards.map(card=>card.dataset.taskId);

  const grouped=context.getGroupedTasks();
  assert.equal(hosts['skill-grid'].cards.length,4,'the overview should show one card per skill');
  assert.equal(ieltsIds.length,bank.tasks.filter(task=>task.exam==='IELTS Academic').length,'the IELTS library should show every IELTS task');
  vm.runInNewContext("activeExam='PTE';renderCards('library-grid');renderCards('skill-grid');",context);
  const pteIds=hosts['library-grid'].cards.map(card=>card.dataset.taskId);
  assert.equal(hosts['library-grid'].cards.length,bank.tasks.filter(task=>task.exam==='PTE Academic').length,'the PTE library should show every PTE task');
  assert.equal(hosts['skill-grid'].cards.length,4,'the PTE overview should show one card per skill');
  const displayedIds=[...ieltsIds,...pteIds];
  assert.deepEqual([...displayedIds].sort(),bank.tasks.map(task=>task.id).sort());
  for(const exam of ['IELTS','PTE']){
    for(const skill of ['Listening','Reading','Writing','Speaking']){
      const examName=exam==='IELTS'?'IELTS Academic':'PTE Academic';
      assert.equal(grouped[exam][skill].length,bank.tasks.filter(task=>task.exam===examName&&task.skill===skill).length,`${exam} ${skill} should show every matching task`);
    }
  }

  const selected=hosts['library-grid'].cards.find(card=>card.dataset.taskId===bank.tasks.at(-1).id);
  selected.handlers.click();
  assert.deepEqual(opened.pop(),{skill:bank.tasks.at(-1).skill,id:bank.tasks.at(-1).id});
  let prevented=false;
  selected.handlers.keydown({key:'Enter',preventDefault(){prevented=true}});
  assert.equal(prevented,true);
  assert.deepEqual(opened.pop(),{skill:bank.tasks.at(-1).skill,id:bank.tasks.at(-1).id});

  const rotationStart=app.indexOf('function chooseNextTask(');
  const rotationEnd=app.indexOf('function openTask(',rotationStart);
  assert.ok(rotationStart>0&&rotationEnd>rotationStart,'the no-repeat rotation must be present');
  vm.runInNewContext(app.slice(rotationStart,rotationEnd),context);
  const pteSpeakingId=bank.tasks.at(-1).id;
  assert.equal(context.chooseNextTask('Speaking',pteSpeakingId).id,pteSpeakingId,'a selected library task should open exactly');
  assert.notEqual(context.chooseNextTask('Speaking').id,pteSpeakingId,'rotation should avoid the task just opened manually');
  vm.runInNewContext("activeExam='IELTS';",context);
  const firstCycle=Array.from({length:4},()=>context.chooseNextTask('Writing').id);
  assert.equal(new Set(firstCycle).size,4,'automatic selection should use every task before repeating');
  const fifth=context.chooseNextTask('Writing').id;
  assert.notEqual(fifth,firstCycle.at(-1),'the next cycle should not immediately repeat the last task');
});
