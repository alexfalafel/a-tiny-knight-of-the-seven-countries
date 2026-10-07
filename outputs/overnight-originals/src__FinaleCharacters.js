import * as THREE from "three";
import { sharedGeometry } from "./SceneOptimization.js";

function mesh(parent, geometry, material, position, scale = null) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position);
  if (scale) part.scale.set(...scale);
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

export function createDragonQueen(scene) {
  const queen = new THREE.Group();
  queen.name = "Dragon Queen Placeholder";
  queen.position.set(30, 1.35, -37.25);
  queen.rotation.y = Math.PI;
  scene.add(queen);

  const dress = new THREE.MeshStandardMaterial({ color: 0x382a35, roughness: .72, metalness: .08 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8a6c45, roughness: .5, metalness: .46 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd0b7a6, roughness: .76 });
  const hair = new THREE.MeshStandardMaterial({ color: 0xbfc4c5, roughness: .63, metalness: .08 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xd9d1b2, metalness: .66, roughness: .3 });

  // One grouped, seated silhouette with replaceable head, body, arm, and hair parts.
  mesh(queen, sharedGeometry(THREE.CylinderGeometry, .38, .82, 1.65, 10), dress, [0, .85, 0]);
  mesh(queen, sharedGeometry(THREE.SphereGeometry, 1, 14, 10), dress, [0, 1.78, 0], [.54, .72, .37]);
  mesh(queen, sharedGeometry(THREE.BoxGeometry, .54, .25, .92), dress, [0, .37, -.22]);
  for (const side of [-1, 1]) mesh(queen, sharedGeometry(THREE.CapsuleGeometry, .13, .83, 4, 8), dress, [side * .24, .4, -.63], [.86, 1, 1]);
  mesh(queen, sharedGeometry(THREE.CylinderGeometry, .105, .12, .28, 10), skin, [0, 2.43, 0]);

  queen.head = new THREE.Group();
  queen.head.position.set(0, 2.88, -.015);
  queen.add(queen.head);
  mesh(queen.head, sharedGeometry(THREE.SphereGeometry, 1, 14, 12), skin, [0, 0, 0], [.36, .45, .32]);
  mesh(queen.head, sharedGeometry(THREE.SphereGeometry, 1, 14, 10), hair, [0, .12, .105], [.4, .48, .36]);
  mesh(queen.head, sharedGeometry(THREE.SphereGeometry, 1, 12, 10), hair, [0, -.42, .25], [.38, .68, .3]);
  const eye = new THREE.MeshStandardMaterial({ color: 0x554c4b, roughness: .44 });
  for (const side of [-1, 1]) {
    mesh(queen.head, sharedGeometry(THREE.CapsuleGeometry, .105, .75, 4, 7), hair, [side * .3, -.38, .12], [.88, 1, 1]);
    mesh(queen.head, sharedGeometry(THREE.SphereGeometry, .035, 8, 6), eye, [side * .135, .015, -.285]);
  }
  const queenCrownSocket = new THREE.Group();
  queenCrownSocket.position.set(0, .45, .02);
  queen.head.add(queenCrownSocket);
  queen.crownSocket = queenCrownSocket;

  queen.leftArm = new THREE.Group(); queen.leftArm.position.set(-.47, 2.12, 0); queen.add(queen.leftArm);
  queen.rightArm = new THREE.Group(); queen.rightArm.position.set(.47, 2.12, 0); queen.add(queen.rightArm);
  for (const [side, arm] of [[-1, queen.leftArm], [1, queen.rightArm]]) {
    mesh(arm, sharedGeometry(THREE.CapsuleGeometry, .12, .67, 4, 8), dress, [side * .03, -.4, -.08], [.92, 1, 1]);
    mesh(arm, sharedGeometry(THREE.SphereGeometry, .14, 10, 8), skin, [side * .08, -.8, -.1]);
  }

  // Small circlet gives her head a royal read before the reconstructed crown arrives.
  mesh(queen.head, sharedGeometry(THREE.TorusGeometry, .34, .035, 6, 18), silver, [0, .31, 0]).rotation.x = Math.PI / 2;
  mesh(queen.head, sharedGeometry(THREE.ConeGeometry, .075, .28, 5), silver, [-.2, .47, 0]);
  mesh(queen.head, sharedGeometry(THREE.ConeGeometry, .075, .28, 5), silver, [.2, .47, 0]);
  mesh(queen, sharedGeometry(THREE.BoxGeometry, 1.05, .08, .1), trim, [0, 2.0, .02]);
  return queen;
}

