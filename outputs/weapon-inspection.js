import * as THREE from '/node_modules/three/build/three.module.js';
import {GLTFLoader} from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {PlayerVisual} from '/src/PlayerVisual.js';
PlayerVisual.prototype.loadProductionModel=function(){};
PlayerVisual.prototype.loadOptionalSword=function(){};
const scene=new THREE.Scene();scene.background=new THREE.Color('#777777');
scene.add(new THREE.HemisphereLight(0xffffff,0x555555,3));
const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,4,-3);scene.add(light);
const root=new THREE.Group();root.position.z=9.5;scene.add(root);
const visual=new PlayerVisual(root);
visual.installProductionModel(await new GLTFLoader().loadAsync('/assets/models/player/rat-knight.glb'));
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});renderer.setSize(1200,470);
const camera=new THREE.PerspectiveCamera(35,400/470,.01,50);
const views=[new THREE.Vector3(0,.05,-.72),new THREE.Vector3(.72,.05,0),new THREE.Vector3(.56,.12,-.56)];
let paused=true;visual.animationController.update(.4);
const states=['IDLE_ALL_FOURS','COMBAT_WALK','RUN_ALL_FOURS','AURA_WALK','ATTACK_1','ATTACK_2','ATTACK_3','DODGE','JUMP'];
for(const state of states){const b=document.createElement('button');b.textContent=state;b.onclick=()=>{visual.animationController.reset(state);visual.animationController.update(state==='IDLE_ALL_FOURS' ? .4 : .15);paused=true;};document.querySelector('#controls').append(b);}
const pause=document.createElement('button');pause.textContent='Pause / resume';pause.onclick=()=>paused=!paused;document.querySelector('#controls').append(pause);
let last=performance.now();
function render(now){const dt=Math.min((now-last)/1000,.04);last=now;if(!paused)visual.animationController.update(dt);scene.updateMatrixWorld(true);
const hand=visual.glbSockets.rightHand;
const grip=visual.weaponGripReference.getWorldPosition(new THREE.Vector3());
visual.updateWeaponDebug(); const palm=visual.weaponDebug.palmPosition.clone();
const blade=new THREE.Vector3(0,1,0).transformDirection(visual.sword.matrixWorld);
const target=grip.clone().add(new THREE.Vector3(0,.025,-.07));
renderer.setScissorTest(true);
for(let i=0;i<3;i++){renderer.setViewport(i*400,0,400,470);renderer.setScissor(i*400,0,400,470);camera.position.copy(target).add(views[i]);camera.lookAt(target);renderer.render(scene,camera);}
document.querySelector('#report').textContent=JSON.stringify({state:visual.animationController.currentState,paused,palm:palm.toArray(),grip:grip.toArray(),distance:palm.distanceTo(grip),blade:blade.toArray(),worldDown:[0,-1,0],dot:-blade.y,socket:visual.glbSockets.weapon.position.toArray(),correction:visual.sword.rotation.toArray().slice(0,3)},null,2);
requestAnimationFrame(render);}requestAnimationFrame(render);
