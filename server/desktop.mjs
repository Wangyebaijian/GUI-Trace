import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { parseTarsAction, upstream } from './upstream.mjs';
const exec=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'vendor/native/DesktopControl.swift');
const binary=path.join(root,'vendor/native/desktop-control');
const APP_MAP=Object.freeze({'Finder':'Finder','Calculator':'Calculator','TextEdit':'TextEdit','System Settings':'System Settings','访达':'Finder','计算器':'Calculator','文本编辑':'TextEdit','系统设置':'System Settings'});
let compilation;
async function ensureHelper(){
 if(process.platform!=='darwin')throw new Error('本机桌面模式需要 macOS；浏览器演示不受影响。');
 if(!compilation)compilation=(async()=>{const src=await fs.stat(source);const bin=await fs.stat(binary).catch(()=>null);if(!bin || bin.mtimeMs<src.mtimeMs)await exec('/usr/bin/xcrun',['swiftc',source,'-O','-o',binary],{timeout:120000,maxBuffer:1024*1024});return binary;})().catch(e=>{compilation=null;throw e;});
 return compilation;
}
const instructions={accessibility:'系统设置 → 隐私与安全性 → 辅助功能，允许启动本服务的终端或桌面宿主控制电脑，随后重启服务。',screenRecording:'系统设置 → 隐私与安全性 → 屏幕与系统音频录制，允许启动本服务的终端或桌面宿主录屏，随后重启服务。'};
export async function desktopStatus(){
 if(process.platform!=='darwin')return {available:false,platform:process.platform,accessibility:false,screenRecording:false,instructions};
 try {const helper=await ensureHelper();const {stdout}=await exec(helper,['status'],{timeout:5000});return {available:true,platform:'darwin',...JSON.parse(stdout),instructions,upstream};}
 catch(e){return {available:false,platform:'darwin',accessibility:false,screenRecording:false,error:'本机控制组件未就绪：'+e.message,instructions,upstream};}
}
export async function openApp(app){
 const target=APP_MAP[app];if(!target)throw new Error('只允许打开访达、计算器、文本编辑或系统设置。');
 if(process.platform!=='darwin')throw new Error('打开本机应用需要 macOS。');
 await exec('/usr/bin/open',['-a',target],{timeout:10000});return {ok:true,app:target};
}
export async function captureDesktop(outPath){
 const state=await desktopStatus();if(!state.available)throw new Error(state.error || '桌面控制不可用');
 if(!state.screenRecording)throw new Error('尚未获得屏幕录制权限。'+instructions.screenRecording);
 await fs.mkdir(path.dirname(outPath),{recursive:true});const temp=outPath+'.capture.png';
 try {await exec('/usr/sbin/screencapture',['-x','-D','1',temp],{timeout:15000});
 await sharp(temp).resize(state.display.width,state.display.height,{fit:'fill'}).png().toFile(outPath);
 } finally {await fs.unlink(temp).catch(()=>{});}
 return {path:outPath,width:state.display.width,height:state.display.height};
}
export function validateDesktopAction(input, display={width:10000,height:10000}){
 if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('动作必须为 JSON 对象');
 const a={...input};const allowed=['click','double_click','right_click','drag','type','key','scroll','wait','done','fail','open_app'];
 if(!allowed.includes(a.type))throw new Error('不支持的本机动作：'+a.type);
 const checkPoint=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=display.width||y>=display.height)throw new Error('点击坐标超出当前主屏幕');};
 if(['click','double_click','right_click','drag','scroll'].includes(a.type))checkPoint(a.x,a.y);
 if(a.type==='drag')checkPoint(a.x2,a.y2);
 if(a.type==='type'&&(typeof a.text!=='string'||a.text.length>6000))throw new Error('输入文本为空或过长');
 if(a.type==='key'){
  if(typeof a.key!=='string'||a.key.length>60||!/^[a-zA-Z0-9+\[\]\-=;',.\/\\ ]+$/.test(a.key))throw new Error('无效按键');
  const parts=a.key.toLowerCase().split('+');const mods=new Set(['cmd','command','meta','ctrl','control','alt','option','shift']);
  if(parts.slice(0,-1).some(p=>!mods.has(p)))throw new Error('无效组合键修饰符');
 }
 if(a.type==='scroll'&&(!Number.isFinite(a.dy)||Math.abs(a.dy)>20))throw new Error('滚动幅度必须在 -20 到 20 之间');
 if(a.type==='open_app'&&!APP_MAP[a.app])throw new Error('应用不在允许列表');
 return a;
}
export async function executeDesktopAction(input){
 const state=await desktopStatus();const a=validateDesktopAction(input,state.display);
 if(['done','fail'].includes(a.type))return {ok:true,...a};
 if(a.type==='wait'){await new Promise(r=>setTimeout(r,1000));return {ok:true,type:a.type};}
 if(a.type==='open_app')return openApp(a.app);
 if(!state.accessibility)throw new Error('尚未获得辅助功能权限。'+instructions.accessibility);
 if(/terminal|iterm|password|keychain/i.test(state.frontmostApp || ''))throw new Error('当前前台为终端或凭据管理应用，桌面执行已停止。请切换至演示应用。');
 const {stdout}=await exec(await ensureHelper(),[a.type,JSON.stringify(a)],{timeout:15000,maxBuffer:1024*1024});
 const result=JSON.parse(stdout);if(result.error)throw new Error(result.error);return result;
}
function parseModelText(text,display){
 try {const candidate=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();const parsed=JSON.parse(candidate);
  if(parsed.action)return {thought:typeof parsed.thought==='string'?parsed.thought:'',action:validateDesktopAction(parsed.action,display),source:'OpenAI-compatible JSON'};
 }catch(e){if(!/Unexpected|JSON|position|property|token/i.test(e.message)&&!text.includes('Action:'))throw e;}
 const native=parseTarsAction(text,display);native.action=validateDesktopAction(native.action,display);return native;
}
export async function runVisionStep({baseURL,apiKey,model,task,images=[],history=[],signal}){
 if(!baseURL||!model)throw new Error('请先配置视觉模型地址和模型名');
 const u=new URL(baseURL);if(!['https:','http:'].includes(u.protocol))throw new Error('模型地址必须使用 HTTP(S)');
 if(u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('远程模型接口必须使用 HTTPS，本机 localhost 可用 HTTP。');
 const display=images.at(-1)?.width ? {width:images.at(-1).width,height:images.at(-1).height} : (await desktopStatus()).display;
 const content=[{type:'text',text:`任务：${String(task).slice(0,12000)}\n历史动作与决策说明：\n${typeof history==='string'?history:JSON.stringify(history)}\n下面的历史图片用于记忆参考，只有最后一张是当前屏幕。画布不是可操作屏幕。`}];
 for(const [i,img] of images.entries()){
  content.push({type:'text',text:img.label || (i===images.length-1?'当前屏幕':'历史截图')});
  let url=img.dataUrl;
  if(!url&&img.path){
   const buffer=await fs.readFile(img.path);
   const meta=await sharp(buffer).metadata();
   const mime={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[meta.format];
   if(!mime)throw new Error('截图格式必须为 PNG、JPEG 或 WebP');
   url=`data:${mime};base64,${buffer.toString('base64')}`;
  }
  if(!url || !/^data:image\/(png|jpeg|webp);base64,/.test(url))throw new Error('视觉模型只能接收已提供的本地截图');
  content.push({type:'image_url',image_url:{url,detail:'high'}});
 }
 if(!images.length)throw new Error('没有当前截图，不能执行视觉决策');
 const tars=/ui[-_]?tars/i.test(model);
 const format=tars?`输出 Thought: 简短说明，然后 Action: 一个 UI-TARS 动作。click(start_box='(x,y)')、type(content='文字')、hotkey(key='cmd s')、scroll(direction='down',start_box='(x,y)')、wait()、finished()。UI-TARS 坐标归一化到0–1000。`:
 `只输出 JSON：{"thought":"简短说明","action":{"type":"click","x":100,"y":100}}。动作 type 仅可为 click/double_click/right_click/drag(x,y,x2,y2)/type(text)/key(key 如 cmd+s)/scroll(x,y,dy 正数向下)/wait/done/fail/open_app(app)。坐标使用当前屏幕像素，宽 ${display?.width}、高 ${display?.height}。open_app 仅可 Finder、Calculator、TextEdit、System Settings。`;
 const messages=[{role:'system',content:`你是本机 GUI 智能体，一步只执行一个动作。禁止终端、命令行、脚本及访问凭据。不要发送消息、购物、删除用户原有文件或修改安全设置。当前任务如涉及这些操作，应 fail 并解释。历史画布只能提供上下文。区分旧状态与更新后的状态；先核验任务是否完成再 done。${format}`},{role:'user',content}];
 const endpoint=baseURL.replace(/\/$/,'')+(baseURL.replace(/\/$/,'').endsWith('/chat/completions')?'':'/chat/completions');
 const timeout=AbortSignal.timeout(120000);const combined=signal?AbortSignal.any([signal,timeout]):timeout;
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})},body:JSON.stringify({model,messages,max_tokens:1200}),signal:combined});
 if(!response.ok){await response.text().catch(()=>{});throw new Error(`模型请求失败 HTTP ${response.status}，请检查模型名、接口地址及额度。`);}
 const data=await response.json();const message=data.choices?.[0]?.message?.content;
 const text=Array.isArray(message)?message.filter(x=>x.type==='text').map(x=>x.text).join('\n'):message;
 if(typeof text!=='string'||!text.trim())throw new Error('视觉模型没有返回动作');
 return {...parseModelText(text,display),usage:data.usage || null};
}
export { upstream };
