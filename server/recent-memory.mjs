import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {visualTokens} from './memory.mjs';

// Controlled recency baseline. The decision memory is exactly the latest five
// observations, including the current frame. Earlier frames remain audit-only.
export class RecentMemory {
 constructor({dir,urlBase,task}){
  this.dir=dir;this.urlBase=urlBase;this.task=task;this.windowSize=5;
  this.frames=[];this.keys=[];this.retained=[];
  this.snapshot={policy:'recent5',windowSize:5,canvasUrl:null,keys:[],recent:[],retainedIds:[],currentId:null,originalBytes:0,compressedBytes:0,savings:0,estimatedOriginalTokens:0,estimatedCompressedTokens:0,compressedCount:0,droppedCount:0,columns:0,rows:0,tiles:[]};
 }
 async add({file,title,action,phase,observation='',events=[],entities=[]}){
  const meta=await sharp(file).metadata(),bytes=(await fs.stat(file)).size;
  const frame={id:'F'+String(this.frames.length+1).padStart(2,'0'),step:this.frames.length+1,url:this.urlBase+'/'+path.basename(file),file,title,action,phase,observation,events,entities,timestamp:Date.now(),score:0,novelty:0,reasons:[],width:meta.width,height:meta.height,bytes,key:false,retained:true};
  this.frames.push(frame);this.rebuild();return this.publicFrame(frame);
 }
 rebuild(){
  this.retained=this.frames.slice(-this.windowSize);
  const retainedIds=new Set(this.retained.map(f=>f.id)),current=this.frames.at(-1);
  for(const frame of this.frames){
   frame.retained=retainedIds.has(frame.id);frame.key=false;
   frame.reasons=[frame.retained?'位于最近 5 帧窗口内，保留原图':'已离开最近 5 帧窗口，仅留作审计，不进入决策记忆'];
  }
  const originalBytes=this.frames.reduce((n,f)=>n+f.bytes,0),compressedBytes=this.retained.reduce((n,f)=>n+f.bytes,0);
  this.snapshot={policy:'recent5',windowSize:5,canvasUrl:null,keys:[],recent:this.retained.filter(f=>f!==current).map(f=>f.id),retainedIds:this.retained.map(f=>f.id),currentId:current?.id||null,originalBytes,compressedBytes,savings:originalBytes?1-compressedBytes/originalBytes:0,estimatedOriginalTokens:this.frames.reduce((n,f)=>n+visualTokens(f.width,f.height),0),estimatedCompressedTokens:this.retained.reduce((n,f)=>n+visualTokens(f.width,f.height),0),compressedCount:0,droppedCount:this.frames.length-this.retained.length,columns:0,rows:0,tiles:[]};
  return this.snapshot;
 }
 publicFrame(frame){const{file,observation,...safe}=frame;return safe;}
 public(){return{...this.snapshot};}
 recallOriginal(){
  // Use only the same five observations whose screenshots enter the decision
  // context. Never inspect the audit-only prefix, event labels, or task text.
  for(const frame of [...this.retained].reverse()){
   const budget=frame.observation.match(/预算\s*(\d+)\s*元/),code=frame.observation.match(/AURORA-[A-Z0-9]+/);
   // Only the run-specific code requires old observations: the original budget
   // is already present in the task prompt and can be supplied by the caller.
   if(code)return{found:true,...(budget?{budget:Number(budget[1])}:{}),code:code[0],source:frame.id};
  }
  return{found:false,reason:'最近 5 帧决策记忆中没有恢复口令，已移出的审计帧不可用于恢复；原始预算仍可从任务指令读取。',availableFrames:this.retained.map(f=>f.id)};
 }
 imagesForModel(){
  const current=this.frames.at(-1);
  return this.retained.map(frame=>({path:frame.file,width:frame.width,height:frame.height,label:frame===current?'当前桌面，所有操作坐标必须来自这张图':'最近窗口历史帧 '+frame.id+'：'+frame.title+'；仅供回忆，不可用于当前坐标点击'}));
 }
}
