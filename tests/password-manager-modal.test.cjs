'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const html=fs.readFileSync(path.resolve(__dirname, '../index.html'),'utf8');
const app=html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert(app.includes("const APP_VERSION = '0.3.6'"));
assert(html.includes('html.password-picker-hidden #app'));
const start=app.indexOf('// Native password/autofill pickers can briefly hide');
const end=app.indexOf("window.addEventListener('pagehide'",start);
assert(start>0 && end>start);
const handlers=app.slice(start,end);
const results=[];
function run(name,scenario){
 let now=1000000,seq=0;
 const activeTimers=new Map(),events={},windowEvents={},classes=new Set();
 let passwordModal=true,modalOpen=true,passwordFocus=true,hidden=false,unlocked=true,lastActivity=now,lockCalls=[],closeCalls=0;
 const pwd={tagName:'INPUT',type:'password'};
 const dummy={tagName:'BUTTON',type:'button'};
 const modalRoot={classList:{contains:x=>x==='open'&&modalOpen},contains:x=>x===pwd};
 const document={get hidden(){return hidden},activeElement:pwd,documentElement:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},addEventListener:(name,fn)=>events[name]=fn};
 const window={addEventListener:(name,fn)=>windowEvents[name]=fn};
 const DateFake={now:()=>now};
 const ctx={document,window,Date:DateFake,modalRoot, setTimeout:(cb,delay)=>{const id=++seq;activeTimers.set(id,{cb,at:now+delay});return id},clearTimeout:id=>activeTimers.delete(id),
 get unlocked(){return unlocked},set unlocked(v){unlocked=v},get lastActivity(){return lastActivity},set lastActivity(v){lastActivity=v},
 $:(s)=>s==='input[type="password"]'&&passwordModal ? pwd : null,
 lock:(reason)=>{lockCalls.push(reason);unlocked=false;vm.runInContext('clearPasswordPickerHold()',context)},
 closeModal:()=>{closeCalls++;modalOpen=false}
 };
 const context=vm.createContext(ctx);
 vm.runInContext(handlers,context,{filename:'real-app-visibility.js'});
 function advance(ms){now+=ms; let due=[...activeTimers].filter(([id,t])=>t.at<=now);for (const [id,t] of due){activeTimers.delete(id);t.cb();}}
 const api={
 showHidden:()=>{hidden=true;events.visibilitychange()},showVisible:()=>{hidden=false;events.visibilitychange()},
 pressEsc:()=>windowEvents.keydown({key:'Escape'}),
 changeFocus:(kind)=>{document.activeElement=kind==='password'?pwd:dummy},
 advance,classes,activeTimers,locks:()=>lockCalls,closes:()=>closeCalls,
 setPasswordModal:v=>passwordModal=v,setModalOpen:v=>modalOpen=v,
 setUnlocked:v=>unlocked=v, setLastActivity:age=>lastActivity=now-age,
 unlocked:()=>unlocked,now:()=>now
 };
 scenario(api);
 results.push(name);console.log('PASS',name)
}
run('password picker temporarily hides app, modal and unlock preserved', x=>{
 x.showHidden();assert.equal(x.locks().length,0);assert(x.classes.has('password-picker-hidden'));
 x.advance(350);x.showVisible();assert.equal(x.locks().length,0);assert(!x.classes.has('password-picker-hidden'));assert(x.unlocked());
});
run('password modal Escape does not dismiss',x=>{x.pressEsc();assert.equal(x.closes(),0)});
run('ordinary modal Escape closes',x=>{x.setPasswordModal(false);x.pressEsc();assert.equal(x.closes(),1)});
run('non-password focused background locks immediately',x=>{x.changeFocus('button');x.showHidden();assert.equal(x.locks().length,1)});
run('inactive password UI hidden for 20 seconds locks',x=>{x.showHidden();x.advance(20000);assert.equal(x.locks().length,1);assert(!x.classes.has('password-picker-hidden'))});
run('return after grace locks even if timer delayed',x=>{x.showHidden();x.advance(21000);x.showVisible();assert.equal(x.locks().length,1)});
run('return under grace with 5min idle locks',x=>{x.setLastActivity(300000);x.showHidden();x.advance(250);x.showVisible();assert.equal(x.locks().length,1)});
run('regular background with no modal locks immediately',x=>{x.setModalOpen(false);x.showHidden();assert.equal(x.locks().length,1)});
run('return under grace updates activity and preserves data',x=>{x.showHidden();x.advance(15000);x.showVisible();assert.equal(x.locks().length,0);x.advance(4000);assert.equal(x.locks().length,0)});
// modalRoot onclick is separate from global listener; ensure bounded source guard is present and syntactically sane.
assert(html.includes('modalRoot.onclick = e => { if (e.target === modalRoot && !$(\'input[type="password"]\', modal))'));
assert(html.includes("function lock(reason = 'PINを入力してください') { clearPasswordPickerHold();"));
console.log('PASS password dialog backdrop guard and lock cleanup source checks');
console.log('TOTAL',results.length+1,'PASS');
