import * as THREE from "three";
import { batchRigidParts, DormantGroup } from "./SceneOptimization.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PlayerAnimationController } from "./PlayerAnimationController.js";
import { PLAYER_MODEL_SCALE, PLAYER_WORLD_SCALE } from "./PlayerScale.js";
import { PLAYER_WEAPON_CONFIG } from "./PlayerWeaponConfig.js";

export { PLAYER_WEAPON_CONFIG } from "./PlayerWeaponConfig.js";
export const WEAPON_STATES = Object.freeze({ SHEATHED: "SHEATHED", DRAWN: "DRAWN" });

export const PLAYER_VISUAL_CONFIG = Object.freeze({
  assetUrl: "/assets/models/player/rat-knight.glb",
  modelScale: PLAYER_MODEL_SCALE,
  worldScale: PLAYER_WORLD_SCALE,
  modelRotationY: Math.PI,
  modelOffsetY: 0.025,
  // Calibrated against the visible placeholder: the browser-loaded GLB bounds
  // are about 0.83 units tall, versus 0.80 units for the procedural fallback.
  crownSocketOffset: Object.freeze([0, 0.18, 0]),
  crownRotation: Object.freeze([0, 0, 0]),
  crownScale: 0.4,
});

const gltfLoader = new GLTFLoader();
const FUR = 0x73665e;
const FUR_LIGHT = 0x98877b;
const ARMOR = 0xd8dfe0;
const ARMOR_DARK = 0x859195;
const GOLD = 0xc1a66c;
const IVORY = 0xe7dfce;
const WALKING_STATES = new Set(["RUN_ALL_FOURS", "COMBAT_WALK", "AURA_WALK", "CLIMB_UP", "CLIMB_DOWN", "CLIMB_LEFT", "CLIMB_RIGHT", "CLIMB_SIDE"]);

export const FOOT_IK_CONFIG = Object.freeze({
  soleClearance: 0.003,
  rayStartHeight: 0.12,
  rayDistance: 0.58,
  positionSmoothing: 18,
  rotationSmoothing: 14,
  pelvisSmoothing: 8,
  maxPelvisOffset: 0.05,
  maxFootTilt: 0.28,
  movingWeight: 0.52,
  attackWeight: 0.28,
});
// Measured on the loaded rat GLB after the stationary idle clip has updated
// the skinned mesh. These are world-meter offsets for the current character.
export const PLAYER_FOOT_CONTACT = Object.freeze({
  leftAnkleToSole: 0.0421,
  rightAnkleToSole: 0.0454,
  soleClearance: FOOT_IK_CONFIG.soleClearance,
});
const FLOOR_SURFACES = Object.freeze({ greatHall: "greatHall-floor", royalKitchen: "royalKitchen-floor", armory: "armory-floor", dungeon: "dungeon-floor", royalChambers: "royalChambers-floor", throneRoom: "throneRoom-floor" });

function mesh(parent, geometry, material, position, scale = null) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(position[0], position[1], position[2]);
  if (scale) result.scale.set(scale[0], scale[1], scale[2]);
  result.castShadow = true; result.receiveShadow = true; parent.add(result);
  return result;
}

function sphere(parent, material, position, scale, geometry) { return mesh(parent, geometry, material, position, scale); }

function createBackSheathMount(parent, config, boneName) {
  const socket = new THREE.Object3D(); socket.name = "BackSheathSocket";
  socket.position.fromArray(config.socketPosition);
  socket.rotation.fromArray(config.socketRotation);
  socket.userData.boneName = boneName;
  parent.add(socket);
  const correction = new THREE.Object3D(); correction.name = "BackSheathCorrection";
  correction.position.fromArray(config.correctionPosition);
  correction.rotation.fromArray(config.correctionRotation);
  correction.scale.setScalar(config.correctionScale);
  socket.add(correction);
  return { socket, correction };
}

function createFootDebugMarkers(parent) {
  const group = new THREE.Group(); group.name = "FootIKDebugMarkers"; group.visible = false; parent.add(group);
  const geometry = new THREE.SphereGeometry(.025, 8, 6);
  const materials = {
    ground: new THREE.MeshBasicMaterial({ color: 0x36e36a, depthTest: false }),
    target: new THREE.MeshBasicMaterial({ color: 0xffdc35, depthTest: false }),
    ankle: new THREE.MeshBasicMaterial({ color: 0x35a7ff, depthTest: false }),
    sole: new THREE.MeshBasicMaterial({ color: 0xff3c36, depthTest: false }),
  };
  const markers = {};
  for (const side of ["left", "right"]) {
    markers[side] = {};
    for (const kind of Object.keys(materials)) {
      const marker = new THREE.Mesh(geometry, materials[kind]);
      marker.name = `${side}-${kind}-foot-debug`; marker.visible = false; marker.renderOrder = 1000;
      group.add(marker); markers[side][kind] = marker;
    }
  }
  return { group, markers };
}

function createWeaponDebugMarkers(parent) {
  const group = new THREE.Group(); group.name = "WeaponAlignmentDebug"; group.visible = false; parent.add(group);
  const geometry = new THREE.SphereGeometry(.018, 10, 8);
  const marker = (name, color) => {
    const item = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, depthTest: false }));
    item.name = name; item.renderOrder = 1002; group.add(item); return item;
  };
  return {
    group, palm: marker("RenderedPalmCenter-Green", 0x38ed65),
    grip: marker("CurrentSwordHandleCenter-Blue", 0x3c8dff),
    palmPosition: new THREE.Vector3(), socketPosition: new THREE.Vector3(), gripPosition: new THREE.Vector3(),
    palmGripDistance: null,
  };
}



function copyWeaponTransform(transform) {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: transform.scale,
  };
}


function makeShapeGeometry(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function createSword() {
  // Temporary asset contract: the handle is centered at this origin and +Y
  // runs from the pommel through the grip toward the blade tip.
  const sword = new THREE.Group(); sword.name = "ProceduralKnightSword";
  const steel = new THREE.MeshStandardMaterial({ color: 0xe5ebeb, metalness: .32, roughness: .34 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xc0cdcd, metalness: .35, roughness: .4 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x45372e, roughness: .78 });

  // A four-sided, tapered diamond section gives the blade a visible bevel
  // without a dense mesh or shader. Its point and fuller stay in one mesh.
  const bladeGeometry = new THREE.BufferGeometry();
  const stations = [
    { y: .045, halfWidth: .043, halfDepth: .012 },
    { y: .47, halfWidth: .032, halfDepth: .009 },
    { y: .61, halfWidth: 0, halfDepth: 0 },
  ];
  const bladeVertices = [];
  for (const { y, halfWidth, halfDepth } of stations) {
    bladeVertices.push(0, y, halfDepth, halfWidth, y, 0, 0, y, -halfDepth, -halfWidth, y, 0);
  }
  const bladeIndices = [];
  for (let row = 0; row < stations.length - 1; row++) {
    for (let side = 0; side < 4; side++) {
      const a = row * 4 + side, b = row * 4 + (side + 1) % 4;
      const c = (row + 1) * 4 + side, d = (row + 1) * 4 + (side + 1) % 4;
      bladeIndices.push(a, b, d, a, d, c);
    }
  }
  bladeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bladeVertices, 3));
  bladeGeometry.setIndex(bladeIndices); bladeGeometry.computeVertexNormals();
  const blade = mesh(sword, bladeGeometry, steel, [0, .105, 0]);
  blade.castShadow = false;

  // Swept guard arms, a leather-bound tapered grip, and restrained silver trim.
  const guard = mesh(sword, new THREE.BoxGeometry(.255, .036, .052), silver, [0, .13, 0]);
  guard.rotation.z = -.09;
  const guardEndL = mesh(sword, new THREE.SphereGeometry(.025, 8, 6), silver, [-.124, .118, 0], [.8, .85, 1]);
  const guardEndR = mesh(sword, new THREE.SphereGeometry(.025, 8, 6), silver, [.124, .142, 0], [.8, .85, 1]);
  guardEndL.castShadow = guardEndR.castShadow = false;
  const handle = mesh(sword, new THREE.CylinderGeometry(.023, .03, .19, 8), leather, [0, 0, 0]);
  handle.rotation.z = Math.PI;
  handle.name = "CurrentSwordHandle";
  const gripPoint = new THREE.Object3D(); gripPoint.name = "SwordGripPoint";
  // Cylinder handle center in its own geometry, independent of sword origin.
  handle.add(gripPoint);
  sword.userData.gripReference = gripPoint;
  for (let i = 0; i < 3; i++) {
    const band = mesh(sword, new THREE.CylinderGeometry(.031, .031, .012, 8), silver, [0, .06 - i * .057, 0]);
    band.castShadow = false;
  }
  const pommel = mesh(sword, new THREE.SphereGeometry(.043, 10, 8), silver, [0, -.113, 0], [1, .78, .82]);
  pommel.castShadow = false;
  return sword;
}

