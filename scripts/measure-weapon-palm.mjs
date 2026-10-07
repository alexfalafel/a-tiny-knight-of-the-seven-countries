import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';
globalThis.self=globalThis;
globalThis.ProgressEvent ??= class {};
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});
try {
 const {PlayerVisual}=await server.ssrLoadModule('/src/PlayerVisual.js');
 PlayerVisual.prototype.loadProductionModel=function(){}; PlayerVisual.prototype.loadOptionalSword=function(){}; PlayerVisual.prototype.reportLoadedModel=function(){};
 const root=new THREE.Group(); root.position.z=9.5;
 const visual=new PlayerVisual(root);
 const bytes=readFileSync('public/assets/models/player/rat-knight.glb');
 const gltf=await new Promise((ok,no)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',ok,no));
 visual.installProductionModel(gltf); visual.animationController.update(.4);
 root.updateMatrixWorld(true);
 const hand=visual.glbSockets.rightHand; const inv=hand.matrixWorld.clone().invert(); const points=[];
 visual.importedModel.traverse(m=>{
 if(!m.isSkinnedMesh)return; m.skeleton.update();
 const inds=m.geometry.attributes.skinIndex, weights=m.geometry.attributes.skinWeight;
 console.log('bones',m.skeleton.bones.filter(b=>b.name.includes('RightHand')).map(b=>({name:b.name,p:b.position.toArray()})));
 for(let i=0;i<inds.count;i++){
 let w=0; for(let j=0;j<4;j++)if(m.skeleton.bones[inds.getComponent(i,j)].name.includes('RightHand'))w+=weights.getComponent(i,j);
 if(w<.75)continue;
 const world=m.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.matrixWorld);
 points.push({i,w,p:world.clone().applyMatrix4(inv).toArray(),world:world.toArray()});
 }
 });
 writeFileSync('outputs/hand-vertices.json',JSON.stringify(points));
 console.log('hand',hand.getWorldPosition(new THREE.Vector3()).toArray(),'count',points.length);
 for(let axis=0;axis<3;axis++){const a=points.map(p=>p.p[axis]).sort((a,b)=>a-b);console.log(axis,[0,.05,.1,.25,.5,.75,.9,.95,1].map(q=>a[Math.floor(q*(a.length-1))]));}
 const svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650" style="background:#eee">'];
 for(const [panel,axes] of [[0,[0,1]],[1,[2,1]]]){
 svg.push('<text x="'+(50+panel*500)+'" y="30">Hand local '+axes.join('/')+'; red = old grip</text>');
 for(const q of points)svg.push('<circle cx="'+(250+panel*500+q.p[axes[0]]*1800)+'" cy="'+(570-q.p[axes[1]]*1800)+'" r="2" fill="#245"/>');
 svg.push('<circle cx="'+(250+panel*500)+'" cy="'+(570-.09865*1800)+'" r="7" fill="red"/>');
 } svg.push('</svg>');writeFileSync('outputs/hand-points.svg',svg.join(''));
 // Measured palm slab: cuff ends at 0.105; separated digits begin at 0.175
 // along the actual wrist-to-middle landmark. See hand-points.svg.
 const distal=hand.children.find(b=>b.isBone).position.clone().normalize();
 const palmPoints=points.map(q=>new THREE.Vector3(...q.p)).filter(p=>p.dot(distal)>=.105 && p.dot(distal)<=.175);
 const center=new THREE.Box3().setFromPoints(palmPoints).getCenter(new THREE.Vector3());
 // Principal transverse direction from the palm surface covariance, projected
 // perpendicular to the measured wrist-to-finger direction (no hand-axis guess).
 const mean=palmPoints.reduce((a,p)=>a.add(p),new THREE.Vector3()).divideScalar(palmPoints.length);
 const transverse=palmPoints.map(p=>p.clone().sub(mean)).map(p=>p.addScaledVector(distal,-p.dot(distal)));
 let width=transverse[0].clone().normalize();
 for(let i=0;i<30;i++){const next=new THREE.Vector3();for(const p of transverse)next.addScaledVector(p,p.dot(width));width=next.normalize();}
 // Deterministic sign toward the positive side of the observed hand width.
 if(width.x<0)width.negate();
 const normal=new THREE.Vector3().crossVectors(width,distal).normalize();
 width.crossVectors(distal,normal).normalize();
 const frame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(width,distal,normal));
 const oldCombined=visual.glbSockets.weapon.quaternion.clone().multiply(visual.glbSockets.weaponMount.quaternion).multiply(visual.sword.quaternion);
 const correction=visual.glbSockets.weaponMount.quaternion.clone().invert().multiply(frame.clone().invert()).multiply(oldCombined);
 const result={method:'Hand skin weight >= .75; measured cuff-to-digit palm slab; local surface-bounds center; transverse covariance frame',vertices:palmPoints.length,palmLocal:center.toArray(),socketRotation:new THREE.Euler().setFromQuaternion(frame).toArray().slice(0,3),correctionRotation:new THREE.Euler().setFromQuaternion(correction).toArray().slice(0,3),palmWorld:center.clone().applyMatrix4(hand.matrixWorld).toArray()};
 writeFileSync('outputs/palm-solution.json',JSON.stringify(result,null,2));console.log('SOLUTION',JSON.stringify(result));
 console.log('blade',new THREE.Vector3(0,1,0).transformDirection(visual.sword.matrixWorld).toArray());
} finally{await server.close()}
