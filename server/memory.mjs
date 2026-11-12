import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const visualTokens=(w,h)=>85+170*Math.ceil(w/512)*Math.ceil(h/512);
export class TraceMemory {
 constructor({dir,urlBase,task,keyBudget=3}){this.dir=dir;this.urlBase=urlBase;this.task=task;this.keyBudget=keyBudget;this.frames=[];this.lastThumb=null;this.keys=[];this.snapshot={canvasUrl:null,keys:[],originalBytes:0,compressedBytes:0,savings:0,estimatedOriginalTokens:0,estimatedCompressedTokens:0,compressedCount:0};}
 async add({file,title,action,phase,observation='',events=[],entities=[]}){
  const meta=await sharp(file).metadata(),bytes=(await fs.stat(file)).size;
  const thumb=await sharp(file).resize(16,16,{fit:'fill'}).greyscale().raw().toBuffer();
  const novelty=this.lastThumb?thumb.reduce((s,v,i)=>s+Math.abs(v-this.lastThumb[i]),0)/(thumb.length*255):1;
  this.lastThumb=thumb;
  const reasons=[];let score=20+Math.min(18,novelty*100);
  const relevance=entities.filter(e=>this.task.includes(e)).length;score+=Math.min(12,relevance*3);
  if(relevance)reasons.push('与当前任务的 '+relevance+' 个实体相关');
  if(events.includes('anchor')){score+=45;reasons.push('首次出现、后续恢复需要的原始约束');}
  if(events.includes('conflict')){score+=35;reasons.push('新通知覆盖旧时间，存在时序冲突');}
  if(events.includes('delete')){score+=24;reasons.push('删除操作使早期信息离开当前界面');}
  if(events.includes('recover')){score+=28;reasons.push('长依赖恢复的决策证据');}
  if(events.includes('commit')){score+=16;reasons.push('已提交状态的完整界面');}
  if(novelty>.1)reasons.push('画面变化较大');
  if(!reasons.length)reasons.push('常规过渡帧，按时间顺序压入画布');
  const frame={id:'F'+String(this.frames.length+1).padStart(2,'0'),step:this.frames.length+1,url:this.urlBase+'/'+path.basename(file),file,title,action,phase,observation,events,entities,timestamp:Date.now(),score:Math.min(99,Math.round(score)),novelty:Number(novelty.toFixed(3)),reasons,width:meta.width,height:meta.height,bytes,key:false};
  this.frames.push(frame);await this.rebuild();return this.publicFrame(frame);
 }
 publicFrame(f){const{file,observation,...safe}=f;return safe;}
 select(){
  // Online, rule-based engineering policy. No future frames or benchmark answers.
  const history=this.frames.slice(0,-1),selected=[];
  const anchor=history.find(f=>f.events.includes('anchor'));
  if(anchor&&this.keyBudget>0)selected.push(anchor);
  while(selected.length<Math.min(this.keyBudget,history.length)){
   const candidates=history.filter(f=>!selected.includes(f));
   candidates.sort((a,b)=>this.rank(b,selected)-this.rank(a,selected));
   if(!candidates.length)break;selected.push(candidates[0]);
  }
  this.keys=selected.sort((a,b)=>a.step-b.step);
  this.frames.forEach(f=>f.key=this.keys.includes(f));
 }
 rank(f,selected){return f.score-(selected.some(k=>k.phase===f.phase)?20:0)-(this.frames.length-f.step)*.18;}
 async rebuild(){
  this.select();const current=this.frames.at(-1),compressed=this.frames.slice(0,-1).filter(f=>!f.key);
  let canvasBytes=0,canvasUrl=null,canvasPath=null,cols=0,rows=0,tiles=[];
  if(compressed.length){
   const W=1536,H=864;cols=Math.min(compressed.length,Math.ceil(Math.sqrt(compressed.length*W/H)));rows=Math.ceil(compressed.length/cols);
   const tw=Math.floor(W/cols),th=Math.floor(H/rows),gap=5,label=25;const parts=[];
   for(let i=0;i<compressed.length;i++){
    const f=compressed[i],left=(i%cols)*tw,top=Math.floor(i/cols)*th;
    const tile=await sharp(f.file).resize(tw-gap*2,Math.max(1,th-label-gap*2),{fit:'contain',background:'#111a29'}).png().toBuffer();
    parts.push({input:tile,left:left+gap,top:top+label});
    const lab=Buffer.from(`<svg width="${tw}" height="${label}"><rect width="100%" height="100%" fill="#172536"/><text x="8" y="17" font-size="12" font-family="monospace" fill="#7edace">${esc(f.id)} · STEP ${f.step} · ${f.events.includes('delete')?'DELETE':f.events.includes('conflict')?'REVISE':'TRACE'}</text></svg>`);
    parts.push({input:lab,left,top});tiles.push({id:f.id,x:left,y:top,width:tw,height:th});
   }
   canvasPath=path.join(this.dir,'canvas-'+String(this.frames.length).padStart(3,'0')+'.webp');
   await sharp({create:{width:W,height:H,channels:3,background:'#0b1421'}}).composite(parts).webp({quality:83}).toFile(canvasPath);
   canvasBytes=(await fs.stat(canvasPath)).size;canvasUrl=this.urlBase+'/'+path.basename(canvasPath);
  }
  const originalBytes=this.frames.reduce((n,f)=>n+f.bytes,0),compressedBytes=this.keys.reduce((n,f)=>n+f.bytes,0)+(current?.bytes||0)+canvasBytes;
  const estimatedOriginalTokens=this.frames.reduce((n,f)=>n+visualTokens(f.width,f.height),0),estimatedCompressedTokens=this.keys.reduce((n,f)=>n+visualTokens(f.width,f.height),0)+(current?visualTokens(current.width,current.height):0)+(compressed.length?visualTokens(1536,864):0);
  this.snapshot={canvasUrl,canvasPath,keys:this.keys.map(f=>f.id),originalBytes,compressedBytes,savings:originalBytes?1-compressedBytes/originalBytes:0,estimatedOriginalTokens,estimatedCompressedTokens,compressedCount:compressed.length,canvasWidth:1536,canvasHeight:864,columns:cols,rows,tiles,keyBudget:this.keyBudget,policy:'online-heuristic-v1',currentId:current?.id};
  return this.snapshot;
 }
 public(){const{canvasPath,...p}=this.snapshot;return p;}
 recallOriginal(){const f=this.keys.find(k=>k.events.includes('anchor'));if(!f)throw new Error('早期原始约束已不在保留记忆中');const budget=f.observation.match(/预算\s*(\d+)\s*元/),code=f.observation.match(/AURORA-[A-Z0-9]+/);if(!budget||!code)throw new Error('保留记忆缺少原始预算或恢复口令');return{budget:Number(budget[1]),code:code[0],source:f.id};}
 imagesForModel(){const out=[];if(this.snapshot.canvasPath)out.push({path:this.snapshot.canvasPath,label:'压缩历史画布；小图按时间先后排列，仅供回忆，不可用于当前坐标点击'});this.keys.forEach(f=>out.push({path:f.file,label:'关键历史节点 '+f.id+'：'+f.title+'；仅供回忆'}));const f=this.frames.at(-1);if(f)out.push({path:f.file,width:f.width,height:f.height,label:'当前桌面，所有操作坐标必须来自这张图'});return out;}
}