export function createFallbackRig(parent, {
  batch = true,
  weaponConfig = PLAYER_WEAPON_CONFIG,
} = {}) {
  const sphereGeometry = new THREE.SphereGeometry(1, 18, 14);
  const smallSphere = new THREE.SphereGeometry(1, 10, 8);
  const limbGeometry = new THREE.CapsuleGeometry(.052, .23, 3, 7);
  const plateGeometry = new THREE.SphereGeometry(1, 14, 10);
  const fur = new THREE.MeshStandardMaterial({ color: FUR, roughness: .91 });
  const furLight = new THREE.MeshStandardMaterial({ color: FUR_LIGHT, roughness: .87 });
  const innerEar = new THREE.MeshStandardMaterial({ color: 0x9e746d, roughness: .75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x292321, roughness: .45 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xc69d55, roughness: .28, metalness: .14 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x171615, roughness: .2 });
  const nose = new THREE.MeshStandardMaterial({ color: 0xa76e71, roughness: .45 });
  const silver = new THREE.MeshStandardMaterial({ color: ARMOR, metalness: .78, roughness: .28, side: THREE.DoubleSide });
  const silverEdge = new THREE.MeshStandardMaterial({ color: ARMOR_DARK, metalness: .7, roughness: .32 });
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: .7, roughness: .32 });
  const ivory = new THREE.MeshStandardMaterial({ color: IVORY, metalness: .04, roughness: .82, side: THREE.DoubleSide });

  const root = new DormantGroup(); root.name = "RatKnightFallback"; parent.add(root);
  const torso = new THREE.Group(); torso.name = "TorsoRig"; root.add(torso);
  // Long, narrow ribcage and hips keep the rat silhouette visible beneath armor.
  sphere(torso, fur, [0, 0, .025], [.225, .205, .47], sphereGeometry);
  sphere(torso, furLight, [0, -.065, -.245], [.164, .145, .255], sphereGeometry);
  sphere(torso, fur, [0, -.075, .275], [.205, .19, .245], sphereGeometry);
  const neck = mesh(torso, new THREE.CapsuleGeometry(.092, .22, 4, 10), fur, [0, .085, -.335]);
  neck.rotation.x = -.38;
  for (const side of [-1, 1]) sphere(torso, fur, [side * .145, -.1, .285], [.125, .16, .17], sphereGeometry);

  // One shaped, lightly raised breastplate follows the front of the narrow chest.
  mesh(torso, makeShapeGeometry([[-.155, -.145], [.155, -.145], [.13, .12], [.09, .205], [0, .225], [-.09, .205], [-.13, .12]]), silver, [0, .035, -.455]);
  const plateRidge = mesh(torso, new THREE.BoxGeometry(.012, .27, .018), silverEdge, [0, .055, -.462]);
  plateRidge.castShadow = false;
  sphere(torso, gold, [0, .176, -.464], [.026, .035, .016], smallSphere);
  mesh(torso, makeShapeGeometry([[-.145, -.15], [.145, -.15], [.12, .12], [0, .2], [-.12, .12]]), silver, [0, .015, .474]);
  mesh(torso, new THREE.BoxGeometry(.01, .25, .014), silverEdge, [0, .02, .485]);
  const belt = mesh(torso, new THREE.TorusGeometry(.188, .016, 6, 18), silverEdge, [0, -.145, .01]); belt.rotation.x = Math.PI / 2;
  sphere(torso, gold, [0, -.145, -.205], [.027, .035, .018], smallSphere);
  mesh(torso, makeShapeGeometry([[-.105, .08], [.105, .08], [.14, -.38], [-.14, -.38]]), ivory, [0, -.055, -.48]);
  const tabardTrim = mesh(torso, new THREE.BoxGeometry(.008, .4, .012), gold, [0, -.16, -.491]);
  tabardTrim.castShadow = false;

  const shoulders = [];
  for (const side of [-1, 1]) {
    const pad = sphere(torso, silver, [side * .235, .105, -.16], [.092, .105, .13], plateGeometry);
    sphere(torso, gold, [side * .25, .11, -.165], [.018, .035, .024], smallSphere);
    shoulders.push(pad);
  }

  const head = new THREE.Group(); head.name = "Head"; head.position.set(0, .115, -.49); torso.add(head);
  sphere(head, fur, [0, 0, 0], [.148, .158, .175], sphereGeometry);
  // A slim brow guard leaves ears, eyes, and the long muzzle fully readable.
  const brow = mesh(head, makeShapeGeometry([[-.13, .035], [.13, .035], [.105, .12], [0, .16], [-.105, .12]]), silver, [0, .035, -.137]);
  brow.castShadow = false;
  const muzzle = mesh(head, new THREE.ConeGeometry(.092, .28, 12), furLight, [0, -.045, -.205]);
  muzzle.rotation.x = -Math.PI / 2;
  sphere(head, nose, [0, -.043, -.35], [.031, .024, .022], smallSphere);
  for (const side of [-1, 1]) {
    const ear = sphere(head, fur, [side * .125, .15, .035], [.059, .105, .027], smallSphere);
    ear.rotation.z = -side * .16;
    const inner = sphere(head, innerEar, [side * .13, .152, .012], [.034, .071, .012], smallSphere);
    inner.rotation.z = -side * .16;
    sphere(head, eye, [side * .108, .012, -.105], [.027, .032, .018], smallSphere);
    sphere(head, pupil, [side * .108, .012, -.12], [.011, .019, .009], smallSphere);
    sphere(head, dark, [side * .065, -.09, -.25], [.011, .008, .024], smallSphere);
    const whisker = mesh(head, new THREE.CylinderGeometry(.0025, .0015, .21, 5), furLight, [side * .075, -.07, -.275]);
    whisker.rotation.z = side * .35; whisker.rotation.x = Math.PI / 2;
  }
  const crownSocket = new THREE.Object3D(); crownSocket.name = "CrownSocket"; crownSocket.position.set(0, .18, 0); head.add(crownSocket);

  const limbPivots = [];
  for (let i = 0; i < 4; i++) {
    const front = i < 2, side = i % 2 === 0 ? -1 : 1;
    const pivot = new THREE.Group(); pivot.name = front ? (side < 0 ? "Arm_L" : "Arm_R") : (side < 0 ? "Leg_L" : "Leg_R");
    pivot.position.set(side * (front ? .16 : .17), front ? -.02 : -.045, front ? -.22 : .27); torso.add(pivot);
    if (!front) sphere(pivot, fur, [0, -.075, 0], [.105, .13, .12], sphereGeometry);
    const limb = mesh(pivot, limbGeometry, fur, [0, -.17, 0]);
    const bracer = sphere(pivot, silver, [0, -.16, -.018], front ? [.057, .115, .052] : [.078, .12, .07], plateGeometry);
    sphere(pivot, gold, [0, -.235, -.022], [.06, .012, .055], smallSphere);
    const paw = sphere(pivot, furLight, [0, -.335, front ? -.045 : .04], front ? [.075, .045, .09] : [.11, .05, .14], smallSphere);
    sphere(paw, dark, [0, -.34, front ? -.118 : .1], [.018, .025, .025], smallSphere);
    limbPivots.push({ pivot, limb, bracer, paw, front, side, targetPosition: new THREE.Vector3(), targetRotationX: 0 });
  }
  const weaponSocket = new THREE.Object3D(); weaponSocket.name = "WeaponSocket";
  weaponSocket.position.fromArray(weaponConfig.fallback.socketPosition); limbPivots[1].pivot.add(weaponSocket);
  weaponSocket.rotation.fromArray(weaponConfig.fallback.socketRotation);
  const weaponMount = new THREE.Object3D(); weaponMount.name = "WeaponMount"; weaponSocket.add(weaponMount);
  const weaponVisual = new THREE.Group(); weaponVisual.name = "WeaponVisual"; weaponMount.add(weaponVisual);
  const backSheath = createBackSheathMount(torso, weaponConfig.backSheath, "FallbackTorso");

  const tail = new THREE.Group(); tail.name = "TailRig"; tail.position.set(0, -.12, .39); torso.add(tail);
  const tailSegments = [];
  let segmentParent = tail;
  for (let i = 0; i < 8; i++) {
    const segment = new THREE.Group(); segment.position.set(0, 0, i === 0 ? .025 : .105); segmentParent.add(segment);
    const radius = .042 * (1 - i / 9);
    const shape = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(.006, radius * .7), radius, .13, 8), furLight);
    shape.rotation.x = Math.PI / 2; shape.position.z = .065; shape.castShadow = true; shape.receiveShadow = true; segment.add(shape);
    tailSegments.push(segment); segmentParent = segment;
  }

  const cape = new THREE.Group(); cape.name = "IvoryCape"; cape.position.set(0, .07, .49); torso.add(cape);
  const capePanel = mesh(cape, makeShapeGeometry([[-.14, .1], [.14, .1], [.19, -.37], [0, -.48], [-.19, -.37]]), ivory, [0, 0, .02]);
  capePanel.castShadow = true;
  mesh(cape, new THREE.BoxGeometry(.025, .47, .015), gold, [0, -.17, .007]);

  const rig = { root, torso, head, limbPivots, tail, tailSegments, cape, crownSocket, weaponSocket, weaponMount, weaponVisual, backSheathSocket: backSheath.socket, backSheathCorrection: backSheath.correction, shoulders };
  rig.sword = createSword();
  weaponVisual.add(rig.sword);
  rig.sword.position.fromArray(weaponConfig.fallback.modelTransform.position);
  rig.sword.rotation.set(...weaponConfig.fallback.modelTransform.rotation);
  rig.sword.scale.setScalar(weaponConfig.fallback.modelTransform.scale);
  if (batch) {
    batchRigidParts(root);
    batchRigidParts(rig.sword);
  }
  rig.mode = "FOUR_LEG";
  return rig;
}

