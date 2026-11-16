import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const baseBank=JSON.parse(readFileSync(new URL('../data/practice-bank.json',import.meta.url),'utf8'));
const extendedBank=JSON.parse(readFileSync(new URL('../data/extended-practice-bank.json',import.meta.url),'utf8'));
const bank={...baseBank,tasks:[...baseBank.tasks,...extendedBank.tasks]};
const expectedExams=['IELTS Academic','PTE Academic'];
const expectedSkills=['Listening','Reading','Writing','Speaking'];

test('rights-noted practice bank gives both exams and every skill multiple original tasks',()=>{
  assert.equal(bank.schemaVersion,1);
  assert.equal(new Set(bank.tasks.map(task=>task.id)).size,bank.tasks.length,'task IDs must be unique');
  assert.ok(bank.tasks.length>=57,'the familiarisation library should cover the current set of exam task types');
  for(const exam of expectedExams){
    for(const skill of expectedSkills){
      const matches=bank.tasks.filter(task=>task.exam===exam&&task.skill===skill);
      assert.ok(matches.length>=4,`expected at least four tasks for ${exam} ${skill}`);
      const taskTexts=matches.map(task=>(task.prompt||task.passage||task.audioScript||'').trim().toLowerCase());
      assert.equal(new Set(taskTexts).size,taskTexts.length,`task prompts should not repeat for ${exam} ${skill}`);
      const questionStems=matches.flatMap(task=>(task.questions||[]).map(question=>question.question.trim().toLowerCase()));
      assert.equal(new Set(questionStems).size,questionStems.length,`objective question stems should not repeat for ${exam} ${skill}`);
    }
  }
  for(const task of bank.tasks){
    assert.ok(task.title&&task.format,`${task.id} needs a title and task format`);
    assert.match(task.source,/original FluentPath/i,`${task.id} needs an original-content source note`);
    assert.match(task.rights,/created for this project/i,`${task.id} needs a rights note`);
    assert.ok(task.prompt||task.passage||task.audioScript,`${task.id} needs learner-facing content`);
    if(task.questions)assert.ok(task.questions.length>=3,`${task.id} needs at least three objective questions`);
    for(const question of task.questions||[]){
      const kind=question.kind||'single';
      if(kind==='multi'){
        assert.ok(Array.isArray(question.options)&&question.options.length>=2,`${task.id} needs answer options`);
        assert.ok(Array.isArray(question.answerIndices)&&question.answerIndices.length>0&&question.answerIndices.every(index=>Number.isInteger(index)&&index>=0&&index<question.options.length),`${task.id} has invalid multi-select answers`);
      }else if(kind==='matching'){
        assert.ok(Array.isArray(question.items)&&question.items.length>0&&Array.isArray(question.options)&&question.options.length>=2,`${task.id} needs matching items and options`);
        assert.ok(Array.isArray(question.answerIndices)&&question.answerIndices.length===question.items.length&&question.answerIndices.every(index=>Number.isInteger(index)&&index>=0&&index<question.options.length),`${task.id} has invalid matching answers`);
      }else if(kind==='text'){
        assert.ok(question.answerText||Array.isArray(question.acceptedAnswers),`${task.id} needs accepted text answers`);
      }else if(kind==='order'){
        assert.ok(Array.isArray(question.items)&&Array.isArray(question.answerOrder)&&question.answerOrder.length===question.items.length,`${task.id} needs a complete ordering key`);
      }else if(kind==='highlight'){
        assert.ok(Array.isArray(question.tokens)&&Array.isArray(question.answerIndices)&&question.answerIndices.every(index=>Number.isInteger(index)&&index>=0&&index<question.tokens.length),`${task.id} needs valid highlighted-word answers`);
      }else{
        assert.ok(Array.isArray(question.options)&&question.options.length>=2,`${task.id} needs answer options`);
        assert.ok(Number.isInteger(question.answerIndex)&&question.answerIndex>=0&&question.answerIndex<question.options.length,`${task.id} has an invalid answer index`);
      }
      assert.ok(question.explanation,`${task.id} needs an answer explanation`);
    }
  }
  const pteFormats=bank.tasks.filter(task=>task.exam==='PTE Academic').map(task=>task.format).join('\n').toLowerCase();
  for(const format of ['read aloud','repeat sentence','describe image','retell lecture','answer short question','summarize group discussion','respond to a situation','summarize written text','write essay','fill in the blanks (dropdown)','multiple choice, multiple answers','reorder paragraph','fill in the blanks (drag and drop)','multiple choice, single answer','summarize spoken text','fill in the blanks (type in)','highlight correct summary','select missing word','highlight incorrect words','write from dictation']){
    assert.ok(pteFormats.includes(format),`PTE familiarisation bank should cover ${format}`);
  }
});
