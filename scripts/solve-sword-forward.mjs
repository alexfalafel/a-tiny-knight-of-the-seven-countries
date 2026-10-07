import {readFileSync,writeFileSync} from 'node:fs';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {createServer} from 'vite';
globalThis.self=globalThis;globalThis.ProgressEvent ??= class {};
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});
try {
 const {PlayerVisual,PLAYER_WEAPON_CONFIG:c}=await server.ssrLoadModule('/src/PlayerVisual.js');
 PlayerVisual.prototype.loadProductionModel=function(){};PlayerVisual.prototype.loadOptionalSword=function(){};PlayerVisual.prototype.reportLoadedModel=function(){};
 const root=new THREE.Group();root.position.z=9.5;const visual=new PlayerVisual(root);
 const bytes=readFileSync('public/assets/models/player/rat-knight.glb');
 visual.installProductionModel(await new Promise((ok,no)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',ok,no)));
 visual.animationController.update(.4);root.updateMatrixWorld(true);
 const sword=visual.sword, grip=visual.weaponGripReference;
 // The fallback handle is centered at the sword model origin; its blade tip is at .105 + .61.
 const gripBefore=grip.getWorldPosition(new THREE.Vector3());
 const tipBefore=sword.localToWorld(new THREE.Vector3(0,.715,0));
 const previous=tipBefore.clone().sub(gripBefore).normalize();
 const characterForward=new THREE.Vector3(0,0,-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize();
 const delta=new THREE.Quaternion().setFromUnitVectors(previous,characterForward);
 const desiredWorld=delta.multiply(sword.getWorldQuaternion(new THREE.Quaternion()));
 const parentWorld=sword.parent.getWorldQuaternion(new THREE.Quaternion());
 const finalLocal=parentWorld.invert().multiply(desiredWorld);
 sword.quaternion.copy(finalLocal);root.updateMatrixWorld(true);
 const gripAfter=grip.getWorldPosition(new THREE.Vector3());const tipAfter=sword.localToWorld(new THREE.Vector3(0,.715,0));
 const directionAfter=tipAfter.clone().sub(gripAfter).normalize();
 const result={characterForward:characterForward.toArray(),previousGripToTip:previous.toArray(),newGripToTip:directionAfter.toArray(),dot:directionAfter.dot(characterForward),finalRotation:new THREE.Euler().setFromQuaternion(finalLocal,'XYZ').toArray().slice(0,3),gripBefore:gripBefore.toArray(),gripAfter:gripAfter.toArray(),gripDisplacement:gripBefore.distanceTo(gripAfter),weaponSocketPosition:c.socket.position};
 if(result.dot<.99||result.gripDisplacement>1e-8)throw new Error('Alignment or grip-preservation check failed');
 const sourcePath='src/PlayerWeaponConfig.js',source=readFileSync(sourcePath,'utf8'),current=JSON.stringify(c.fallback.modelTransform.rotation),next=JSON.stringify(result.finalRotation);const at=source.indexOf(current);if(at<0)throw Error('Current model rotation mismatch; refusing write');writeFileSync(sourcePath,source.slice(0,at)+next+source.slice(at+current.length));
 writeFileSync('outputs/sword-forward-solution.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await server.close()}
