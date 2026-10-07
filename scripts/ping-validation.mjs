import assert from 'node:assert/strict';
import { NetworkPing } from '../src/NetworkPing.js';
let localFetches = 0;
const local = new NetworkPing({ hostname:'localhost', pageUrl:'http://localhost:5173/', fetcher:async()=>{localFetches++;} });
assert.equal(local.update(0),'LOCAL');
for(let i=0;i<100;i++) assert.equal(local.update(i*16),'LOCAL');
assert.equal(localFetches,0,'Local development must not send fake ping requests');

let now=20, requests=[];
const remote = new NetworkPing({ hostname:'game.example', pageUrl:'https://game.example/castle', clock:()=>now,
  setTimer:()=>1, clearTimer:()=>{}, fetcher:(url,options)=>new Promise((resolve,reject)=>{
    requests.push({url,options,resolve,reject}); options.signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true});
  }) });
assert.equal(remote.update(0),'--');
for(let i=1;i<120;i++) remote.update(i*16);
await Promise.resolve();
assert.equal(requests.length,1,'No per-frame requests');
assert.equal(new URL(requests[0].url).origin,'https://game.example','Same-origin only');
assert(new URL(requests[0].url).searchParams.has('__ping'),'A unique query prevents cache reuse');
assert.equal(requests[0].options.method,'HEAD'); assert.equal(requests[0].options.cache,'no-store');
assert.equal(requests[0].options.credentials,'same-origin');
now=62; requests[0].resolve({ok:true}); await new Promise(resolve=>setImmediate(resolve));
assert.equal(remote.display,'42 ms');
for(let i=0;i<60;i++) remote.update(2000+i*8);
assert.equal(requests.length,1,'Samples are spaced about 2.5 seconds apart');
remote.update(2500); await Promise.resolve(); assert.equal(requests.length,2);
now=178; requests[1].resolve({ok:true}); await new Promise(resolve=>setImmediate(resolve));
assert.equal(remote.display,'68 ms','Displayed RTT is smoothed');
remote.update(5000); await Promise.resolve(); requests[2].reject(new Error('network failure'));
await new Promise(resolve=>setImmediate(resolve)); assert.equal(remote.display,'--');
console.log('PASS: local indicator makes no requests; remote RTT uses same-origin cache-busted HEAD requests at 2.5 s intervals, smooths results, and reports failure without logging.');