function normalizedName(name) { return name.toLowerCase().replace(/[^a-z0-9]/g, ""); }

export class PlayerVisual {
  constructor(gameplayRoot, config = PLAYER_VISUAL_CONFIG) {
    this.gameplayRoot = gameplayRoot;
    this.config = config;
    this.weaponConfig = PLAYER_WEAPON_CONFIG;
    this.root = new THREE.Group(); this.root.name = "PlayerVisualRoot"; this.root.position.y = config.modelOffsetY; this.root.scale.setScalar(config.worldScale); gameplayRoot.add(this.root);
    this.footIK = null;
    this.footContactSurfaces = null;
    this.pelvisOffset = 0;
    this.ikScratch = {
      footPosition: new THREE.Vector3(), rayOrigin: new THREE.Vector3(), target: new THREE.Vector3(),
      hitNormal: new THREE.Vector3(0, 1, 0), pivot: new THREE.Vector3(), effector: new THREE.Vector3(),
      upperPosition: new THREE.Vector3(), lowerPosition: new THREE.Vector3(),
      from: new THREE.Vector3(), to: new THREE.Vector3(), soleNormal: new THREE.Vector3(),
      deltaRotation: new THREE.Quaternion(), jointWorldRotation: new THREE.Quaternion(),
      parentWorldRotation: new THREE.Quaternion(), desiredWorldRotation: new THREE.Quaternion(),
      desiredLocalRotation: new THREE.Quaternion(),
    };
    this.leftFootDebugPosition = new THREE.Vector3();
    this.rightFootDebugPosition = new THREE.Vector3();
    this.footDebugMarkers = createFootDebugMarkers(this.gameplayRoot.parent || this.gameplayRoot);
    this.footIKDebugVisible = false;
    this.weaponDebug = import.meta.env?.DEV ? createWeaponDebugMarkers(this.gameplayRoot.parent || this.gameplayRoot) : null;
    this.weaponDebugVisible = false;
    this.importedModel = null;
    this.fallback = createFallbackRig(this.root, { weaponConfig: this.weaponConfig });
    this.assetRoot = new THREE.Group(); this.assetRoot.name = "ProductionRatKnight"; this.assetRoot.visible = false; this.root.add(this.assetRoot);
    this.mode = null; this.state = "IDLE_ALL_FOURS"; this.elapsed = 0; this.attackStep = 0; this.moving = false;
    this.presentationRoll = 0; this.cinematicClimbElapsed = 0;
    this.targetTorsoY = .55; this.targetTorsoRotationX = 0; this.targetHeadPosition = new THREE.Vector3(0, .115, -.49); this.poseBlendRate = 10;
    this.sword = this.fallback.sword;
    this.fallbackSwordTransform = copyWeaponTransform(this.weaponConfig.fallback.modelTransform);
    this.weaponGripReference = this.fallback.sword.userData.gripReference;
    this.sword.position.fromArray(this.fallbackSwordTransform.position);
    this.sword.rotation.set(...this.fallbackSwordTransform.rotation);
    this.sword.scale.setScalar(this.fallbackSwordTransform.scale);
    this.weaponVisual = this.fallback.weaponVisual;
    this.weaponMount = this.fallback.weaponMount;
    this.backSheathSocket = this.fallback.backSheathSocket;
    this.backSheathCorrection = this.fallback.backSheathCorrection;
    this.backSheathBoneName = "FallbackTorso";
    this.weaponState = WEAPON_STATES.SHEATHED;
    this.combatActive = false;
    this.externalSwordRoot = null;
    this.externalSwordTransform = null;
    this.weaponBounds = null;
    this.weaponAutoScaleFactor = 1;
    this.weaponManualScaleOverride = this.weaponConfig.manualScaleOverride;
    this.crown = null;
    this.animationController = null;
    this.animationNames = null;
    this.loadedModel = false;
    this.importedMeshCount = 0;
    this.importedMaterialCount = 0;
    this.importedShadowCasterCount = 0;
    this.importedTriangleCount = 0;
    this.importedBounds = null;
    this.importedHierarchy = [];
    this.importedBoneNames = [];
    this.importedSkinnedMeshNames = [];
    this.importedMaterialReport = [];
    this.weaponMeshCount = 0;
    this.weaponMaterialCount = 0;
    this.glbSockets = null;
    this.currentSwordSocket = null;
    this.currentSwordGripPivot = null;
    this.setPoseMode("FOUR_LEG", true);
    this.updateWeaponSocket();
    this.loadOptionalSword();
    this.loadProductionModel();
  }

  loadProductionModel() {
    gltfLoader.load(this.config.assetUrl, (gltf) => this.installProductionModel(gltf), undefined, (error) => {
      if (import.meta.env?.DEV) console.info(`[PlayerVisual] No usable ${this.config.assetUrl} was found; showing the procedural rat-knight fallback.`, error?.message || "Asset unavailable");
    });
  }

