import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createServer} from 'vite';
globalThis.self=globalThis;globalThis.ProgressEvent ??= class {};
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});
try{
 const {PlayerVisual}=await server.ssrLoadModule('/src/PlayerVisual.js');
 PlayerVisual.prototype.loadProductionModel=function(){};PlayerVisual.prototype.loadOptionalSword=function(){};PlayerVisual.prototype.reportLoadedModel=function(){};
 const root=new THREE.Group(),visual=new PlayerVisual(root);root.position.z=9.5;
 const bytes=readFileSync('public/assets/models/player/rat-knight.glb');
 visual.installProductionModel(await new Promise((ok,no)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',ok,no)));
 visual.animationController.update(.4);root.updateMatrixWorld(true);
 const sword=visual.sword, gripBefore=visual.weaponGripReference.getWorldPosition(new THREE.Vector3());
 const previous=new THREE.Vector3(0,1,0).transformDirection(sword.matrixWorld);
 const wrist=visual.glbSockets.rightHand.getWorldPosition(new THREE.Vector3());
 const away=gripBefore.clone().sub(wrist);away.y=0;away.normalize();
 const angle=THREE.MathUtils.degToRad(7.5);
 const target=away.multiplyScalar(Math.sin(angle));target.y=Math.cos(angle);
 const delta=new THREE.Quaternion().setFromUnitVectors(previous,target);
 const desired=delta.multiply(sword.getWorldQuaternion(new THREE.Quaternion()));
 const local=sword.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired);
 sword.quaternion.copy(local);root.updateMatrixWorld(true);
 const rotation=sword.rotation.toArray().slice(0,3);
 const result={previous:previous.toArray(),direction:new THREE.Vector3(0,1,0).transformDirection(sword.matrixWorld).toArray(),rotation,gripDisplacement:gripBefore.distanceTo(visual.weaponGripReference.getWorldPosition(new THREE.Vector3()))};
 console.log(JSON.stringify(result));writeFileSync('outputs/vertical-sword-solution.json',JSON.stringify(result,null,2));
 let config=readFileSync('src/PlayerWeaponConfig.js','utf8');
 config=config.replace(/(modelTransform: Object.freeze\(\{[\s\S]*?rotation: Object.freeze\()\[[^\]]+\]/,'$1'+JSON.stringify(rotation));writeFileSync('src/PlayerWeaponConfig.js',config);
}finally{await server.close()}