export function createDragonSilhouette(scene) {
  const root = new THREE.Group();
  root.name = "The Ashen Dragon";
  // This controller origin is the head center used by lock-on and sword contact.
  root.position.set(51, 4.56, -31);
  root.visible = false;
  scene.add(root);
  const scales = new THREE.MeshStandardMaterial({ color: 0x111416, roughness: .7, metalness: .18 });
  const underside = new THREE.MeshStandardMaterial({ color: 0x382521, roughness: .8 });
  const ember = new THREE.MeshStandardMaterial({ color: 0xd4311e, emissive: 0x921208, emissiveIntensity: 2.2, roughness: .35 });
  const anatomy = new THREE.Group();
  anatomy.position.y = -3.06;
  anatomy.rotation.y = Math.PI / 2;
  anatomy.scale.setScalar(1.7);
  root.add(anatomy);
  const head = new THREE.Group(); head.position.set(0, 1.8, 0); anatomy.add(head);
  mesh(head, sharedGeometry(THREE.SphereGeometry, 1, 16, 12), scales, [0, 0, 0], [2.05, 1.55, 1.85]);
  mesh(head, sharedGeometry(THREE.SphereGeometry, 1, 14, 10), underside, [0, -.72, -.63], [1.28, .6, 1.1]);
  const eyes = [];
  const horns = [];
  for (const side of [-1, 1]) {
    eyes.push(mesh(head, sharedGeometry(THREE.SphereGeometry, .15, 10, 8), ember, [side * .82, .22, -.98], [1, .64, .55]));
    const horn = mesh(head, sharedGeometry(THREE.ConeGeometry, .36, 1.65, 7), scales, [side * 1.22, 1.4, .05]);
    horn.rotation.z = side * -.24;
    horns.push(horn);
    mesh(head, sharedGeometry(THREE.SphereGeometry, .11, 8, 6), ember, [side * .35, -.23, -1.18], [1, .7, .6]);
  }
  const mouthGlow = mesh(head, sharedGeometry(THREE.SphereGeometry, .48, 10, 8), ember, [0, -.63, -1.18], [1.25, .5, .7]);
  mouthGlow.visible = false;

  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -.3, .2), new THREE.Vector3(0, -.25, 1.7), new THREE.Vector3(0, -.5, 3.5), new THREE.Vector3(0, -.9, 5.1),
  ]);
  mesh(anatomy, new THREE.TubeGeometry(neckCurve, 10, 1.22, 9, false), scales, [0, 0, 0]);
  const body = mesh(anatomy, sharedGeometry(THREE.CapsuleGeometry, 1.45, 4.2, 5, 10), scales, [0, -1.8, 6.5], [1.15, 1, 1.3]);
  body.rotation.x = Math.PI / 2;
  mesh(anatomy, sharedGeometry(THREE.SphereGeometry, 1, 12, 8), underside, [0, -2.65, 3.4], [1.1, .48, 2.8]);

  const wings = [];
  const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x231b1b, side: THREE.DoubleSide, roughness: .8 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(side * 1.2, -.4, 4.2); anatomy.add(wing);
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([0,0,0,side*5.4,1.1,.15,side*3.8,-1.4,.3, 0,0,0,side*3.8,-1.4,.3,side*1.9,-1.6,.8, 0,0,0,side*1.9,-1.6,.8,side*.4,-.2,1.2]);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
    wing.add(new THREE.Mesh(geometry, wingMaterial));
    for (const [x, y, z] of [[side*5.4,1.1,.15], [side*3.8,-1.4,.3], [side*1.9,-1.6,.8]]) {
      const spar = mesh(wing, sharedGeometry(THREE.CylinderGeometry, .1, .16, Math.hypot(x, y), 5), scales, [x*.5, y*.5, z*.5]);
      spar.rotation.z = Math.atan2(x, y);
    }
    wings.push(wing);
  }
  const claws = [];
  for (const side of [-1, 1]) {
    const claw = new THREE.Group(); claw.position.set(side * 1.35, -2.25, 2.6); anatomy.add(claw);
    mesh(claw, sharedGeometry(THREE.SphereGeometry, .65, 10, 8), scales, [0, 0, 0], [1.15, .7, 1.2]);
    for (const offset of [-.42, 0, .42]) {
      const talon = mesh(claw, sharedGeometry(THREE.ConeGeometry, .17, .74, 5), underside, [offset, -.42, -.3]);
      talon.rotation.x = Math.PI;
    }
    claws.push(claw);
  }
  const tail = new THREE.Group(); tail.position.set(0, -1.4, 9.2); anatomy.add(tail);
  const tailMesh = mesh(tail, sharedGeometry(THREE.CapsuleGeometry, .55, 4.8, 4, 8), scales, [0, -.25, 0]); tailMesh.rotation.x = Math.PI / 2;
  const tailTip = mesh(tail, sharedGeometry(THREE.ConeGeometry, .7, 1.9, 6), scales, [0, -.25, 3.3]); tailTip.rotation.x = Math.PI / 2;
  root.userData.anatomy = anatomy;
  root.userData.head = head;
  root.userData.eyes = eyes;
  root.userData.horns = horns;
  root.userData.wings = wings;
  root.userData.claws = claws;
  root.userData.mouthGlow = mouthGlow;
  root.userData.emberMaterial = ember;
  root.userData.basePosition = new THREE.Vector3(44.7, 4.56, -31);
  root.userData.revealStart = new THREE.Vector3(51, 4.56, -31);
  return root;
}