  installProductionModel(gltf) {
    const model = gltf.scene;
    this.importedModel = model;
    model.name ||= "RatKnightGLB";
    model.scale.setScalar(this.config.modelScale);
    model.rotation.y = this.config.modelRotationY;
    // The configured offset belongs to PlayerVisualRoot; applying it again to
    // the imported model would double the translation once the asset loads.
    model.position.y = 0;
    const modelMaterials = new Set();
    const legVertexIndices = { left: [], right: [] };
    model.traverse((object) => {
      this.importedHierarchy.push({ name: object.name || object.type, type: object.type, parent: object.parent?.name || null });
      if (object.isMesh) {
        // The supplied file has one full-body SkinnedMesh. Keep its shadow,
        // while not turning auxiliary meshes into a forest of shadow casters.
        object.castShadow = object.isSkinnedMesh;
        object.receiveShadow = true;
        object.frustumCulled = true;
        this.importedMeshCount++;
        if (object.castShadow) this.importedShadowCasterCount++;
        this.importedTriangleCount += object.geometry.index?.count / 3 || object.geometry.attributes.position.count / 3;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) modelMaterials.add(material);
        if (object.isSkinnedMesh) {
          this.importedSkinnedMeshNames.push(object.name);
          this.importedBoneNames.push(...object.skeleton.bones.map((bone) => bone.name));
          const footBoneIndices = {
            left: new Set(object.skeleton.bones.map((bone, index) => /mixamorigLeft(Foot|ToeBase|Toe_End)$/.test(bone.name) ? index : -1).filter(index => index >= 0)),
            right: new Set(object.skeleton.bones.map((bone, index) => /mixamorigRight(Foot|ToeBase|Toe_End)$/.test(bone.name) ? index : -1).filter(index => index >= 0)),
          };
          const skinIndex = object.geometry.getAttribute("skinIndex");
          const skinWeight = object.geometry.getAttribute("skinWeight");
          if ((footBoneIndices.left.size || footBoneIndices.right.size) && skinIndex && skinWeight) {
            for (let vertex = 0; vertex < skinIndex.count; vertex++) {
              for (let influence = 0; influence < 4; influence++) {
                const bone = skinIndex.getComponent(vertex, influence);
                if (skinWeight.getComponent(vertex, influence) <= .01) continue;
                if (footBoneIndices.left.has(bone)) { legVertexIndices.left.push({ mesh: object, vertex }); break; }
                if (footBoneIndices.right.has(bone)) { legVertexIndices.right.push({ mesh: object, vertex }); break; }
              }
            }
          }
        }
      }
    });
    this.importedMaterialCount = modelMaterials.size;
    this.importedBoneNames = [...new Set(this.importedBoneNames)];
    this.importedMaterialReport = [...modelMaterials].map((material) => ({
      name: material.name, type: material.type, color: material.color?.getHexString(),
      metalness: material.metalness, roughness: material.roughness,
      maps: ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"].filter((key) => material[key]).map((key) => key),
    }));
    model.updateWorldMatrix(true, true);
    const modelBounds = new THREE.Box3().setFromObject(model);
    this.importedBounds = { min: modelBounds.min.toArray(), max: modelBounds.max.toArray(), size: modelBounds.getSize(new THREE.Vector3()).toArray() };
    this.assetRoot.add(model);
    this.glbSockets = this.findModelSockets(model);
    this.initializeFootIK(model, legVertexIndices);
    this.fallback.root.visible = false;
    this.assetRoot.visible = true;
    this.loadedModel = true;
    this.backSheathSocket = this.glbSockets.backSheathSocket;
    this.backSheathCorrection = this.glbSockets.backSheathCorrection;
    this.backSheathBoneName = this.glbSockets.backSheathBoneName;
    this.updateWeaponSocket();
    this.updateWeaponVisibility(this.state);
    this.refreshWeaponStats();
    if (gltf.animations?.length) {
      this.animationNames = gltf.animations.map((clip) => clip.name);
      this.animationController = new PlayerAnimationController(model, gltf.animations, { rootBoneName: this.glbSockets.hips?.name || "mixamorig:Hips" });
      this.animationController.setState(this.state);
    }
    else if (import.meta.env?.DEV) console.info("[PlayerAnimation] The player GLB has no animation clips; procedural visual poses will be used.");
    if (this.crown) this.attachCrown(this.crown);
    if (import.meta.env?.DEV) this.reportLoadedModel(model, gltf);
  }

  reportLoadedModel(model, gltf) {
    const bounds = this.importedBounds;
    console.info("[PlayerVisual] GLB inspection " + JSON.stringify({
      hierarchy: this.importedHierarchy, bones: this.importedBoneNames, clips: gltf.animations.map((clip) => clip.name),
      skinnedMeshes: this.importedSkinnedMeshNames, materials: this.importedMaterialReport,
      bounds,
      configured: { modelScale: this.config.modelScale, worldScale: this.config.worldScale, rotationY: this.config.modelRotationY, offsetY: this.config.modelOffsetY },
      approximateScaledHeight: bounds.size[1] * this.config.worldScale,
      sockets: { rightHand: this.glbSockets.rightHand?.name || null, weaponParent: this.glbSockets.weapon.parent?.name || null, head: this.glbSockets.head?.name || null, hips: this.glbSockets.hips?.name || null },
      metrics: { characterMeshes: this.importedMeshCount, triangles: this.importedTriangleCount, materials: this.importedMaterialCount, shadowCasters: this.importedShadowCasterCount },
      weapon: { name: this.weaponVisual.name, meshes: this.weaponMeshCount, materials: this.weaponMaterialCount,
        rightHand: this.glbSockets.rightHand?.name || null, socket: this.weaponConfig.socket,
        mount: this.weaponConfig.mount, bounds: this.weaponBounds, autoScale: this.weaponAutoScaleFactor },
    }));
  }

  findModelSockets(model) {
    const nodes = new Map();
    model.traverse((object) => {
      if (!object.name) return;
      const normalized = normalizedName(object.name);
      nodes.set(normalized, object);
      // Three sanitizes the GLB namespaced bones to mixamorigRightHand, etc.
      // Index their namespace-free suffix too; this was the hidden socket bug.
      if (normalized.startsWith("mixamorig")) nodes.set(normalized.slice("mixamorig".length), object);
      const shortName = object.name.split(/[:|]/).at(-1);
      nodes.set(normalizedName(shortName), object);
    });
    const first = (names) => {
      for (const name of names) { const node = nodes.get(normalizedName(name)); if (node) return node; }
      return null;
    };
    const helper = (name, parent, offset) => {
      const socket = new THREE.Object3D(); socket.name = name; socket.position.set(offset[0], offset[1], offset[2]); parent.add(socket); return socket;
    };
    const authoredCrown = first(["CrownSocket"]);
    const head = first(["HeadSocket", "Head"]);
    const rightHand = first(["hand.R", "RightHand", "Hand_R", "Hand.R"]);
    const hips = first(["Hips"]);
    const spine2 = first([this.weaponConfig.backSheath.preferredBone, "Spine2"]);
    const spine1 = first([this.weaponConfig.backSheath.fallbackBone, "Spine1"]);
    const root = hips || first(["Root", "Armature"]) || model;
    // Never overwrite bone transforms: place helper sockets below the closest
    // semantic bone and let the imported animation continue to drive that bone.
    const crownParent = head || root;
    const crown = authoredCrown || helper("CrownSocket", crownParent, this.config.crownSocketOffset);
    const weapon = rightHand ? helper("WeaponSocket", rightHand, this.weaponConfig.socket.position) : null;
    if (weapon) {
      weapon.rotation.fromArray(this.weaponConfig.socket.rotation);
      weapon.scale.fromArray(this.weaponConfig.socket.scale);
    }
    const weaponMount = weapon ? helper("WeaponMount", weapon, this.weaponConfig.mount.position) : null;
    const weaponVisual = weaponMount ? helper("WeaponVisual", weaponMount, [0, 0, 0]) : null;
    if (weaponMount) {
      weaponMount.rotation.fromArray(this.weaponConfig.mount.rotation);
      weaponMount.scale.fromArray(this.weaponConfig.mount.scale);
    }
    const backBone = spine2 || spine1 || hips || root;
    const backSheath = createBackSheathMount(backBone, this.weaponConfig.backSheath, backBone.name || "unknown");
    const leftFoot = first(["LeftFoot"]);
    const rightFoot = first(["RightFoot"]);
    return {
      crown, weapon, weaponMount, weaponVisual, backSheathSocket: backSheath.socket, backSheathCorrection: backSheath.correction,
      backSheathBoneName: backBone.name || "unknown", swordGripPivot: weaponMount, head, rightHand, hips, leftFoot, rightFoot,
      leftUpperLeg: first(["LeftUpLeg"]), leftLowerLeg: first(["LeftLeg"]), leftToe: first(["LeftToeBase"]),
      rightUpperLeg: first(["RightUpLeg"]), rightLowerLeg: first(["RightLeg"]), rightToe: first(["RightToeBase"]),
    };
  }

  initializeFootIK(model, legVertexIndices) {
    const makeLeg = (side, upper, lower, foot, toe, samples) => {
      if (!upper || !lower || !foot) return null;
      const leg = {
        upper, lower, foot, toe, soleOffset: side === "left" ? PLAYER_FOOT_CONTACT.leftAnkleToSole : PLAYER_FOOT_CONTACT.rightAnkleToSole,
        soleSamples: samples, side, hit: false, hitY: null, hitDistance: null, surface: null,
        targetY: null, smoothedY: null, weight: 0, rayOriginY: null,
        hitPoint: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
        ankleWorld: new THREE.Vector3(), targetWorld: new THREE.Vector3(), visibleSole: new THREE.Vector3(), visibleSoleY: null,
        ankleTargetError: null,
        animatedUpper: new THREE.Quaternion(), animatedLower: new THREE.Quaternion(), animatedFoot: new THREE.Quaternion(), ikApplied: false,
      };
      return leg;
    };
    this.groundingCalibrationPoint ||= new THREE.Vector3();
    model.updateWorldMatrix(true, true);
    for (const object of this.importedSkinnedMeshes()) object.skeleton.update();
    const left = makeLeg("left", this.glbSockets.leftUpperLeg, this.glbSockets.leftLowerLeg, this.glbSockets.leftFoot, this.glbSockets.leftToe, legVertexIndices.left);
    const right = makeLeg("right", this.glbSockets.rightUpperLeg, this.glbSockets.rightLowerLeg, this.glbSockets.rightFoot, this.glbSockets.rightToe, legVertexIndices.right);
    this.footIK = {
      hips: this.glbSockets.hips,
      hipsBaseY: 0,
      appliedPelvisLocalOffset: 0,
      left, right, legs: [left, right],
    };
    this.pelvisOffset = 0;
  }

  importedSkinnedMeshes() {
    if (!this._skinnedMeshes) {
      this._skinnedMeshes = [];
      this.importedModel?.traverse(object => { if (object.isSkinnedMesh) this._skinnedMeshes.push(object); });
    }
    return this._skinnedMeshes;
  }

  setPoseMode(mode, snap = false) {
    if (this.mode === mode) return;
    this.mode = mode;
    const rig = this.fallback;
    rig.mode = mode;
    const climbing = mode === "CLIMB";
    const combat = mode === "COMBAT";
    const aura = mode === "AURA";
    const seated = mode === "SIT";
    this.targetTorsoY = combat ? .68 : aura ? .92 : seated ? .83 : climbing ? .62 : .55;
    this.targetTorsoRotationX = combat ? 1.06 : aura ? 1.32 : seated ? .9 : climbing ? .56 : 0;
    this.targetHeadPosition.set(0, combat ? .36 : aura ? .44 : seated ? .39 : climbing ? .31 : .115, combat ? -.37 : aura ? -.35 : seated ? -.34 : climbing ? -.47 : -.49);
    this.poseBlendRate = combat ? 10 : aura ? 5 : 8;
    rig.cape.visible = aura || seated;
    for (let i = 0; i < rig.limbPivots.length; i++) {
      const limb = rig.limbPivots[i];
      const { pivot, front, side } = limb;
      if (combat && front) {
        limb.targetPosition.set(side * .225, -.11, -.18);
        limb.targetRotationX = side > 0 ? 1.4 : .72;
        pivot.rotation.z = side * (side > 0 ? -.1 : .08);
      } else if (combat) {
        limb.targetPosition.set(side * .2, -.27, .15);
        limb.targetRotationX = -.32;
        pivot.rotation.z = 0;
      } else if (aura && front) {
        limb.targetPosition.set(side * .18, -.2, -.13);
        limb.targetRotationX = -.05;
        pivot.rotation.z = side * .035;
      } else if (aura) {
        limb.targetPosition.set(side * .15, -.27, .14);
        limb.targetRotationX = -1.05;
        pivot.rotation.z = 0;
      } else if (seated && front) {
        limb.targetPosition.set(side * .2, -.1, -.13);
        limb.targetRotationX = -.58;
        pivot.rotation.z = 0;
      } else if (seated) {
        limb.targetPosition.set(side * .15, -.3, .14);
        limb.targetRotationX = .62;
        pivot.rotation.z = 0;
      } else if (climbing && front) {
        limb.targetPosition.set(side * .18, .04, -.26); limb.targetRotationX = .9; pivot.rotation.z = side * .08;
      } else if (climbing) {
        limb.targetPosition.set(side * .17, -.1, .28); limb.targetRotationX = -.25; pivot.rotation.z = side * .05;
      } else if (front) {
        limb.targetPosition.set(side * .16, -.02, -.22); limb.targetRotationX = .56; pivot.rotation.z = side * .06;
      } else {
        limb.targetPosition.set(side * .17, -.045, .27); limb.targetRotationX = -.48; pivot.rotation.z = side * .06;
      }
      if (snap) {
        pivot.position.copy(limb.targetPosition);
        pivot.rotation.x = limb.targetRotationX;
      }
    }
    if (snap) {
      rig.torso.position.set(0, this.targetTorsoY, 0);
      rig.torso.rotation.x = this.targetTorsoRotationX;
      rig.head.position.copy(this.targetHeadPosition);
    }
    this.updateWeaponSocket();
  }

  updateWeaponSocket() {
    const handMount = this.loadedModel ? this.glbSockets?.weaponMount : this.fallback.weaponMount;
    const backMount = this.loadedModel ? this.glbSockets?.backSheathCorrection : this.fallback.backSheathCorrection;
    const mount = this.weaponState === WEAPON_STATES.DRAWN ? handMount : backMount;
    this.attachWeaponToMount(mount);
  }

  attachWeaponToMount(mount) {
    if (!mount || !this.weaponVisual) return;
    if (this.weaponVisual.parent !== mount) {
      for (const child of [...mount.children]) if (child.name === "WeaponVisual") mount.remove(child);
      mount.add(this.weaponVisual);
    }
    this.weaponVisual.position.set(0, 0, 0);
    this.weaponVisual.rotation.set(0, 0, 0);
    this.weaponVisual.scale.set(1, 1, 1);
    this.weaponVisual.visible = true;
    this.weaponMount = mount;
    this.currentSwordSocket = mount.parent;
    this.currentSwordGripPivot = mount;
    if (this.glbSockets) this.glbSockets.weaponVisual = this.weaponVisual;
  }

  setWeaponState(state, combatActive = this.combatActive) {
    this.combatActive = Boolean(combatActive);
    this.weaponState = state === WEAPON_STATES.DRAWN ? WEAPON_STATES.DRAWN : WEAPON_STATES.SHEATHED;
    this.updateWeaponSocket();
    this.weaponVisual.visible = true;
    return this.weaponState;
  }

  updateWeaponVisibility() {
    if (this.weaponVisual.visible !== true) this.weaponVisual.visible = true;
  }

  getWeaponStateDebug() {
    const swordCount = this.weaponVisual.children.length;
    return {
      weaponState: this.weaponState,
      weaponMount: this.weaponState === WEAPON_STATES.DRAWN ? "HAND" : "BACK",
      combatActive: this.combatActive,
      backSheathBone: this.backSheathBoneName || "pending",
      swordParent: this.weaponVisual.parent?.name || "none",
      swordVisible: this.weaponVisual.visible,
      swordObjectCount: swordCount,
    };
  }

  refreshWeaponStats() {
    const materials = new Set();
    this.weaponMeshCount = 0;
    this.weaponVisual.traverse((object) => {
      if (!object.isMesh) return;
      this.weaponMeshCount++;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    this.weaponMaterialCount = materials.size;
  }

  loadOptionalSword() {
    const url = this.weaponConfig.externalModelPath;
    if (!url || this.optionalSwordRequested) return;
    this.optionalSwordRequested = true;
    // Probe with HEAD first so an absent optional file does not create a noisy
    // GLTF 404 in the browser console or parse the app's index.html as a model.
    fetch(url, { method: "HEAD" }).then((response) => {
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || contentType.includes("text/html")) return;
      gltfLoader.load(url, (gltf) => this.replaceSword(gltf.scene), undefined, (error) => {
        if (import.meta.env?.DEV) console.info(`[PlayerWeapon] Optional sword unavailable; using the procedural weapon.`, error?.message || "Asset load failed");
      });
    }).catch(() => {});
  }

  replaceSword(model) {
    if (!model || !this.weaponVisual || !this.sword) return;
    model.name ||= "RatKnightSwordGLB";
    model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(largestDimension) || largestDimension <= 1e-6) {
      if (import.meta.env?.DEV) console.warn(`[PlayerWeapon] ${this.weaponConfig.externalModelPath} has empty bounds; keeping the procedural weapon.`);
      return;
    }
    this.weaponBounds = { width: size.x, height: size.y, depth: size.z, largestDimension };
    this.weaponAutoScaleFactor = this.weaponManualScaleOverride ?? (this.weaponConfig.autoScale ? this.weaponConfig.targetLength / largestDimension : 1);
    const oldVisualChildren = [...this.weaponVisual.children];
    for (const oldSword of oldVisualChildren) {
      this.weaponVisual.remove(oldSword);
      oldSword.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
      });
    }
    const externalRoot = new THREE.Group(); externalRoot.name = "ImportedSwordRoot";
    this.externalSwordRoot = externalRoot;
    this.externalSwordTransform = copyWeaponTransform(this.weaponConfig.externalSwordTransform);
    externalRoot.add(model);
    // Prefer an authored GripReference helper in future sword GLBs. No
    // geometry bounds or character finger bones are used to guess this point.
    this.weaponGripReference = model.getObjectByName("SwordGripPoint") || model.getObjectByName("GripReference");
    if (!this.weaponGripReference) {
      this.weaponGripReference = new THREE.Object3D();
      this.weaponGripReference.name = "SwordGripPoint";
      this.weaponGripReference.position.fromArray(this.weaponConfig.externalSwordGripPoint);
      model.add(this.weaponGripReference);
    }
    externalRoot.updateMatrixWorld(true);
    this.externalGripOffset = externalRoot.worldToLocal(this.weaponGripReference.getWorldPosition(new THREE.Vector3()));
    this.weaponVisual.add(externalRoot);
    this.sword = externalRoot;
    this.applyExternalSwordTransform();
    this.updateWeaponVisibility(this.state);
    this.refreshWeaponStats();
    if (import.meta.env?.DEV) console.info(`[PlayerWeapon] Loaded ${this.weaponConfig.externalModelPath}; bounds ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} (largest ${largestDimension.toFixed(3)}); auto scale ${this.weaponAutoScaleFactor.toFixed(3)}.`);
  }

  applyExternalSwordTransform() {
    if (!this.externalSwordRoot || !this.externalSwordTransform) return;
    const correction = this.externalSwordTransform;
    this.externalSwordRoot.position.fromArray(correction.position);
    this.externalSwordRoot.rotation.set(...correction.rotation);
    this.externalSwordRoot.scale.setScalar(correction.scale * this.weaponAutoScaleFactor);
    // Align the actual authored/configured grip, even when the GLB origin is elsewhere.
    this.externalSwordRoot.position.sub(this.externalGripOffset.clone()
      .multiply(this.externalSwordRoot.scale).applyQuaternion(this.externalSwordRoot.quaternion));
  }

  getWeaponModelTransform() {
    if (this.externalSwordRoot) return this.externalSwordTransform;
    return this.fallbackSwordTransform;
  }

  attachCrown(crown) {
    this.crown = crown;
    const socket = this.loadedModel ? this.glbSockets.crown : this.fallback.crownSocket;
    socket.add(crown);
    crown.position.set(0, 0, 0);
    crown.rotation.set(...this.config.crownRotation);
    crown.scale.setScalar(this.config.crownScale);
    crown.visible = true;
  }

  setAnimationState(state, { moving = false, attackStep = 0, elapsed = 0, emote = null } = {}) {
    this.state = state; this.moving = moving; this.attackStep = attackStep; this.elapsed = elapsed;
    this.updateWeaponVisibility(state, emote);
    this.animationController?.setState(state, { emote });
    if (state === "IDLE_COMBAT" || state.startsWith("ATTACK_") || state === "COMBAT_WALK") this.setPoseMode("COMBAT");
    else if (state === "AURA_WALK" || state === "KNEEL") this.setPoseMode("AURA");
    else if (state === "SIT_THRONE") this.setSeatedPose();
    else if (state.startsWith("CLIMB")) this.setPoseMode("CLIMB");
    else if (state === "DODGE" || state === "JUMP" || state === "FALL" || state === "LAND" || state === "RUN_ALL_FOURS" || state === "IDLE_ALL_FOURS" || state === "DAMAGE" || state === "DEATH") this.setPoseMode("FOUR_LEG");
  }

  setTorsoRoll(amount) { this.presentationRoll = amount; this.fallback.torso.rotation.z = amount; }

  setClimbMotion(elapsed) { this.cinematicClimbElapsed = elapsed; }

  setSeatedPose() {
    if (this.mode === "SIT") return;
    this.setPoseMode("SIT");
    this.updateWeaponVisibility("SIT_THRONE");
  }

  resetAnimations() {
    this.animationController?.reset("IDLE_ALL_FOURS");
  }

  update(dt, context = null) {
    if (this.footIK?.hips) {
      if (this.footIK.appliedPelvisLocalOffset) this.footIK.hips.position.y -= this.footIK.appliedPelvisLocalOffset;
      this.footIK.appliedPelvisLocalOffset = 0;
      for (const leg of this.footIK.legs) {
        if (!leg?.ikApplied) continue;
        leg.upper.quaternion.copy(leg.animatedUpper);
        leg.lower.quaternion.copy(leg.animatedLower);
        leg.foot.quaternion.copy(leg.animatedFoot);
        leg.ikApplied = false;
      }
    }
    this.animationController?.update(dt);
    if (this.loadedModel) {
      this.updateFootIK(dt, context);
      if (this.weaponDebugVisible) this.updateWeaponDebug();
      return;
    }
    this.elapsed += dt;
    const t = this.elapsed;
    const rig = this.fallback;
    const walking = this.moving && WALKING_STATES.has(this.state);
    const aura = rig.mode === "AURA";
    const combat = rig.mode === "COMBAT";
    const sit = rig.mode === "SIT";
    const stepRate = aura ? 5 : combat ? 8.5 : this.state.startsWith("CLIMB") ? 7.4 : 10.5;
    const amplitude = aura ? .17 : combat ? .14 : this.state === "DODGE" ? .75 : this.state.startsWith("CLIMB") ? .16 : .4;
    const blend = 1 - Math.exp(-this.poseBlendRate * dt);
    const breathing = Math.sin(t * (combat ? 2.2 : 1.8)) * (combat ? .006 : .004);
    rig.torso.position.y += (this.targetTorsoY + (walking ? Math.sin(t * stepRate * 2) * (aura ? .009 : .014) : breathing) - rig.torso.position.y) * blend;
    rig.torso.rotation.x += (this.targetTorsoRotationX - rig.torso.rotation.x) * blend;
    rig.torso.rotation.z += ((sit ? .14 : this.presentationRoll + (aura ? 0 : Math.sin(t * 2.1) * .009)) - rig.torso.rotation.z) * blend;
    rig.head.position.lerp(this.targetHeadPosition, blend);
    const headTilt = aura ? -.045 : combat ? .025 : 0;
    rig.head.rotation.x += (headTilt + Math.sin(t * (aura ? 2.5 : 4.8)) * .012 - rig.head.rotation.x) * .1;
    for (let i = 0; i < rig.limbPivots.length; i++) {
      const limb = rig.limbPivots[i];
      if (sit) continue;
      const phase = t * stepRate + (i % 2) * Math.PI + (limb.front ? 0 : Math.PI);
      const swing = walking ? Math.sin(phase) * amplitude : 0;
      const stance = this.state === "ATTACK_1" ? Math.sin(t * 13) * .08 : this.state === "ATTACK_2" ? -Math.sin(t * 13) * .08 : this.state === "ATTACK_3" ? -.2 : 0;
      const cinematic = this.state === "CLIMB_UP" || this.state === "CLIMB_JUMP" ? Math.sin(this.cinematicClimbElapsed * 7 + i * Math.PI) * .2 : 0;
      const idleShift = combat && !walking ? Math.sin(t * 1.7 + i * Math.PI) * (limb.front ? .018 : .008) : 0;
      limb.pivot.position.lerp(limb.targetPosition, blend);
      limb.pivot.rotation.x += (limb.targetRotationX + swing + stance + cinematic + idleShift - limb.pivot.rotation.x) * (walking ? .24 : blend);
    }
    for (let i = 0; i < rig.tailSegments.length; i++) {
      const segment = rig.tailSegments[i];
      const wave = Math.sin(t * (aura ? 2.6 : combat ? 3.8 : 4.3) - i * .42) * ((aura ? .025 : combat ? .045 : .055) + i * .006);
      segment.rotation.y += (wave - segment.rotation.y) * .12;
      segment.rotation.x += (Math.sin(t * 2.7 - i * .32) * (aura ? .022 : .035) - segment.rotation.x) * .1;
    }
    rig.cape.rotation.x += ((walking ? Math.sin(t * (aura ? 4.8 : 7.2)) * (aura ? .035 : .06) : 0) - rig.cape.rotation.x) * .11;
    if (this.weaponDebugVisible) this.updateWeaponDebug();
  }

  updateFootIK(dt, context) {
    const rig = this.footIK;
    if (!rig?.hips || (!rig.left && !rig.right)) return;
    const state = context?.state || this.state;
    const grounded = Boolean(context?.grounded && context?.alive && !state.startsWith("CLIMB")
      && state !== "JUMP" && state !== "FALL" && state !== "DODGE" && state !== "DEATH"
      && !(state === "EMOTING" && context?.emote?.footIK === false));
    const candidates = context?.colliders || [];
    this.importedModel.updateWorldMatrix(true, true);
    let pelvisError = 0, pelvisWeight = 0;
    for (const leg of rig.legs) {
      if (!leg) continue;
      leg.foot.getWorldPosition(this.ikScratch.footPosition);
      const footY = this.ikScratch.footPosition.y;
      leg.hit = grounded && this.sampleFootGround(leg, this.ikScratch.footPosition.x, this.ikScratch.footPosition.z,
        footY + FOOT_IK_CONFIG.rayStartHeight, candidates, context?.roomId || "greatHall");
      if (leg.hit) {
        leg.targetY = leg.hitY + leg.soleOffset + FOOT_IK_CONFIG.soleClearance;
        if (leg.smoothedY === null) leg.smoothedY = leg.targetY;
        leg.smoothedY = THREE.MathUtils.damp(leg.smoothedY, leg.targetY, FOOT_IK_CONFIG.positionSmoothing, dt);
        let targetWeight = context?.moving ? FOOT_IK_CONFIG.movingWeight : 1;
        if (state.startsWith("ATTACK_")) targetWeight = FOOT_IK_CONFIG.attackWeight;
        // Reduce correction for a clearly raised swing foot; keep stronger
        // support when a foot is at or below its terrain-relative ankle height.
        const swingHeight = footY - leg.targetY;
        if (swingHeight > .12) targetWeight *= 1 - THREE.MathUtils.clamp((swingHeight - .12) / .2, 0, 1);
        leg.weight = THREE.MathUtils.damp(leg.weight, targetWeight, FOOT_IK_CONFIG.rotationSmoothing, dt);
        if (leg.weight > .02) { pelvisError += (leg.targetY - footY) * leg.weight; pelvisWeight += leg.weight; }
      } else {
        leg.targetY = null;
        leg.weight = THREE.MathUtils.damp(leg.weight, 0, FOOT_IK_CONFIG.rotationSmoothing, dt);
      }
    }

    const modelWorldScale = Math.max(.001, this.config.worldScale * this.config.modelScale);
    const desiredPelvisOffset = grounded && pelvisWeight > .01
      ? THREE.MathUtils.clamp(pelvisError / pelvisWeight, -FOOT_IK_CONFIG.maxPelvisOffset, FOOT_IK_CONFIG.maxPelvisOffset)
      : 0;
    this.desiredPelvisOffset = desiredPelvisOffset;
    this.pelvisOffset = THREE.MathUtils.damp(this.pelvisOffset, desiredPelvisOffset, FOOT_IK_CONFIG.pelvisSmoothing, dt);
    rig.appliedPelvisLocalOffset = this.pelvisOffset / modelWorldScale;
    rig.hips.position.y += rig.appliedPelvisLocalOffset;
    this.importedModel.updateWorldMatrix(true, true);
    for (const leg of rig.legs) {
      if (!leg || leg.weight <= .01 || leg.smoothedY === null) continue;
      leg.foot.getWorldPosition(this.ikScratch.footPosition);
      const scratch = this.ikScratch;
      leg.upper.getWorldPosition(scratch.upperPosition);
      leg.lower.getWorldPosition(scratch.lowerPosition);
      const firstLength = scratch.upperPosition.distanceTo(scratch.lowerPosition);
      const secondLength = scratch.lowerPosition.distanceTo(scratch.footPosition);
      const dy = leg.smoothedY - scratch.upperPosition.y;
      let dx = scratch.footPosition.x - scratch.upperPosition.x;
      let dz = scratch.footPosition.z - scratch.upperPosition.z;
      const horizontalLength = Math.hypot(dx, dz);
      if (horizontalLength > 1e-5) { dx /= horizontalLength; dz /= horizontalLength; }
      else { dx = leg.side === "left" ? -1 : 1; dz = 0; }
      const minReach = Math.abs(firstLength - secondLength) + .001;
      const maxReach = Math.max(minReach, firstLength + secondLength - .001);
      const requestedReach = Math.hypot(horizontalLength, dy);
      const reachableDistance = THREE.MathUtils.clamp(requestedReach, minReach, maxReach);
      const reachableHorizontal = Math.sqrt(Math.max(0, reachableDistance * reachableDistance - dy * dy));
      // Keep the requested ankle height, while allowing its X/Z position to
      // shift inside the two-bone chain's reachable annulus. Locking X/Z to the
      // animated ankle made the vertical target unreachable in this idle pose.
      scratch.target.set(scratch.upperPosition.x + dx * reachableHorizontal, leg.smoothedY,
        scratch.upperPosition.z + dz * reachableHorizontal);
      leg.targetWorld.copy(scratch.target);
      leg.animatedUpper.copy(leg.upper.quaternion);
      leg.animatedLower.copy(leg.lower.quaternion);
      leg.animatedFoot.copy(leg.foot.quaternion);
      leg.ikApplied = true;
      // CCD rotates the animated lower leg and upper leg toward the ankle
      // target. The animation mixer remains authoritative each new frame.
      // The target itself is smoothed above. Blending the joint correction by
      // frame time prevented convergence because animation restores the pose
      // every frame; at 60 FPS it only applied about 21% of each correction.
      for (let iteration = 0; iteration < 2; iteration++) {
        this.rotateJointToward(leg.lower, leg.foot, this.ikScratch.target, leg.weight);
        this.rotateJointToward(leg.upper, leg.foot, this.ikScratch.target, leg.weight);
      }
      if (leg.hit) this.alignFootToNormal(leg, leg.weight);
      this.importedModel.updateWorldMatrix(true, true);
    }
    for (const skinnedMesh of this.importedSkinnedMeshes()) skinnedMesh.skeleton.update();
    if (this.footIKDebugVisible) this.updateFootIKDebug(rig);
  }

  setFootIKDebugVisible(visible) {
    this.footIKDebugVisible = Boolean(visible);
    this.footDebugMarkers.group.visible = this.footIKDebugVisible;
    for (const side of ["left", "right"]) for (const marker of Object.values(this.footDebugMarkers.markers[side])) marker.visible = this.footIKDebugVisible;
  }


  setWeaponDebugVisible(visible) {
    this.weaponDebugVisible = Boolean(visible);
    this.weaponDebug.group.visible = this.weaponDebugVisible;
    if (this.weaponDebugVisible) this.updateWeaponDebug();
  }

  updateWeaponDebug() {
    const socket = this.glbSockets?.weapon;
    if (!socket || !this.weaponDebug) return;
    this.importedModel?.updateMatrixWorld(true);
    const gripReference = this.weaponGripReference || this.sword?.userData?.gripReference || this.sword;
    if (!gripReference) return;
    gripReference.updateWorldMatrix(true, false);
    socket.getWorldPosition(this.weaponDebug.socketPosition);
    // Independently sample the rendered palm surface only when the diagnostic
    // panel is sampled. Never infer the palm from the socket's own position.
    const hand = this.glbSockets.rightHand;
    const distal = hand.children.find(node => node.isBone)?.position.clone().normalize();
    if (!distal) return;
    const inverse = hand.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const skin of this.importedSkinnedMeshes()) {
      skin.skeleton.update();
      let candidates = skin.userData.weaponPalmCandidates;
      if (!candidates) {
        candidates = []; const indices = skin.geometry.attributes.skinIndex;
        const weights = skin.geometry.attributes.skinWeight;
        for (let i = 0; i < indices.count; i++) {
          let weight = 0;
          for (let j = 0; j < 4; j++) {
            if (skin.skeleton.bones[indices.getComponent(i, j)].name.includes("RightHand")) weight += weights.getComponent(i, j);
          }
          if (weight >= .75) candidates.push(i);
        }
        skin.userData.weaponPalmCandidates = candidates;
      }
      for (const i of candidates) {
        skin.getVertexPosition(i, point).applyMatrix4(skin.matrixWorld).applyMatrix4(inverse);
        const along = point.dot(distal);
        if (along >= .105 && along <= .175) bounds.expandByPoint(point);
      }
    }
    if (bounds.isEmpty()) return;
    bounds.getCenter(this.weaponDebug.palmPosition).applyMatrix4(hand.matrixWorld);
    gripReference.getWorldPosition(this.weaponDebug.gripPosition);
    this.weaponDebug.palmGripDistance = this.weaponDebug.palmPosition.distanceTo(this.weaponDebug.gripPosition);
    this.weaponDebug.palm.position.copy(this.weaponDebug.palmPosition);
    this.weaponDebug.grip.position.copy(this.weaponDebug.gripPosition);
  }


  updateFootIKDebug(rig) {
    // Match renderer traversal before CPU skin sampling. updateWorldMatrix()
    // alone bypasses SkinnedMesh.updateMatrixWorld(), which refreshes the
    // attached skin's bindMatrixInverse after parent scale/translation changes.
    this.importedModel.updateMatrixWorld(true);
    const point = this.groundingCalibrationPoint ||= new THREE.Vector3();
    for (const leg of rig.legs) {
      if (!leg) continue;
      leg.foot.getWorldPosition(leg.ankleWorld);
      leg.ankleTargetError = leg.hit ? leg.ankleWorld.y - leg.targetY : null;
      leg.visibleSoleY = null;
      let lowestY = Infinity;
      for (const sample of leg.soleSamples) {
        sample.mesh.getVertexPosition(sample.vertex, point);
        point.applyMatrix4(sample.mesh.matrixWorld);
        if (point.y < lowestY) { lowestY = point.y; leg.visibleSole.copy(point); }
      }
      if (Number.isFinite(lowestY)) leg.visibleSoleY = lowestY;
      const markers = this.footDebugMarkers.markers[leg.side];
      markers.ground.position.copy(leg.hitPoint);
      markers.target.position.copy(leg.targetWorld);
      markers.ankle.position.copy(leg.ankleWorld);
      markers.sole.position.copy(leg.visibleSole);
      markers.ground.visible = leg.hit;
      markers.target.visible = leg.hit;
      markers.ankle.visible = true;
      markers.sole.visible = leg.visibleSoleY !== null;
    }
  }

  sampleFootGround(leg, x, z, originY, colliders, roomId) {
    let hitY = originY >= 0 ? 0 : -Infinity;
    let surface = hitY === -Infinity ? null : FLOOR_SURFACES[roomId] || FLOOR_SURFACES.greatHall;
    if (roomId === "greatHall") {
      if (Math.abs(x) < 7.15 && z < 6.6 && z > 1.4) {
        const stairY = Math.ceil((6.6 - z) / 1.15) * .28;
        if (stairY <= originY && stairY > hitY) { hitY = stairY; surface = "greatHall-stairs"; }
      }
      if (Math.abs(x) < 7.15 && z < 1.7 && z > -5.3 && 1.13 <= originY && 1.13 > hitY) {
        hitY = 1.13; surface = "greatHall-dais";
      }
    }
    for (const collider of colliders) {
      if (!collider.supportTop || collider.maxY > originY || collider.maxY <= hitY
        || x < collider.minX || x > collider.maxX || z < collider.minZ || z > collider.maxZ) continue;
      hitY = collider.maxY;
      surface = collider;
    }
    // Each foot independently chooses the highest visible support below its
    // probe origin. These cached rectangles add no gameplay collision or mesh
    // raycasts; existing collider tops and stair support remain candidates.
    const contactSurfaces = this.footContactSurfaces?.get(roomId);
    if (contactSurfaces) for (const contact of contactSurfaces) {
      if (contact.topY > originY || contact.topY <= hitY || originY - contact.topY > FOOT_IK_CONFIG.rayDistance
        || x < contact.minX || x > contact.maxX || z < contact.minZ || z > contact.maxZ) continue;
      hitY = contact.topY;
      surface = contact;
    }
    const distance = originY - hitY;
    if (!Number.isFinite(hitY) || distance < 0 || distance > FOOT_IK_CONFIG.rayDistance) {
      leg.hitY = null; leg.hitDistance = null; leg.surface = null;
      return false;
    }
    leg.hitY = hitY;
    leg.hitDistance = distance;
    leg.surface = surface;
    leg.hitPoint.set(x, hitY, z);
    leg.normal.set(0, 1, 0);
    leg.rayOriginY = originY;
    return true;
  }

  rotateJointToward(joint, effector, target, blend) {
    const scratch = this.ikScratch;
    this.importedModel.updateWorldMatrix(true, true);
    joint.getWorldPosition(scratch.pivot);
    effector.getWorldPosition(scratch.effector);
    scratch.from.subVectors(scratch.effector, scratch.pivot);
    scratch.to.subVectors(target, scratch.pivot);
    if (scratch.from.lengthSq() < 1e-8 || scratch.to.lengthSq() < 1e-8) return;
    scratch.from.normalize(); scratch.to.normalize();
    scratch.deltaRotation.setFromUnitVectors(scratch.from, scratch.to);
    joint.getWorldQuaternion(scratch.jointWorldRotation);
    scratch.desiredWorldRotation.copy(scratch.deltaRotation).multiply(scratch.jointWorldRotation);
    joint.parent.getWorldQuaternion(scratch.parentWorldRotation);
    scratch.desiredLocalRotation.copy(scratch.parentWorldRotation).invert().multiply(scratch.desiredWorldRotation);
    joint.quaternion.slerp(scratch.desiredLocalRotation, THREE.MathUtils.clamp(blend, 0, 1));
  }

  alignFootToNormal(leg, blend) {
    const { normal } = leg;
    if (normal.y > .999) return;
    const scratch = this.ikScratch;
    leg.foot.getWorldQuaternion(scratch.jointWorldRotation);
    scratch.soleNormal.set(0, 1, 0).applyQuaternion(scratch.jointWorldRotation).normalize();
    scratch.deltaRotation.setFromUnitVectors(scratch.soleNormal, normal);
    let angle = 2 * Math.acos(THREE.MathUtils.clamp(scratch.deltaRotation.w, -1, 1));
    if (angle > FOOT_IK_CONFIG.maxFootTilt) {
      scratch.from.set(scratch.deltaRotation.x, scratch.deltaRotation.y, scratch.deltaRotation.z).normalize();
      scratch.deltaRotation.setFromAxisAngle(scratch.from, FOOT_IK_CONFIG.maxFootTilt);
    }
    scratch.desiredWorldRotation.copy(scratch.deltaRotation).multiply(scratch.jointWorldRotation);
    leg.foot.parent.getWorldQuaternion(scratch.parentWorldRotation);
    scratch.desiredLocalRotation.copy(scratch.parentWorldRotation).invert().multiply(scratch.desiredWorldRotation);
    leg.foot.quaternion.slerp(scratch.desiredLocalRotation, THREE.MathUtils.clamp(blend, 0, 1));
  }

  getFootWorldY(side) {
    const bone = this.glbSockets?.[side === "left" ? "leftFoot" : "rightFoot"];
    if (!bone) return null;
    const position = side === "left" ? this.leftFootDebugPosition : this.rightFootDebugPosition;
    bone.getWorldPosition(position);
    return position.y;
  }
}
