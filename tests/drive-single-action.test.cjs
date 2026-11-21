'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const script=html.split('<script>')[1].split('</script>')[0];
const section=script.slice(script.indexOf('async function showDriveUpload() {'),script.indexOf('async function showDriveRestore() {'));
assert(section.startsWith('async function showDriveUpload() {'));
assert(!section.includes('暗号化して準備する'),'old intermediate button must be absent');
assert(section.includes('Googleアカウントを選択して暗号化保存'));
assert(!section.includes('let prepared ='));
const ENC={format:'mock-encrypted-v1',ciphertext:'abc'};
function controlledPromise(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}}
function setup(opts={}){
 const trace=[];const elements=[];let modal=null, sdk=null,dialogIsOpen=true;
 let unlocked=true, isBusy=false, sessionToken=1, revision=10, diskReads=0;
 let appData={revision:10,cards:[{name:'dummy'}]};
 let confirmResponse=opts.confirm!==undefined?opts.confirm:true;
 const e=(type,attrs={})=>{const x={tagName:String(type).toUpperCase(),type,children:[],handlers:{},isConnected:true,disabled:false,textContent:'',value:'',className:'',...attrs,
  addEventListener(name,cb){this.handlers[name]=cb},append(...kids){this.children.push(...kids)},
  getAttribute(){return undefined}};elements.push(x);return x};
 const ctx={
  assert:(value,msg)=>{if(!value)throw new Error(msg)},
  get unlocked(){return unlocked},set unlocked(v){unlocked=v},
  get isBusy(){return isBusy},set isBusy(v){isBusy=v},
  get sessionToken(){return sessionToken},set sessionToken(v){sessionToken=v},
  get MAX_FILE_SIZE(){return opts.maxSize??8*1024*1024},
  TextEncoder,JSON,
  h:(tag,attrs,...kids)=>{const el=e(tag,attrs);el.append(...kids);return el},
  field:(label,el)=>{const wrapper=e('div',{label,control:el});wrapper.append(el);return wrapper},
  input:(type,value,attrs)=>e('input',{type,value,...attrs}),
  btn:(label,handler,type)=>e('button',{textContent:label,type:'button',onClick:handler}),
  $:(query,within)=>query==='input'?within?.control:null,
  getDriveClientId:()=>{trace.push('client_id');return'client-id'},
  driveOriginSupported:()=>true,
  dataPayload:()=>{trace.push('dataset');return {payloadVersion:1,exportedAt:'2026-01-01',dataset:structuredClone(appData)}},
  confirmRisk:()=>{trace.push('risk_check');return opts.allowRisk??true},
  requestDriveToken:(client,epoch)=>{trace.push('google_popup');if(opts.tokenError)return Promise.reject(new Error('denied'));return opts.pendingToken?opts.pendingToken.promise:Promise.resolve('token-a')},
  getDriveAccountEmail:async()=>{trace.push('account_email');if(opts.accountError)throw Error('no email');if(opts.lockOnAccount)unlocked=false;return'a@example.com'},
  getKV:async()=>{trace.push('disk_revision');diskReads++;if(opts.revisionMismatchAt===diskReads)return {revision:11};return {revision}},
  confirm:()=>{trace.push('destination_confirm');return confirmResponse},
  encryptedBackup:async(payload,pass)=>{trace.push('encrypt');if(opts.encryptionError)throw Error('encrypt failed');return ENC},
  decryptBackup:async()=>{trace.push('decrypt_verify');return opts.mismatchedDecoded?{wrong:true}:{payloadVersion:1,exportedAt:'2026-01-01',dataset:structuredClone(appData)}},
  driveBackupFilename:()=> 'credit-cards-backup-20261121-123000.json.enc',
  uploadDriveEncrypted:async(token,name,json)=>{trace.push('upload');if(opts.uploadError)throw Error('upload failed');return{id:'file123456',name}},
  downloadDriveEncrypted:async()=>{trace.push('download');return opts.readbackMismatch?{...ENC,ciphertext:'tampered'}:ENC},
  closeModal:()=>{trace.push('close');dialogIsOpen=false;for (const el of elements)el.isConnected=false},
  toast:()=>trace.push('toast'),
  fail:(err)=>trace.push('error:'+err.message),
  showModal:(title,form)=>{trace.push('modal');modal=form},
  ensureDriveSdk:()=>{trace.push('sdk_load');return opts.sdkError?Promise.reject(Error('SDK unavailable')):Promise.resolve()}
 };
 vm.createContext(ctx);vm.runInContext(section,ctx,{filename:'drive-upload-from-index.js'});
 return{
  ctx,trace,elements,
  async init(){await ctx.showDriveUpload();await Promise.resolve();sdk=true;return this},
  submit(){assert(modal?.handlers.submit);return modal.handlers.submit({preventDefault(){trace.push('submit')}})},
  values(p,q){let fields=elements.filter(x=>x.tagName==='DIV'&&x.control?.type==='password');assert.equal(fields.length,2);fields[0].control.value=p;fields[1].control.value=q},
  inputs:()=>elements.filter(x=>x.tagName==='INPUT'&&x.type==='password'),
  button:()=>elements.find(x=>x.tagName==='BUTTON'&&x.type==='submit'),
  setConfirm(v){confirmResponse=v},
  setRevision(n){revision=n},
  close:()=>!dialogIsOpen,
  sdkReady:()=>sdk
 };
}
(async()=>{
 let passed=0;
 const run=async(name,fn)=>{await fn();passed++;console.log('PASS',name)};
 await run('single submit button, no preparation button',async()=>{const x=await setup().init();assert.equal(x.elements.filter(e=>e.tagName==='BUTTON'&&e.type==='submit').length,1);assert.equal(x.button().disabled,false)});
 await run('requestAccessToken starts synchronously on submit before async encryption',async()=>{
  const p=controlledPromise(),x=await setup({pendingToken:p}).init();x.values('safe-passphrase-123','safe-passphrase-123');const task=x.submit();
  assert(x.trace.includes('google_popup'));assert(!x.trace.includes('encrypt'));assert.equal(x.button().disabled,true);
  p.resolve('token-a');await task;
  assert(x.trace.indexOf('google_popup')<x.trace.indexOf('encrypt'));
  assert(x.trace.indexOf('destination_confirm')<x.trace.indexOf('encrypt'));
  assert(x.trace.indexOf('encrypt')<x.trace.indexOf('upload'));
  assert(x.trace.indexOf('upload')<x.trace.indexOf('download'));
  assert(x.trace.includes('toast'));assert(x.close());assert(x.inputs().every(e=>e.value===''));
 });
 await run('mismatched passphrase prevents OAuth',async()=>{const x=await setup().init();x.values('safe-passphrase-123','safe-passphrase-124');await x.submit();assert(!x.trace.includes('google_popup'));assert(!x.trace.includes('upload'));assert.equal(x.button().disabled,false)});
 await run('too short passphrase prevents OAuth',async()=>{const x=await setup().init();x.values('123','123');await x.submit();assert(!x.trace.includes('google_popup'));assert.equal(x.button().disabled,false)});
 await run('OAuth rejected prevents encryption and upload',async()=>{const x=await setup({tokenError:true}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('encrypt'));assert(!x.trace.includes('upload'));assert.equal(x.button().disabled,false)});
 await run('cancel destination confirmation prevents upload, can retry',async()=>{const x=await setup({confirm:false}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('upload'));assert(!x.trace.includes('encrypt'));assert.equal(x.button().disabled,false);x.setConfirm(true);await x.submit();assert(x.trace.includes('upload'))});
 await run('untrusted account identity blocks upload',async()=>{const x=await setup({accountError:true}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('destination_confirm'));assert(!x.trace.includes('upload'))});
 await run('lock during Google account lookup blocks upload',async()=>{const x=await setup({lockOnAccount:true}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('encrypt'));assert(!x.trace.includes('upload'))});
 await run('revision drift before encryption blocks upload',async()=>{const x=await setup({revisionMismatchAt:1}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('encrypt'));assert(!x.trace.includes('upload'))});
 await run('revision drift after encryption blocks upload',async()=>{const x=await setup({revisionMismatchAt:2}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(x.trace.includes('encrypt'));assert(!x.trace.includes('upload'))});
 await run('risky-number denial blocks upload',async()=>{const x=await setup({allowRisk:false}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('encrypt'));assert(!x.trace.includes('upload'))});
 await run('encryption error safe retry',async()=>{const x=await setup({encryptionError:true}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('upload'));assert.equal(x.button().disabled,false)});
 await run('encryption roundtrip mismatch prevents upload',async()=>{const x=await setup({mismatchedDecoded:true}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('upload'))});
 await run('maximum encrypted payload enforced before upload',async()=>{const x=await setup({maxSize:4}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(!x.trace.includes('upload'))});
 await run('network upload failure disables retry',async()=>{const x=await setup({uploadError:true}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(x.trace.includes('upload'));assert.equal(x.button().disabled,true)});
 await run('readback mismatch disables retry',async()=>{const x=await setup({readbackMismatch:true}).init();x.values('safe-passphrase-123','safe-passphrase-123');await x.submit();assert(x.trace.includes('download'));assert.equal(x.button().disabled,true);assert(!x.trace.includes('toast'))});
 await run('double click does not double request OAuth',async()=>{const p=controlledPromise(),x=await setup({pendingToken:p}).init();x.values('safe-passphrase-123','safe-passphrase-123');const one=x.submit(),two=x.submit();await two;assert.equal(x.trace.filter(v=>v==='google_popup').length,1);p.resolve('token');await one;assert.equal(x.trace.filter(v=>v==='upload').length,1)});
 await run('SDK failure disables submit',async()=>{const x=await setup({sdkError:true}).init();assert.equal(x.button().disabled,true);assert(!x.trace.includes('google_popup'))});
 console.log('TOTAL',passed,'PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
