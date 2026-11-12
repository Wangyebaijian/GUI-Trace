/** UI-TARS Desktop action parser integration. Original parser: Apache-2.0 ByteDance. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { actionParser } = require('@ui-tars/action-parser');

export const upstream = Object.freeze({
  name: 'UI-TARS Desktop', repository: 'https://github.com/bytedance/UI-TARS-desktop',
  package: '@ui-tars/action-parser', version: '1.2.3', license: 'Apache-2.0',
  integration: 'Official actionParser parses native UI-TARS model responses into normalized local desktop actions.',
});

export function parseTarsAction(prediction, {width=1920,height=1080}={}) {
  // UI-TARS 1.0 normalized coordinate protocol (0..1000), explicitly stated in prompt.
  const { parsed } = actionParser({prediction, factor:1000, screenContext:{width,height},mode:'bc'});
  if (!parsed?.length || !parsed[0].action_type) throw new Error('UI-TARS 返回无法解析的动作');
  if (parsed.length !== 1) throw new Error('每步仅允许一个动作，模型返回了多个动作');
  const item=parsed[0], inputs=item.action_inputs || {}, p=inputs.start_coords || [], q=inputs.end_coords || [];
  const name=item.action_type;
  let action;
  if (['click','left_single','left_click'].includes(name)) action={type:'click',x:p[0],y:p[1]};
  else if (['double_click','left_double'].includes(name)) action={type:'double_click',x:p[0],y:p[1]};
  else if (['right_click','right_single'].includes(name)) action={type:'right_click',x:p[0],y:p[1]};
  else if (['drag','select'].includes(name)) action={type:'drag',x:p[0],y:p[1],x2:q[0],y2:q[1]};
  else if (name==='type') action={type:'type',text:String(inputs.content || '').replace(/\\n/g,'\n')};
  else if (['hotkey','press'].includes(name)) action={type:'key',key:String(inputs.key || '').replace(/\s+/g,'+')};
  else if (name==='scroll') {
    const dir=String(inputs.direction || 'down').toLowerCase();
    if (!['up','down'].includes(dir)) throw new Error('当前桌面适配器只支持上下滚动');
    action={type:'scroll',x:p[0]??Math.round(width/2),y:p[1]??Math.round(height/2),dy:dir==='up'?-4:4};
  } else if (['finished','done'].includes(name)) action={type:'done'};
  else if (['call_user','fail'].includes(name)) action={type:'fail',reason:inputs.content || '模型请求人工接管'};
  else if (name==='wait') action={type:'wait'};
  else throw new Error(`不支持的 UI-TARS 动作：${name}`);
  return {thought:item.thought || '',action,source:'@ui-tars/action-parser@1.2.3'};
}
