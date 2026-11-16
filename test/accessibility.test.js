import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const accessibilityCss=readFileSync(new URL('../accessibility.css',import.meta.url),'utf8');

test('key interaction controls expose basic accessibility support',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'HTML IDs must be unique');
  for(const [,labelledBy] of html.matchAll(/aria-labelledby="([^"]+)"/g)){
    assert.ok(ids.includes(labelledBy),`aria-labelledby target ${labelledBy} must exist`);
  }
  assert.equal((html.match(/role="group" aria-label="Choose exam"/g)||[]).length,2);
  assert.equal((html.match(/aria-pressed=/g)||[]).length,4);
  assert.doesNotMatch(html,/role="tab"|aria-selected=/);
  assert.match(html,/id="feedback-box" role="status" aria-live="polite"/);
  assert.match(html,/id="help-dialog" aria-labelledby="help-title"/);
  assert.ok(app.includes("getElementById('help-button').addEventListener"));
  assert.match(accessibilityCss,/:focus-visible/);
  assert.match(accessibilityCss,/prefers-reduced-motion/);
});

test('opening a task keeps Practice selected and moves focus to the task heading',()=>{
  const classList=()=>{
    const values=new Set();
    return{toggle(name,force){if(force)values.add(name);else values.delete(name)},contains:name=>values.has(name)};
  };
  const views=['home','practice','progress','task'].map(view=>({id:`${view}-view`,classList:classList()}));
  const navItems=['home','practice','progress'].map(view=>({dataset:{view},classList:classList(),attributes:{},setAttribute(name,value){this.attributes[name]=value},removeAttribute(name){delete this.attributes[name]}}));
  const focused=[];
  const taskHeading={attributes:{},hasAttribute(name){return Object.hasOwn(this.attributes,name)},setAttribute(name,value){this.attributes[name]=value},focus(options){focused.push(options)}};
  const crumb={textContent:''};
  const context={
    document:{
      querySelectorAll(selector){return selector==='.view'?views:navItems},
      querySelector(selector){return selector==='#task-view h1'?taskHeading:null},
      getElementById(id){return id==='crumb'?crumb:null}
    },
    window:{matchMedia:()=>({matches:true}),scrollTo(){}},
    renderProgress(){}
  };
  const start=app.indexOf('function navigate(view)');
  const end=app.indexOf('function chooseNextTask(',start);
  assert.ok(start>=0&&end>start,'navigation function must exist');
  vm.runInNewContext(app.slice(start,end),context);
  context.navigate('task');
  assert.equal(views.find(view=>view.id==='task-view').classList.contains('active-view'),true);
  assert.equal(navItems.find(item=>item.dataset.view==='practice').attributes['aria-current'],'page');
  assert.equal(navItems.find(item=>item.dataset.view==='home').attributes['aria-current'],undefined);
  assert.equal(crumb.textContent,'Practice');
  assert.equal(taskHeading.attributes.tabindex,'-1');
  assert.equal(focused.length,1);
  assert.equal(focused[0].preventScroll,true);
});
