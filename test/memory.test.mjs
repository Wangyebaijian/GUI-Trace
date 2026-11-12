import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {TraceMemory,visualTokens} from '../server/memory.mjs';

async function fixture(t,{keyBudget=3}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ui-trace-memory-test-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const memory=new TraceMemory({dir,urlBase:'/runs/test',task:'恢复原始预算与恢复口令，处理日期冲突',keyBudget});
 const add=async(i,extra={})=>{
  const file=path.join(dir,`frame-${i}.png`);
  // Different real pixel images exercise thumbnail novelty and canvas encoding.
  const width=640,height=360,pixels=Buffer.alloc(width*height*3);
  for(let p=0;p<pixels.length;p++)pixels[p]=(p*17+(i*31)+(p>>7))%256;
  await sharp(pixels,{raw:{width,height,channels:3}}).png().toFile(file);
  return memory.add({file,title:`frame ${i}`,action:`action ${i}`,phase:`phase ${Math.floor(i/3)}`,observation:`当前修订 ${i}`,...extra});
 };
 return{dir,memory,add};
}

test('each live frame belongs exactly once to current, key originals, or chronological canvas',async t=>{
 const{memory,add}=await fixture(t);
 for(let i=1;i<=9;i++){
  await add(i,{events:i===1?['anchor']:i===5?['conflict']:[]});
  const s=memory.snapshot,parts=[s.currentId,...s.keys,...s.tiles.map(t=>t.id)];
  assert.equal(new Set(parts).size,i,'no duplicate frame in model image layout');
  assert.deepEqual([...parts].sort(),memory.frames.map(f=>f.id).sort(),'no frame omitted');
  assert.ok(!s.keys.includes(s.currentId));
  assert.ok(!s.tiles.some(t=>t.id===s.currentId));
  assert.ok(s.keys.length<=3);
  const tileSteps=s.tiles.map(t=>memory.frames.find(f=>f.id===t.id).step);
  assert.deepEqual(tileSteps,[...tileSteps].sort((a,b)=>a-b));
 }
 const s=memory.snapshot,metadata=await sharp(s.canvasPath).metadata();
 assert.equal(metadata.width,1536);assert.equal(metadata.height,864);assert.equal(metadata.format,'webp');
 for(const tile of s.tiles){assert.ok(tile.x>=0&&tile.y>=0);assert.ok(tile.x+tile.width<=1536);assert.ok(tile.y+tile.height<=864)}
});

test('image volume counters use real files and token estimates use the selected representation',async t=>{
 const{memory,add}=await fixture(t);
 for(let i=1;i<=7;i++)await add(i,{events:i===1?['anchor']:[]});
 const s=memory.snapshot,current=memory.frames.at(-1),stat=async p=>(await fs.stat(p)).size;
 const original=(await Promise.all(memory.frames.map(f=>stat(f.file)))).reduce((a,b)=>a+b,0);
 const selected=(await Promise.all(memory.keys.map(f=>stat(f.file)))).reduce((a,b)=>a+b,0)+await stat(current.file)+await stat(s.canvasPath);
 assert.equal(s.originalBytes,original);assert.equal(s.compressedBytes,selected);
 assert.equal(s.estimatedOriginalTokens,memory.frames.reduce((n,f)=>n+visualTokens(f.width,f.height),0));
 assert.equal(s.estimatedCompressedTokens,memory.keys.reduce((n,f)=>n+visualTokens(f.width,f.height),0)+visualTokens(current.width,current.height)+visualTokens(1536,864));
 assert.equal(s.savings,1-selected/original);
 const images=memory.imagesForModel();
 assert.equal(images[0].path,s.canvasPath);assert.equal(images.at(-1).path,current.file);
 assert.deepEqual(images.slice(1,-1).map(x=>x.path),memory.keys.map(x=>x.file));
 assert.match(images.at(-1).label,/当前桌面/);
 assert.equal(memory.public().canvasPath,undefined);
 assert.equal(memory.publicFrame(current).observation,undefined);
 assert.equal(memory.publicFrame(current).file,undefined);
});

test('early anchor remains available after current observations overwrite and delete its values',async t=>{
 const{memory,add}=await fixture(t);
 await add(1,{events:['anchor'],entities:['预算','恢复口令'],observation:'原始委托：预算 6800 元。供应商恢复口令 AURORA-X9Q7。'});
 // Current frame is protected separately and is not counted as a historical key yet.
 assert.throws(()=>memory.recallOriginal(),/不在保留记忆/);
 for(let i=2;i<=10;i++)await add(i,{events:i===6?['delete']:i%3===0?['conflict']:[],observation:i<6?'当前预算 5200 元':'原始笔记已删除；当前预算 5200 元'});
 assert.deepEqual(memory.recallOriginal(),{budget:6800,code:'AURORA-X9Q7',source:'F01'});
 assert.ok(memory.keys.some(f=>f.id==='F01'));
 assert.ok(memory.frames.at(-1).observation.includes('5200'));
 assert.ok(!memory.frames.at(-1).observation.includes('AURORA-X9Q7'));
 const a=memory.frames[0];assert.ok(a.reasons.some(r=>r.includes('原始约束')));
});

test('selector uses only observed past frames and keeps current original outside the key budget',async t=>{
 const{memory,add}=await fixture(t);
 await add(1);assert.deepEqual(memory.snapshot.keys,[]);assert.equal(memory.snapshot.canvasUrl,null);
 await add(2,{events:['anchor','conflict','recover']});
 assert.deepEqual(memory.snapshot.keys,['F01']);assert.equal(memory.frames[1].key,false);
 assert.equal(memory.frames[1].score,99);
 await add(3);assert.ok(memory.snapshot.keys.includes('F02'));
 assert.equal(memory.snapshot.currentId,'F03');
 assert.ok(memory.snapshot.keys.every(id=>Number(id.slice(1))<3));
});

test('zero key budget puts even an anchor in the canvas and a singleton uses the full grid',async t=>{
 const{memory,add}=await fixture(t,{keyBudget:0});
 await add(1,{events:['anchor'],observation:'预算 6800 元；恢复口令 AURORA-ABCD。'});
 await add(2);
 const s=memory.snapshot;
 assert.deepEqual(s.keys,[]);assert.equal(s.compressedCount,1);
 assert.equal(s.columns,1);assert.equal(s.rows,1);
 assert.deepEqual(s.tiles,[{id:'F01',x:0,y:0,width:1536,height:864}]);
 assert.equal(s.currentId,'F02');
 assert.deepEqual(memory.imagesForModel().map(x=>x.path),[s.canvasPath,memory.frames[1].file]);
 assert.throws(()=>memory.recallOriginal(),/不在保留记忆/);
});

test('sparse tiny inputs report negative savings when the fixed-size canvas expands data',async t=>{
 const{dir,memory}=await fixture(t,{keyBudget:0});
 for(let i=1;i<=2;i++){
  const file=path.join(dir,`tiny-${i}.png`);
  await sharp({create:{width:16,height:16,channels:3,background:i===1?'#445566':'#778899'}}).png().toFile(file);
  await memory.add({file,title:`tiny ${i}`,action:'observe',phase:'test'});
 }
 const s=memory.snapshot;
 assert.ok(s.compressedBytes>s.originalBytes,'fixed canvas encoding expands these tiny source images');
 assert.ok(s.savings<0,'expansion must not be hidden by a zero clamp');
 assert.equal(s.savings,1-s.compressedBytes/s.originalBytes);
 assert.equal(memory.public().savings,s.savings);
});
