import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import {parseTarsAction} from '../server/upstream.mjs';
import {runVisionStep,validateDesktopAction} from '../server/desktop.mjs';

test('official UI-TARS parser maps normalized click, Unicode text, macOS shortcuts and terminal action',()=>{
 const parsed=parseTarsAction("Thought: select field\nAction: click(start_box='(500, 250)')",{width:1728,height:1117});
 assert.deepEqual(parsed.action,{type:'click',x:864,y:279.25});
 assert.equal(parsed.source,'@ui-tars/action-parser@1.2.3');
 assert.equal(parseTarsAction("Thought: type\nAction: type(content='历史恢复')").action.text,'历史恢复');
 assert.equal(parseTarsAction("Thought: save\nAction: hotkey(key='cmd s')").action.key,'cmd+s');
 assert.equal(parseTarsAction("Thought: save as\nAction: hotkey(key='cmd shift s')").action.key,'cmd+shift+s');
 assert.equal(parseTarsAction('Thought: complete\nAction: finished()').action.type,'done');
});

test('desktop action validation rejects arbitrary execution, wrong apps, and coordinates',()=>{
 assert.throws(()=>validateDesktopAction({type:'shell',text:'echo test'}),/不支持/);
 assert.throws(()=>validateDesktopAction({type:'open_app',app:'Terminal'}),/允许列表/);
 assert.throws(()=>validateDesktopAction({type:'click',x:101,y:5},{width:100,height:100}),/超出/);
 assert.throws(()=>validateDesktopAction({type:'drag',x:1,y:1,x2:5,y2:NaN},{width:100,height:100}),/超出/);
 assert.throws(()=>validateDesktopAction({type:'scroll',x:1,y:1,dy:21},{width:100,height:100}),/滚动/);
 assert.throws(()=>validateDesktopAction({type:'key',key:'malicious+q'}),/修饰符/);
 assert.equal(validateDesktopAction({type:'key',key:'cmd+shift+s'}).key,'cmd+shift+s');
});

async function withMock(t,reply){
 let received;
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  received={url:req.url,headers:req.headers,body:JSON.parse(Buffer.concat(chunks).toString())};
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({choices:[{message:{content:reply}}],usage:{prompt_tokens:100,completion_tokens:12}}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 return {baseURL:`http://127.0.0.1:${server.address().port}/v1`,request:()=>received};
}

test('vision request detects actual image MIME for PNG, JPEG and WebP, preserves usage',async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'trace-desktop-test-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const files=[];
 for(const format of ['png','jpeg','webp']){
  // Misleading extension deliberately ensures MIME derives from bytes, not filename.
  const file=path.join(dir,`${format}.bin`);
  await sharp({create:{width:20,height:10,channels:3,background:'#113355'}}).toFormat(format).toFile(file);
  files.push({path:file,width:20,height:10,label:format});
 }
 const mock=await withMock(t,JSON.stringify({thought:'state checked',action:{type:'wait'}}));
 const result=await runVisionStep({baseURL:mock.baseURL,apiKey:'local-test-only',model:'test-json',task:'Test request',images:files,history:[]});
 assert.equal(result.action.type,'wait');assert.deepEqual(result.usage,{prompt_tokens:100,completion_tokens:12});
 const req=mock.request();assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers.authorization,'Bearer local-test-only');
 const images=req.body.messages[1].content.filter(x=>x.type==='image_url');
 assert.equal(images.length,3);
 for(const [index,format] of ['png','jpeg','webp'].entries()){
  assert.ok(images[index].image_url.url.startsWith(`data:image/${format};base64,`));
  const decoded=Buffer.from(images[index].image_url.url.split(',')[1],'base64');
  assert.equal((await sharp(decoded).metadata()).format,format);
 }
});

test('UI-TARS model invokes upstream parser on actual mocked model response',async(t)=>{
 const mock=await withMock(t,"Thought: focus\nAction: click(start_box='(250, 500)')");
 const image=await sharp({create:{width:100,height:100,channels:3,background:'#111111'}}).png().toBuffer();
 const result=await runVisionStep({baseURL:mock.baseURL,model:'ui-tars-1.0',task:'focus',images:[{dataUrl:`data:image/png;base64,${image.toString('base64')}`,width:100,height:100}]});
 assert.deepEqual(result.action,{type:'click',x:25,y:50});
 assert.equal(result.source,'@ui-tars/action-parser@1.2.3');
 assert.ok(mock.request().body.messages[0].content.includes('0–1000'));
});
