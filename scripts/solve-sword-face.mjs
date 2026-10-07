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
 const sword=visual.sword, gripBefore=visual.weaponGripReference.getWorldPosition(new THREE.Vector3());
 // Undo the preceding model-only -90 degree local-Y roll to restore its exact prior correction.
 const changed=new THREE.Quaternion().setFromEuler(new THREE.Euler(...c.fallback.modelTransform.rotation));
 const reverted=changed.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));
 sword.quaternion.copy(reverted);root.updateMatrixWorld(true);
 const oldDirection=new THREE.Vector3(0,1,0).transformDirection(sword.matrixWorld);
 const oldNormal=new THREE.Vector3(0,0,1).transformDirection(sword.matrixWorld);
 const down=new THREE.Vector3(0,-1,0),forward=new THREE.Vector3(0,0,-1);
 const qWorld=sword.getWorldQuaternion(new THREE.Quaternion());const axis=new THREE.Vector3(0,1,0).applyQuaternion(qWorld).normalize();const normal=new THREE.Vector3(0,0,1).applyQuaternion(qWorld).normalize();
 const target=forward.clone().addScaledVector(axis,-forward.dot(axis)).normalize();
 const roll=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(normal,target)),normal.dot(target));
 sword.quaternion.copy(reverted.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),roll)));root.updateMatrixWorld(true);
 const direction=new THREE.Vector3(0,1,0).transformDirection(sword.matrixWorld),face=new THREE.Vector3(0,0,1).transformDirection(sword.matrixWorld);
 const gripAfter=visual.weaponGripReference.getWorldPosition(new THREE.Vector3());
 const result={undoneLocalRollDegrees:-90,restoredCorrection:new THREE.Euler().setFromQuaternion(reverted,'XYZ').toArray().slice(0,3),previousDownDirection:oldDirection.toArray(),previousFaceNormal:oldNormal.toArray(),localRollDegrees:THREE.MathUtils.radToDeg(roll),finalRotation:sword.rotation.toArray().slice(0,3),longAxis:direction.toArray(),faceNormal:face.toArray(),downDot:direction.dot(down),forwardDot:face.dot(forward),gripDisplacement:gripBefore.distanceTo(gripAfter),socketPosition:c.socket.position};
 console.log(JSON.stringify(result));
 const p='src/PlayerWeaponConfig.js',source=readFileSync(p,'utf8');
 const current=JSON.stringify(c.fallback.modelTransform.rotation);
 const next=JSON.stringify(result.finalRotation);
 const at=source.indexOf(current);if(at<0)throw Error('Current model rotation changed unexpectedly; refusing write');
 writeFileSync(p,source.slice(0,at)+next+source.slice(at+current.length));writeFileSync('outputs/sword-face-forward-solution.json',JSON.stringify(result,null,2));
} finally {await server.close()}
