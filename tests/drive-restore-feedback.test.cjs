'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname,'index.html'),'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const a = script.indexOf('async function showDriveRestore() {');
const b = script.indexOf('\nfunction showExport() {',a);
assert(a !== -1 && b > a);
const source = script.slice(a,b);
assert(html.includes("const APP_VERSION = '0.3.6'"));
function createElement(tag, props={}, children=[]) {
 return {tag,props,children,handlers:{},disabled:!!props.disabled, value:props.value||'',isConnected:true,textContent:props.text||'',
   append(...items){this.children.push(...items)},replaceChildren(...items){this.children=[...items]},
   addEventListener(type, handler){this.handlers[type]=handler},
   setAttribute(name,val){this.attrs ||= {}; this.attrs[name]=val},
   querySelectorAll(q){const found=[]; function visit(node){if(!node||typeof node!=='object')return;if(q==='button'&&node.tag==='button')found.push(node);for(const c of node.children||[])visit(c)}visit(this);return found}
 };
}
function testEnvironment(opts={}) {
 const events=[];const elements=[];let modal,restored=null;let confirmed=opts.confirm!==false;let fakeData={cards:[{id:'original'}],services:[{id:'serviceA'}]};
 const payload={cards:[{id:'restored'},{id:'restoredB'}],services:[{id:'serviceB'}],transfers:[],locations:[],migrationChecks:[]};
 const h=(tag,props={},...children)=>{const el=createElement(tag,props,children);elements.push(el);return el};
 const btn=(label,click)=>{const el=h('button',{text:label});el.click=click;return el};
 const field=(label,inner)=>{const el=h('div',{label});el.control=inner;return el};
 const $=(sel,node)=>{if(sel==='input')return node.control;return null};
 const input=(type,val,props={})=>h('input',{...props,type,value:val});
 const ctx={h,btn,field,input,$,structuredClone,sessionToken:1,unlocked:true,isBusy:false,
  get dataset(){return fakeData},
  assert:(cond,msg)=>{if(!cond)throw Error(msg)},
  getDriveClientId:()=> 'client-id',driveOriginSupported:()=>true,
  requestDriveToken:()=>{events.push('oauth');return Promise.resolve('token')},
  getDriveAccountEmail:async()=>{events.push('account');return 'tester@example.com'},
  listDriveEncrypted:async()=>{events.push('list');return {items:[{id:'a12345678',name:'credit-cards-backup-20261122-123000.json.enc',createdTime:'today',size:100}],hasMore:false}},
  downloadDriveEncrypted:async()=>{events.push('download');if(opts.downloadError)throw Error('download failed');return {format:'mock'}},
  decryptBackup:async()=>{events.push('decrypt');if(opts.decryptError)throw Error('wrong passphrase');return {payload}},
  validatePayload:val=>val.payload,
  riskyNumbers:()=>[],
  confirmRisk:()=>{events.push('risk');return true},
  confirm:()=>{events.push('confirm');return confirmed},
  restoreDataset:async(value)=>{events.push('write');restored=value;fakeData=value},
  fail:(e)=>{events.push('error:'+e.message)},
  closeModal:()=>events.push('close'),
  showModal:(title,form)=>{modal=form;events.push('modal')},
  ensureDriveSdk:()=>Promise.resolve(),
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const el=(label)=>elements.find(e=>e.props?.text===label);
 const label=(label)=>elements.find(e=>e.props?.label===label);
 const info=()=>elements.find(e=>e.props?.class==='info' && e.props['aria-live']==='polite');
 const note=()=>elements.find(e=>e.props?.class==='fine' && e.textContent.includes('バックアップを読み込み'));
 const restore=()=>el('このバックアップで端末データを置き換える');
 const inspect=()=>el('選択したファイルを復号・検査');
 return {
  elements,events,el,label,info,note,restore,inspect,
  async init(){await ctx.showDriveRestore();await Promise.resolve();return this},
  async list(){await el('Googleアカウントを選んでバックアップを表示').click();},
  select(){el('選択').click()},
  async verify(){const pass=label('選択した暗号化バックアップのパスフレーズ').control;pass.value='correct passphrase';await inspect().click()},
  async apply(){await restore().click()},
  setConfirm:val=>{confirmed=val},
  getWritten:()=>restored,
  async changePass(){const input=label('選択した暗号化バックアップのパスフレーズ').control;input.value='changed';input.handlers.input()}
 };
}
(async()=>{
 let passed=0;
 async function run(name,test){await test();passed++;console.log('PASS',name)}
 await run('button is disabled until verified',async()=>{const e=await testEnvironment().init();assert(e.restore().disabled);assert(e.restore().hidden);assert(e.el('閉じる（復元しない）'));});
 await run('Drive list success explicitly means no restore',async()=>{const e=await testEnvironment().init();await e.list();assert.match(e.info().textContent,/一覧を取得しました/);assert.match(e.info().textContent,/まだ復元していません/);assert(e.restore().disabled);assert(!e.events.includes('write'))});
 await run('file selection alone cannot replace device',async()=>{const e=await testEnvironment().init();await e.list();e.select();assert(e.restore().disabled);assert.match(e.info().textContent,/まだ端末に復元していません/)});
 await run('decryption success explicit and actionable',async()=>{const e=await testEnvironment().init();await e.list();e.select();await e.verify();assert.match(e.info().textContent,/読み込み・復号・検査に成功/);assert.match(e.info().textContent,/まだ端末へ復元していません/);assert.match(e.info().textContent,/カード2枚/);assert(!e.restore().disabled);assert(!e.restore().hidden);assert(!e.events.includes('write'))});
 await run('button help explains destructive action',async()=>{const e=await testEnvironment().init();assert.match(e.note().textContent,/復元できません/);await e.list();e.select();await e.verify();assert(e.elements.some(n=>n.textContent.includes('全件置換し、PINも再設定')))});
 await run('confirm cancelled never writes',async()=>{const e=await testEnvironment({confirm:false}).init();await e.list();e.select();await e.verify();await e.apply();assert(e.events.includes('confirm'));assert(!e.events.includes('write'));assert(!e.restore().disabled)});
 await run('final confirmation writes verified backup once',async()=>{const e=await testEnvironment().init();await e.list();e.select();await e.verify();await e.apply();assert(e.events.includes('write'));assert.equal(e.getWritten().cards.length,2);assert.equal(e.events.filter(x=>x==='write').length,1)});
 await run('changing password invalidates previously verified data',async()=>{const e=await testEnvironment().init();await e.list();e.select();await e.verify();await e.changePass();assert(e.restore().disabled);assert(e.restore().hidden);assert.match(e.info().textContent,/検査結果を破棄/);await e.apply();assert(!e.events.includes('write'))});
 await run('decrypt error does not unlock restore',async()=>{const e=await testEnvironment({decryptError:true}).init();await e.list();e.select();await e.verify();assert.match(e.info().textContent,/失敗/);assert(e.restore().disabled);assert(!e.events.includes('write'))});
 await run('download error does not unlock restore',async()=>{const e=await testEnvironment({downloadError:true}).init();await e.list();e.select();await e.verify();assert(e.restore().disabled);assert(!e.events.includes('write'))});
 await run('successful transaction leads to explicit PIN setup success message',async()=>{const part=script.slice(script.indexOf('async function restoreDataset('),script.indexOf('function pinHash(',script.indexOf('async function restoreDataset(')));assert.match(part,/await txPromise; lock\(`✅ 復元完了：カード\$\{obj\.cards\.length\}枚/);assert.match(part,/新しい4桁PINを設定/)});
 await run('no destructive action on loading or inspecting',async()=>{const part=source.slice(0,source.indexOf("const restore = btn("));assert(!part.includes('restoreDataset('));});
 console.log('TOTAL',passed,'PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
