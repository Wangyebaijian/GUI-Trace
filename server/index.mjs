import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TraceMemory} from './memory.mjs';
import {RecentMemory} from './recent-memory.mjs';
import {createDemo,DEMO_TASK} from './demo.mjs';
import {desktopStatus,openApp,captureDesktop,executeDesktopAction,runVisionStep,upstream} from './desktop.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),PORT=Number(process.env.PORT||4317),RUNS=path.join(ROOT,'runs');
await fs.mkdir(RUNS,{recursive:true});
const initial=()=>({status:'idle',mode:'demo',task:DEMO_TASK,step:0,totalSteps:28,elapsedMs:0,phase:'准备就绪',message:'运行本机长时序实验，观察记忆如何随任务演进。',frames:[],memory:{canvasUrl:null,keys:[],originalBytes:0,compressedBytes:0,savings:0,estimatedOriginalTokens:0,estimatedCompressedTokens:0,compressedCount:0},logs:[],taskState:{},result:null,error:null,upstream,runId:null,usage:{prompt_tokens:0,completion_tokens:0}});
let state=initial(),settings={baseURL:'',apiKey:'',model:''},active=null,comparisonJob=null;
// Reopen real saved evidence after a restart; never resume OS actions automatically.
for(const entry of (await fs.readdir(RUNS,{withFileTypes:true})).filter(e=>e.isDirectory()).sort((a,b)=>b.name.localeCompare(a.name))){
 try{const saved=JSON.parse(await fs.readFile(path.join(RUNS,entry.name,'run.json'),'utf8'));if(saved.frames?.length){state={...initial(),...saved,restored:true};if(['running','paused'].includes(state.status)){state.status='stopped';state.message='服务重启，已载入上次中断的运行记录';}break;}}catch{}
}
if(state.comparison?.status==='running'){state.comparison.status='stopped';state.comparison.note+=' 服务重启，中断的对比不会自动恢复。';}
const clients=new Set();const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
 const host=req.headers.host||'';
 if(!/^((127\.0\.0\.1|localhost)(:\d+)?|\[::1\](:\d+)?)$/.test(host))return res.status(403).json({error:'仅允许本机访问'});
 if(req.method!=='GET'&&req.headers.origin){try{const u=new URL(req.headers.origin);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.port!==String(PORT))return res.status(403).json({error:'拒绝跨站写入'});}catch{return res.status(403).end();}}
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');next();
});
app.use(express.json({limit:'64kb'}));
function emit(){const data='data: '+JSON.stringify(state)+'\n\n';for(const client of clients)client.write(data);}
function log(type,text){state.logs.push({time:Date.now(),type,text});if(state.logs.length>300)state.logs.shift();emit();}
function refreshMemory(run){state.frames=run.memory.frames.map(f=>run.memory.publicFrame(f));state.memory=run.memory.public();emit();}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function guard(run){while(active===run&&!run.stopped&&!run.comparison?.stop&&state.status==='paused')await delay(150);if(active!==run||run.stopped||run.comparison?.stop)throw new Error('RUN_STOPPED');}
async function pace(run,ms){let left=ms;while(left>0){await guard(run);const n=Math.min(150,left);await delay(n);left-=n;}}
async function persist(run){if(run)await fs.writeFile(path.join(run.dir,'run.json'),JSON.stringify(state,null,2));}
async function executeDemo(run){
 await guard(run);
 const demo=await createDemo({port:PORT,seed:run.seed,headless:process.env.DEMO_HEADLESS==='1',recall:()=>{try{return{found:true,...run.memory.recallOriginal()};}catch(e){return{found:false,reason:e.message};}},log});run.browser=demo.browser;state.totalSteps=demo.steps.length;
 log('system','真实本机 Chrome 工作台已启动。动作预编排，每阶段保留观察时间；不是速度基准测试。');
 for(const [i,s] of demo.steps.entries()){
  await guard(run);state.step=i+1;state.phase=s.phase;state.message=s.title;emit();
  await s.action();await delay(230);await guard(run);
  const file=path.join(run.dir,'frame-'+String(i+1).padStart(3,'0')+'.png');await demo.page.screenshot({path:file});
  await run.memory.add({file,title:s.title,action:s.title,phase:s.phase,observation:await demo.observation(),events:s.events,entities:s.entities});
  state.taskState=await demo.state();state.recovery=demo.recovery();refreshMemory(run);log('action',`${i+1}/${demo.steps.length} · ${s.title}`);
  await pace(run,4500);
 }
 state.result=await demo.check();state.status='completed';state.phase='实验完成';state.message=state.result.passed?'全部时序约束已通过核验':'任务结束，存在未通过的约束';
 log(state.result.passed?'success':'error',state.message);await persist(run);
 // Dedicated browser is closed after screenshots and the final state have been saved.
 await demo.browser.close();run.browser=null;
}
async function executeDesktop(run){
 const permission=await desktopStatus();state.permissions=permission;
 if(!permission.accessibility||!permission.screenRecording)throw new Error('请先开启屏幕录制与辅助功能权限，再运行本机任务。');
 state.totalSteps=60;state.phase='本机视觉执行';log('system','开始视觉模型自主执行。仅本次运行将选定记忆与当前屏幕发送至你配置的接口。');
 const history=[];
 for(let i=0;i<60;i++){
  await guard(run);state.step=i+1;state.message='捕获当前桌面，构造关键帧与压缩画布';emit();
  const file=path.join(run.dir,'frame-'+String(i+1).padStart(3,'0')+'.png');await captureDesktop(file);
  const prior=history.at(-1);const text=prior?.thought||'';
  const events=[];if(/恢复|原始|口令|记住/.test(text)&&i<4)events.push('anchor');if(/冲突|改为|修订|重新/.test(text))events.push('conflict');if(/删除|撤销/.test(text))events.push('delete');
  await run.memory.add({file,title:prior?text.slice(0,80)||prior.action.type:'初始桌面',action:prior?JSON.stringify(prior.action):'observe',phase:'本机视觉执行',observation:text,events});refreshMemory(run);
  state.message='视觉模型正在根据压缩记忆选择下一步动作';emit();
  const decision=await runVisionStep({...settings,task:state.task,images:run.memory.imagesForModel(),history,signal:run.abort.signal});
  await guard(run);log('thought',decision.thought||'模型返回动作');
  if(decision.usage){state.usage.prompt_tokens+=Number(decision.usage.prompt_tokens||0);state.usage.completion_tokens+=Number(decision.usage.completion_tokens||0);}
  if(decision.action.type==='done'){
   state.result={passed:null,checks:[],kind:'model-reported-completion',note:'模型报告完成；通用桌面任务未配置独立自动验收器，请核对实际结果。'};state.status='completed';state.message='模型报告任务完成，请核对实际界面';state.phase='执行结束';log('success',state.message);return;
  }
  if(decision.action.type==='fail')throw new Error('模型停止：'+decision.thought);
  await executeDesktopAction(decision.action);history.push({step:i+1,thought:decision.thought,action:decision.action});
  state.message=decision.thought;log('action',JSON.stringify(decision.action));await pace(run,1200);await persist(run);
 }
 state.status='stopped';state.message='已达到 60 步上限，请检查任务状态';log('system',state.message);
}
async function launch(mode,task,options={}){
 const reservation=active;
 const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+Math.random().toString(36).slice(2,6),dir=path.join(RUNS,id);await fs.mkdir(dir);
 const policy=options.policy==='recent5'?'recent5':'tracelite',MemoryClass=policy==='recent5'?RecentMemory:TraceMemory;
 state={...initial(),status:'running',mode,task,runId:id,policy,comparison:options.comparison||null,message:'正在启动本机工作区'};
 const run={id,dir,seed:options.seed||id,policy,comparison:options.comparison,stopped:!!(reservation?.starting&&reservation.stopped)||!!options.comparison?.stop,browser:null,abort:new AbortController(),memory:new MemoryClass({dir,urlBase:'/runs/'+id,task}),lastTick:Date.now()};active=run;emit();
 const timer=setInterval(()=>{const now=Date.now();if(state.status==='running')state.elapsedMs+=now-run.lastTick;run.lastTick=now;emit();},500);
 try{if(mode==='demo')await executeDemo(run);else await executeDesktop(run);}
 catch(e){if(e.message==='RUN_STOPPED'||run.stopped){state.status='stopped';state.message='执行已停止，已有记忆已保留';}else{state.status='error';state.error=String(e.message).slice(0,500);state.message=state.error;log('error',state.error);}}
 finally{clearInterval(timer);if(run.browser)await run.browser.close().catch(()=>{});state.elapsedMs=Math.round(state.elapsedMs);try{await persist(run);}finally{if(active===run)active=null;emit();}}
 return structuredClone(state);
}
async function runComparison(job){
 try{
  for(const policy of ['tracelite','recent5']){
   if(job.stop)break;job.phase=policy;job.currentRun=job.results.length+1;
   const saved=await launch('demo',DEMO_TASK,{policy,seed:job.seed,comparison:job});
   if(saved.status!=='completed'){job.status=saved.status==='error'?'error':'stopped';break;}
   job.results.push({policy,label:policy==='tracelite'?'GUI-Tracelite':'Recent5',elapsedMs:saved.elapsedMs,passed:saved.result.passed,checks:saved.result.checks,frames:saved.frames.length,originalBytes:saved.memory.originalBytes,compressedBytes:saved.memory.compressedBytes,estimatedOriginalTokens:saved.memory.estimatedOriginalTokens,estimatedCompressedTokens:saved.memory.estimatedCompressedTokens,recovery:saved.result.recovery,runId:saved.runId,canvasUrl:saved.memory.canvasUrl,retainedIds:saved.memory.retainedIds||[...saved.memory.keys,saved.memory.currentId]});
   emit();if(policy==='tracelite'&&!job.stop)await delay(1500);
  }
  if(job.results.length===2&&!job.stop)job.status='completed';else if(job.stop)job.status='stopped';
  job.totalElapsedMs=job.results.reduce((sum,r)=>sum+r.elapsedMs,0);state.comparison=job;
  await fs.mkdir(path.join(ROOT,'artifacts'),{recursive:true});await fs.writeFile(path.join(ROOT,'artifacts','对比实验.json'),JSON.stringify(job,null,2));
  for(const result of job.results){const p=path.join(RUNS,result.runId,'run.json');const saved=JSON.parse(await fs.readFile(p,'utf8'));saved.comparison=job;await fs.writeFile(p,JSON.stringify(saved,null,2));}
 }catch(e){job.status='error';job.error=e.message;state.error=e.message;state.status='error';if(active?.starting)active=null;}
 finally{comparisonJob=null;emit();}
}
app.get('/api/state',(_,res)=>res.json(state));
app.get('/api/events',(req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});clients.add(res);res.write('data: '+JSON.stringify(state)+'\n\n');const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(timer);clients.delete(res);});});
app.post('/api/run',async(req,res)=>{
 if(active||comparisonJob)return res.status(409).json({error:'已有运行中的任务，请先停止'});
 const mode=req.body.mode==='desktop'?'desktop':'demo',task=mode==='demo'?DEMO_TASK:String(req.body.task||'').trim();
 if(!task)return res.status(400).json({error:'请输入要执行的任务'});
 if(mode==='desktop'&&(!settings.baseURL||!settings.model))return res.status(400).json({error:'请先在设置页填写视觉模型地址与模型名'});
 // Reserve before asynchronous filesystem operations to reject concurrent starts.
 active={starting:true};launch(mode,task,{policy:req.body.policy}).catch(e=>{active=null;state.status='error';state.error=e.message;emit();});res.json({ok:true,mode});
});
app.post('/api/compare',(req,res)=>{
 if(active||comparisonJob)return res.status(409).json({error:'已有任务运行，请等待完成或停止'});
 const job={status:'running',phase:'tracelite',currentRun:1,totalRuns:2,results:[],seed:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),task:DEMO_TASK,stop:false,note:'受控记忆消融；相同步骤与随机口令。两组最多 5 张输入图像（GUI-Tracelite 为 3 关键帧＋1 画布＋当前；Recent5 为最近 5 帧含当前）。恢复只读取各自保留帧的同期观察，失败时不猜测口令。不是视觉模型自主任务基准。'};
 comparisonJob=job;active={starting:true};runComparison(job).catch(e=>{comparisonJob=null;active=null;state.status='error';state.error=e.message;emit();});res.json({ok:true});
});
app.post('/api/control',async(req,res)=>{const action=req.body.action;
 if(action==='pause'&&active&&!active.starting&&state.status==='running'){state.status='paused';log('system','已暂停；当前步骤完成后不会继续执行下一步。');}
 else if(action==='resume'&&active&&state.status==='paused'){state.status='running';log('system','恢复执行');}
 else if(action==='stop'&&(active||comparisonJob)){if(comparisonJob){comparisonJob.stop=true;comparisonJob.status='stopped';}if(active){active.stopped=true;active.abort?.abort();}state.status='stopped';state.message='正在停止当前任务及后续对比';emit();}
 else if(action==='reset'){if(active||comparisonJob)return res.status(409).json({error:'请先停止任务，等待停止完成后再重置'});state=initial();emit();}
 else return res.status(400).json({error:'当前状态不支持此操作'});res.json({ok:true});
});
app.get('/api/settings',async(_,res)=>res.json({baseURL:settings.baseURL,model:settings.model,hasApiKey:!!settings.apiKey,configured:!!settings.baseURL&&!!settings.model,permissions:await desktopStatus(),upstream}));
app.post('/api/settings',(req,res)=>{if(active||comparisonJob)return res.status(409).json({error:'请在任务结束后修改接口'});const{baseURL,apiKey,model}=req.body;
 try{if(baseURL){const u=new URL(baseURL);if(!['https:','http:'].includes(u.protocol))throw new Error();if(u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error();}settings={baseURL:String(baseURL||'').slice(0,1000),model:String(model||'').slice(0,200),apiKey:apiKey===undefined||apiKey===''?settings.apiKey:String(apiKey).slice(0,2000)};if(req.body.clearApiKey)settings.apiKey='';res.json({ok:true,hasApiKey:!!settings.apiKey});}catch{res.status(400).json({error:'请输入有效 HTTPS 接口；本机接口可使用 HTTP。'});}});
app.post('/api/open',async(req,res)=>{try{if(active||comparisonJob)return res.status(409).json({error:'任务执行期间请先暂停并停止，再手动打开应用'});res.json(await openApp(req.body.app));}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/export',(_,res)=>{res.setHeader('Content-Disposition','attachment; filename="UI-Trace-Effeciency-run.json"');res.type('json').send(JSON.stringify(state,null,2));});
app.get('/api/health',(_,res)=>res.json({ok:true,name:'UI-Trace-Effeciency',upstream}));
app.get('/workbench',(_,res)=>res.sendFile(path.join(ROOT,'server/workbench.html')));
app.use('/runs',express.static(RUNS,{dotfiles:'deny',index:false}));
app.use(express.static(path.join(ROOT,'dist')));
app.get('/',(_,res)=>res.sendFile(path.join(ROOT,'dist/index.html')));
app.use((e,req,res,next)=>res.status(400).json({error:e.message}));
const server=app.listen(PORT,'127.0.0.1',()=>console.log(`UI-Trace-Effeciency → http://127.0.0.1:${PORT}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(active?.abort)active.abort.abort();if(active?.browser)active.browser.close().catch(()=>{});server.close();process.exit(0)});
