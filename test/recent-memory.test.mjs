import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {RecentMemory} from '../server/recent-memory.mjs';
import {TraceMemory,visualTokens} from '../server/memory.mjs';

async function setup(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ui-trace-recent-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const recentDir=path.join(root,'recent'),traceDir=path.join(root,'trace');
 await fs.mkdir(recentDir);await fs.mkdir(traceDir);
 const task='恢复原始预算与恢复口令';
 const recent=new RecentMemory({dir:recentDir,urlBase:'/recent',task}),trace=new TraceMemory({dir:traceDir,urlBase:'/trace',task});
 const input=async(i,observation='当前预算 5200 元；早期笔记已删除。',events=[])=>{
  const file=path.join(root,`source-${i}.png`);
  await sharp({create:{width:640,height:360,channels:3,background:{r:i*20%256,g:i*35%256,b:i*55%256}}}).png().toFile(file);
  return{file,title:`观察 ${i}`,action:`操作 ${i}`,phase:`phase ${i%3}`,observation,events};
 };
 return{recent,trace,input};
}

test('recent5 represents exactly four past originals plus current, with no canvas or key selection',async t=>{
 const{recent,input}=await setup(t);
 for(let i=1;i<=8;i++){
  await recent.add(await input(i));
  const s=recent.public(),retained=recent.frames.slice(-5),current=recent.frames.at(-1);
  assert.deepEqual(s.retainedIds,retained.map(f=>f.id));
  assert.deepEqual(s.recent,retained.slice(0,-1).map(f=>f.id));
  assert.equal(s.currentId,current.id);assert.equal(s.windowSize,5);assert.equal(s.policy,'recent5');
  assert.deepEqual(s.keys,[]);assert.equal(s.canvasUrl,null);assert.deepEqual(s.tiles,[]);assert.equal(s.compressedCount,0);
  assert.equal(s.droppedCount,Math.max(0,i-5));
  assert.equal(recent.frames.filter(f=>f.retained).length,Math.min(i,5));
  assert.deepEqual(recent.frames.filter(f=>f.retained).map(f=>f.id),retained.map(f=>f.id));
  assert.deepEqual(recent.imagesForModel().map(f=>f.path),retained.map(f=>f.file));
  assert.match(recent.imagesForModel().at(-1).label,/当前桌面/);
 }
 const s=recent.public(),raw=recent.frames.reduce((n,f)=>n+f.bytes,0),selected=recent.retained.reduce((n,f)=>n+f.bytes,0);
 assert.equal(s.originalBytes,raw);assert.equal(s.compressedBytes,selected);assert.equal(s.savings,1-selected/raw);
 assert.equal(s.estimatedOriginalTokens,recent.frames.reduce((n,f)=>n+visualTokens(f.width,f.height),0));
 assert.equal(s.estimatedCompressedTokens,recent.retained.reduce((n,f)=>n+visualTokens(f.width,f.height),0));
 const old=recent.publicFrame(recent.frames[0]);assert.equal(old.retained,false);assert.equal(old.key,false);assert.equal(old.file,undefined);assert.equal(old.observation,undefined);
});

test('controlled ablation: recent5 succeeds before eviction, then loses the anchor while Tracelite retains it',async t=>{
 const{recent,trace,input}=await setup(t);
 for(let i=1;i<=6;i++){
  const sample=await input(i,i===1?'原始委托：预算 6800 元；恢复口令 AURORA-Z7K2。':'当前预算 5200 元；原始笔记已删除。',i===1?['anchor']:[]);
  await recent.add(sample);await trace.add(sample);
  if(i<=5)assert.deepEqual(recent.recallOriginal(),{found:true,budget:6800,code:'AURORA-Z7K2',source:'F01'},'baseline must recover while the evidence is inside its actual window');
 }
 const miss=recent.recallOriginal();
 assert.equal(miss.found,false);assert.deepEqual(miss.availableFrames,['F02','F03','F04','F05','F06']);
 assert.ok(recent.frames[0].observation.includes('AURORA-Z7K2'),'audit copy remains on disk/in RAM but must not be decision-accessible');
 const hit=trace.recallOriginal();assert.equal(hit.budget,6800);assert.equal(hit.code,'AURORA-Z7K2');assert.equal(hit.source,'F01');
 assert.ok(trace.keys.some(f=>f.id==='F01'));
});

test('recent5 can recover again from newly observed evidence, independent of event labels',async t=>{
 const{recent,input}=await setup(t);
 for(let i=1;i<=7;i++)await recent.add(await input(i));
 assert.equal(recent.recallOriginal().found,false);
 await recent.add(await input(8,'供应商再次给出：预算 9100 元；恢复口令 AURORA-NEW8。',[]));
 assert.deepEqual(recent.recallOriginal(),{found:true,budget:9100,code:'AURORA-NEW8',source:'F08'});
 assert.deepEqual(recent.public().keys,[],'recovery does not require an anchor label or key selector');
});

test('code alone in a recent observation is sufficient; prompt-known budget is not a hidden requirement',async t=>{
 const{recent,input}=await setup(t);
 for(let i=1;i<=6;i++)await recent.add(await input(i));
 await recent.add(await input(7,'供应商重发恢复口令 AURORA-CODE7；金额另见原始任务指令。'));
 const recovered=recent.recallOriginal();
 assert.equal(recovered.found,true);assert.equal(recovered.code,'AURORA-CODE7');assert.equal(recovered.source,'F07');
 assert.equal(recovered.budget,undefined,'caller may use the budget already given in the task');
});
