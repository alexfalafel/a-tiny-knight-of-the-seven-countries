import * as THREE from "three";
import { InputManager } from "./InputManager.js";
import { PlayerController } from "./PlayerController.js";
import { ThirdPersonCamera } from "./ThirdPersonCamera.js";
import { CASTLE_SCALE, createTestLevel } from "./TestLevel.js";
import { EnemyController } from "./EnemyController.js";
import { ArmoredBeetleBoss } from "./ArmoredBeetleBoss.js";
import { ArmoredRatKnightBoss } from "./ArmoredRatKnightBoss.js";
import { CombatEncounter } from "./CombatEncounter.js";
import { CombatTargetRegistry } from "./CombatTargetRegistry.js";
import { CrownFragment } from "./CrownFragment.js";
import { ProgressionManager } from "./ProgressionManager.js";
import { RoomManager } from "./RoomManager.js";
import { GoldParticleBurst } from "./GoldParticleBurst.js";
import { EndingProgression } from "./EndingProgression.js";
import { FinaleSequence } from "./FinaleSequence.js";
import "./style.css";
import { GpuTimer } from "./GpuTimer.js";
import { DormantGroup } from "./SceneOptimization.js";
import { SceneInventory, formatSnapshot } from "./PerformanceDiagnostics.js";

const root = document.querySelector("#game");
const overlay = document.querySelector("#welcome");
const beginButton = document.querySelector("#begin");
const controlsToggle = document.querySelector("#controls-toggle");
const controlsPanel = document.querySelector("#controls-panel");
const stateLabel = document.querySelector("#state-label");
const perfPanel = document.querySelector("#perf-panel");
const fpsCounter = document.querySelector("#fps-counter");
const fpsCounterValue = fpsCounter.querySelector("strong");
const playerHealthText = document.querySelector("#player-health");
const enemyHealthWrap = document.querySelector("#enemy-health-wrap");
const enemyHealthText = document.querySelector("#enemy-health-text");
const enemyHealthFill = document.querySelector("#enemy-health-fill");
const damageFlash = document.querySelector("#damage-flash");
const deathOverlay = document.querySelector("#death-overlay");
const climbPrompt = document.querySelector("#climb-prompt");
const climbPromptLabel = climbPrompt.querySelector("span");
const climbStaminaHud = document.querySelector("#climb-stamina");
const climbStaminaArc = document.querySelector("#climb-stamina-arc");
const climbStaminaText = document.querySelector("#climb-stamina-text");
const crownHud = document.querySelector("#crown-hud");
const crownCountText = document.querySelector("#crown-count");
const crownIndicators = document.querySelector("#crown-indicators");
const crownStatus = document.querySelector("#crown-status");
const pickupToast = document.querySelector("#pickup-toast");
const pickupCount = document.querySelector("#pickup-count");
const reconstructionOverlay = document.querySelector("#crown-reconstruction");
const reconstructionMessage = document.querySelector("#crown-reconstruction-message");
const roomTitle = document.querySelector("#room-title");
const tunnelMenu = document.querySelector("#tunnel-menu");
const tunnelDestinations = document.querySelector("#tunnel-destinations");
const tunnelClose = document.querySelector("#tunnel-close");
const screenFade = document.querySelector("#screen-fade");
const pickupTitle = document.querySelector("#pickup-title");
const bossHealthWrap = document.querySelector("#boss-health-wrap");
const bossHealthText = document.querySelector("#boss-health-text");
const bossHealthFill = document.querySelector("#boss-health-fill");
const bossDebugPanel = document.querySelector("#boss-debug-panel");
const bossHitCallout = document.querySelector("#boss-hit-callout");
const lockOnIndicator = document.querySelector("#lock-on-indicator");
const bossHealthName = document.querySelector("#boss-health-name");
const finaleChoice = document.querySelector("#finale-choice");
const finaleText = document.querySelector("#finale-text");
const finaleResults = document.querySelector("#finale-results");
const secretResults = document.querySelector("#secret-results");
const endingDim = document.querySelector("#ending-dim");

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x171a1b); scene.fog = new THREE.Fog(0x171a1b, 28, 68);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .1, 120);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const RENDER_QUALITY = Object.freeze({ shadowMapSize: 1024, pixelRatios: [.75, 1, 1.25, 1.5] });
const perfQuality = { pixelRatioIndex: 1, localLights: true, particles: true, cullRooms: true, currentRoomOnly: false, propsVisible: true };
renderer.setPixelRatio(RENDER_QUALITY.pixelRatios[perfQuality.pixelRatioIndex]); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
root.appendChild(renderer.domElement);
const gpuTimer = new GpuTimer(renderer.getContext());
const hemisphereLight = new THREE.HemisphereLight(0xc8c8c1, 0x38312a, 2.5); scene.add(hemisphereLight);
const key = new THREE.DirectionalLight(0xffe5bd, 2.6); key.position.set(-8, 16, 7); key.castShadow = true; key.shadow.mapSize.set(RENDER_QUALITY.shadowMapSize, RENDER_QUALITY.shadowMapSize); key.shadow.camera.left = -24; key.shadow.camera.right = 24; key.shadow.camera.top = 24; key.shadow.camera.bottom = -24; scene.add(key);

const level = createTestLevel(scene);
const { spawn, climbables, fragmentSpawns, roomLights } = level;
const progression = new ProgressionManager(5);
const endings = new EndingProgression();
const roomManager = new RoomManager(level.rooms, level.tunnels, progression, level.connections);
let litRoomId = null;
let dragonBoss = null;
let minimalRenderMode = false;
let savedMinimalSceneState = null;
let savedMinimalFog = null;
let savedMinimalShadows = true;
const actorRoomGroups = new Map();
const fragmentsByRoom = new Map();
const emptyFragments = [];
let previewRoomId = null;
let visibleRoomCount = 1;
let visibleEnvironmentCount = 1;
const diagnosticModes = { hideUi: false, freezeGameLogic: false };
function syncRoomLighting() {
  const roomId = roomManager.currentRoomId;
  if (litRoomId === roomId) return;
  litRoomId = roomId;
  for (const entry of roomLights) entry.light.visible = perfQuality.localLights && entry.roomId === litRoomId;
}
const player = new PlayerController(scene, spawn, level.collidersNear, climbables);
player.visual.footContactSurfaces = level.footContactSurfaces;
const minimalFloor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshLambertMaterial({ color: 0x555653 }));
minimalFloor.rotation.x = -Math.PI / 2; minimalFloor.position.y = -.02; minimalFloor.receiveShadow = false; minimalFloor.visible = false; scene.add(minimalFloor);
player.climbableSurfaces = level.climbablesForRoom(roomManager.currentRoomId);
let spatialRoomId = roomManager.currentRoomId;
function doorwayPreview() {
  if (perfQuality.currentRoomOnly) return null;
  let nearest = null, nearestSquared = 36;
  for (const connection of level.connections) {
    if (connection.from !== roomManager.currentRoomId && connection.to !== roomManager.currentRoomId) continue;
    const dx = player.group.position.x - connection.center[0];
    const dz = player.group.position.z - connection.center[1];
    const distance = dx * dx + dz * dz;
    if (distance < nearestSquared) {
      nearestSquared = distance;
      nearest = connection.from === roomManager.currentRoomId ? connection.to : connection.from;
    }
  }
  return nearest;
}
function syncRoomVisibility() {
  if (minimalRenderMode) return;
  previewRoomId = doorwayPreview();
  visibleRoomCount = 0; visibleEnvironmentCount = 0;
  for (const room of level.rooms.values()) {
    room.group.visible = room.id === roomManager.currentRoomId || room.id === previewRoomId;
    if (room.group.visible) { visibleRoomCount++; visibleEnvironmentCount++; }
  }
  for (const connection of level.connections) {
    connection.group.visible = connection.from === roomManager.currentRoomId || connection.to === roomManager.currentRoomId;
    if (connection.group.visible) visibleEnvironmentCount++;
  }
  for (const [roomId, group] of actorRoomGroups) {
    group.visible = roomId === roomManager.currentRoomId;
    group.matrixWorldAutoUpdate = group.visible;
  }
  renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
}
function setMinimalRenderMode(enabled) {
  if (enabled === minimalRenderMode) return;
  if (enabled) {
    savedMinimalSceneState = scene.children.map((object) => [object, object.visible]);
    savedMinimalFog = scene.fog;
    savedMinimalShadows = renderer.shadowMap.enabled;
    minimalRenderMode = true;
    for (const object of scene.children) object.visible = false;
    player.group.visible = true;
    minimalFloor.visible = true;
    hemisphereLight.visible = true;
    renderer.shadowMap.enabled = false;
    scene.fog = null;
  } else {
    minimalRenderMode = false;
    for (const [object, visible] of savedMinimalSceneState || []) object.visible = visible;
    minimalFloor.visible = false;
    hemisphereLight.visible = true;
    renderer.shadowMap.enabled = savedMinimalShadows;
    renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
    scene.fog = savedMinimalFog;
    savedMinimalSceneState = null;
    syncRoomSystems(true);
  }
}
function syncRoomSystems(force = false) {
  if (!force && spatialRoomId === roomManager.currentRoomId) {
    if (previewRoomId !== doorwayPreview()) syncRoomVisibility();
    return;
  }
  spatialRoomId = roomManager.currentRoomId;
  player.collisionRoomId = spatialRoomId;
  player.climbableSurfaces = level.climbablesForRoom(spatialRoomId);
  litRoomId = null;
  syncRoomLighting();
  syncRoomVisibility();
}
player.onAuraWalkToggle = (enabled) => { if (enabled) showMessage("AURA WALK", "", 1.1); };
const enemy = new EnemyController(scene, new THREE.Vector3(3.4, 0, 4.6));
const boss = new ArmoredBeetleBoss(scene, { spawn: level.armoryBossSpawn, arenaBounds: level.armoryArenaBounds });
const ratBoss = new ArmoredRatKnightBoss(scene, { spawn: level.royalChambersBossSpawn, arenaBounds: level.royalChambersArenaBounds });
const combat = new CombatEncounter(player, enemy);
const targetRegistry = new CombatTargetRegistry();
targetRegistry.register(enemy, "greatHall");
targetRegistry.register(boss, "armory");
targetRegistry.register(ratBoss, "royalChambers");
const greatHallTargets = [enemy];
const armoryTargets = [boss];
const royalChambersTargets = [ratBoss];
const dragonStart = level.dragonStart;
const fragments = fragmentSpawns.map((fragment) => new CrownFragment(scene, fragment));
if (import.meta.env.DEV) {
  for (const fragment of fragments) {
    const room = level.rooms.get(fragment.roomId);
    const p = fragment.worldPosition;
    let nearestFloorY = 0;
    for (const collider of room.colliders) {
      if (!collider.supportTop || collider.maxY > p.y + .1) continue;
      if (p.x < collider.minX || p.x > collider.maxX || p.z < collider.minZ || p.z > collider.maxZ) continue;
      nearestFloorY = Math.max(nearestFloorY, collider.maxY);
    }
    const heightAboveFloor = p.y - nearestFloorY;
    console.info(`[Crown check] ${room.name} | world (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) | nearest floor/platform Y ${nearestFloorY.toFixed(2)} | pickup radius ${fragment.triggerRadius.toFixed(2)} | active ${!fragment.collected}`);
    if (heightAboveFloor > fragment.triggerRadius + .25) console.warn(`[Crown check] Fragment ${fragment.id} is ${heightAboveFloor.toFixed(2)}m above its nearest floor/platform.`);
  }
}
const goldBurst = new GoldParticleBurst(scene);
let goldBurstRoomId = roomManager.currentRoomId;
const followCamera = new ThirdPersonCamera(camera);
followCamera.setCollisionQuery(level.collidersNear);
const swordDebugVolume = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffdc54, wireframe: true, transparent: true, opacity: .9, depthTest: false }),
);
swordDebugVolume.scale.set(.72, .58, 1.3); swordDebugVolume.visible = false; scene.add(swordDebugVolume);
let gameStarted = false;
let gameOver = false;
const input = new InputManager(renderer.domElement, (locked) => {
  overlay.classList.toggle("hidden", locked || gameStarted);
  if (locked) { gameStarted = true; fpsCounter.classList.add("visible"); }
});
const finale = new FinaleSequence({
  scene, player, camera: followCamera, progression, endings, throneCrown: level.throneCrown, keyLight: key, input,
  ui: {
    choice: finaleChoice, endingText: finaleText, results: finaleResults, secretResults, endingDim, bossHealth: bossHealthWrap,
    resultCrown: document.querySelector("#result-crown"), resultBeetle: document.querySelector("#result-beetle"), resultRat: document.querySelector("#result-rat"),
    secretResultCrown: document.querySelector("#secret-result-crown"), secretResultBeetle: document.querySelector("#secret-result-beetle"), secretResultRat: document.querySelector("#secret-result-rat"), secretResultDragon: document.querySelector("#secret-result-dragon"),
  },
  onChoiceAvailable: () => { if (document.pointerLockElement) document.exitPointerLock(); },
  onStart: () => { targetRegistry.clear(); climbPrompt.classList.remove("visible"); displayedPromptVisibility = false; },
  onDragonReady: () => {
    targetRegistry.clear();
    player.auraWalk = true;
    player.attachCrown(level.throneCrown);
    followCamera.resetForPlayer();
    showMessage("THE DRAGON CHALLENGES THE TINY KING", "THE ASHEN DRAGON", 2.4);
  },
});
dragonBoss = finale.dragonBoss;
// Identity parents preserve actor lifecycle visibility while culling remote rooms.
for (const roomId of level.rooms.keys()) {
  const group = new DormantGroup(); group.name = `${roomId}-actors`;
  scene.add(group); actorRoomGroups.set(roomId, group); fragmentsByRoom.set(roomId, []);
}
actorRoomGroups.get("greatHall").add(enemy.group);
actorRoomGroups.get("armory").add(boss.group);
actorRoomGroups.get("royalChambers").add(ratBoss.group);
actorRoomGroups.get("throneRoom").add(finale.queen, dragonBoss.group, dragonBoss.fireWarning,
  dragonBoss.fireStream, dragonBoss.clawTelegraph, dragonBoss.clawImpact, dragonBoss.clawVisual, ...dragonBoss.gustRings);
for (const fragment of fragments) {
  actorRoomGroups.get(fragment.roomId).add(fragment.object);
  fragmentsByRoom.get(fragment.roomId).push(fragment);
}
syncRoomSystems(true);
targetRegistry.register(dragonBoss, "throneRoom");
const throneRoomTargets = [dragonBoss];
dragonBoss.on("phaseChanged", () => showMessage("THE DRAGON IS ENRAGED", "THE ASHEN DRAGON", 2.2));
dragonBoss.on("deathStarted", () => {
  endings.dragonDefeated = true;
  endings.completeSecret();
  targetRegistry.clear();
  bossHealthWrap.classList.remove("visible");
  finale.startDragonDeath();
});

function startGame() {
  if (import.meta.env.DEV) console.info("GAME START REQUESTED");
  gameStarted = true;
  fpsCounter.classList.add("visible");
  overlay.classList.add("hidden");
  if (import.meta.env.DEV) console.info("GAME STARTED", { gameStarted, titleHidden: overlay.classList.contains("hidden") });
  try {
    const request = renderer.domElement.requestPointerLock();
    if (request && typeof request.catch === "function") request.catch(() => {});
  } catch { /* The game can still be played with keyboard input if pointer lock is unavailable. */ }
}
renderer.domElement.addEventListener("click", startGame);
const handleBeginClick = () => {
  if (import.meta.env.DEV) console.info("BEGIN CLICK RECEIVED");
  startGame();
};
beginButton.addEventListener("click", handleBeginClick);
let beginClickListenerAttached = true;
controlsToggle.addEventListener("click", () => {
  const expanded = controlsToggle.getAttribute("aria-expanded") === "true";
  controlsToggle.setAttribute("aria-expanded", String(!expanded));
  controlsPanel.hidden = expanded;
});

const mapDebugGroup = new DormantGroup();
mapDebugGroup.visible = false;
scene.add(mapDebugGroup);
const mapDebugRoomBounds = [];
if (import.meta.env.DEV) {
  const roomOutlineMaterial = new THREE.LineBasicMaterial({ color: 0x7bc9d4, transparent: true, opacity: .72 });
  const arenaOutlineMaterial = new THREE.LineBasicMaterial({ color: 0xf0bb58, transparent: true, opacity: .9 });
  const markerMaterials = {
    connection: new THREE.MeshBasicMaterial({ color: 0x68d8db, depthTest: false }),
    tunnel: new THREE.MeshBasicMaterial({ color: 0x8cda73, depthTest: false }),
    fragment: new THREE.MeshBasicMaterial({ color: 0xf4d65f, depthTest: false }),
  };
  const markerGeometry = new THREE.SphereGeometry(.35, 8, 6);
  for (const room of level.rooms.values()) {
    const box = new THREE.Box3(
      new THREE.Vector3(room.bounds.minX, .05, room.bounds.minZ),
      new THREE.Vector3(room.bounds.maxX, 7.05, room.bounds.maxZ),
    );
    const helper = new THREE.Box3Helper(box, roomOutlineMaterial.clone());
    mapDebugGroup.add(helper); mapDebugRoomBounds.push({ roomId: room.id, helper });
  }
  for (const connection of level.connections) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterials.connection);
    marker.position.set(connection.center[0], 1.35, connection.center[1]);
    marker.userData.label = `${connection.from} ↔ ${connection.to}`;
    mapDebugGroup.add(marker);
  }
  for (const tunnel of level.tunnels) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterials.tunnel);
    marker.position.copy(tunnel.position); marker.userData.label = `${tunnel.roomId} tunnel`;
    mapDebugGroup.add(marker);
  }
  for (const fragment of fragmentSpawns) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterials.fragment);
    marker.position.set(...fragment.position); marker.userData.label = `crown fragment ${fragment.id}`;
    mapDebugGroup.add(marker);
  }
  for (const [bounds, label] of [[level.armoryArenaBounds, "Armory boss arena"], [level.royalChambersArenaBounds, "Royal Chambers boss arena"]]) {
    const helper = new THREE.Box3Helper(new THREE.Box3(
      new THREE.Vector3(bounds.minX, .05, bounds.minZ),
      new THREE.Vector3(bounds.maxX, 6.8, bounds.maxZ),
    ), arenaOutlineMaterial);
    helper.userData.label = label; mapDebugGroup.add(helper);
  }
}
const mapDebugPanel = document.createElement("pre");
mapDebugPanel.id = "map-debug-panel";
mapDebugPanel.setAttribute("aria-hidden", "true");
document.body.appendChild(mapDebugPanel);
let mapDebugVisible = false;
let mapDebugRefreshAt = 0;

const clock = new THREE.Clock();
let perfVisible = false;
const visualTestStates = ["IDLE_ALL_FOURS", "RUN_ALL_FOURS", "AURA_WALK", "IDLE_COMBAT", "COMBAT_WALK", "ATTACK_1", "ATTACK_2", "ATTACK_3", "DODGE", "JUMP", "DEATH", "CLIMB_UP", "KNEEL", "SIT_THRONE", "LIVE_GAME"];
let visualTestIndex = -1;
let previousFrameTime = performance.now();
let fps = 0;
let fpsSampleFrames = 0;
let sampledFrameTimeMs = 0;
let renderCpuMs = 0;
let captureStartedThisFrame = false;
let gameLoopStarted = false;
let previousParticlesSettingBeforeFreeze = null;
let fpsWindowStart = previousFrameTime;
let displayedState = "";
let displayedHealth = player.health;
let displayedEnemyHealth = enemy.health;
let displayedEnemyVisibility = false;
let displayedDamageFlash = false;
let displayedBossVisibility = false;
let displayedStaminaVisibility = false;
let displayedPromptVisibility = false;
let climbInteractionContext = "none";
let displayedFpsBand = "";
let displayedClimbStamina = -1;
const staminaWorldPosition = new THREE.Vector3();
const lockIndicatorPosition = new THREE.Vector3();
const enemyHealthWorldPosition = new THREE.Vector3();
const staminaCircumference = 169.65;
let pickupToastTimer = 0;
let reconstructionRemaining = 0;
let reconstructionNextMessage = false;
let menuOpen = false;
let travelTimer = 0;
let travelTarget = null;
let roomTitleTimer = 0;
let interactionMessageTimer = 0;
let deathRoom = null;
let blockedFragmentMessageTimer = 0;
let bossHitCalloutTimer = 0;
let bossHitCalloutTarget = boss;
let displayedBossHealth = -1;
let displayedBossBoss = null;
let visibleMeshCount = 0;
let totalMeshCount = 0;
let activeLightCount = 0;
let shadowLightCount = 0;
const reconstructionDuration = 3.8;
const frameSubsystems = { input: 0, player: 0, collision: 0, camera: 0, interactions: 0, enemies: 0, particles: 0, ui: 0, other: 0, render: 0 };
let frameInteractionChecks = 0;
let frameFragmentChecks = 0;
const captureFrameStats = {};

const sceneInventory = new SceneInventory();
const playerInventory = new SceneInventory();
function refreshScenePerformanceStats() {
  const stats = sceneInventory.read(scene);
  visibleMeshCount = stats.visibleMeshes; totalMeshCount = stats.meshes;
  activeLightCount = stats.activeLights;
  shadowLightCount = renderer.shadowMap.enabled ? stats.shadowLights : 0;
}

async function copyPerformanceSnapshot(interval) {
  refreshScenePerformanceStats();
  const playerStats = playerInventory.read(player.group);
  const playerVisualMeshes = player.visual.loadedModel ? player.visual.importedMeshCount + player.visual.weaponMeshCount : playerStats.visibleMeshes;
  const playerVisualMaterials = player.visual.loadedModel ? player.visual.importedMaterialCount + player.visual.weaponMaterialCount : playerStats.materials;
  const stats = { ...captureFrameStats, ...sceneInventory.stats,
    shadowLights: shadowLightCount,
    fps, frameMs: interval, geometries: sceneInventory.stats.geometries,
    uploadedGeometries: renderer.info.memory.geometries,
    totalRooms: level.rooms.size, staticColliders: level.colliders.length + level.connectorColliders.length,
    playerMeshes: playerStats.meshes, playerMaterials: playerStats.materials, playerShadowCasters: playerStats.visibleShadowCasters,
    playerVisualMeshes, playerCharacterMeshes: player.visual.importedMeshCount,
    playerCharacterTriangles: player.visual.importedTriangleCount, playerCharacterMaterials: player.visual.importedMaterialCount,
    playerCharacterShadowCasters: player.visual.importedShadowCasterCount, playerVisualMaterials,
    particlePrimitives: renderer.info.render.points,
  };
  const report = formatSnapshot(stats, performanceBrowserContext());
  captureReportText.value = report;
  try { await navigator.clipboard.writeText(report); showMessage("SNAPSHOT COPIED", "Send this with the K capture", 2); }
  catch {
    captureReportText.value = report; capturePanel.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
    captureReportText.focus(); captureReportText.select();
    showMessage("SNAPSHOT READY", "Use COPY PERFORMANCE REPORT", 2);
  }
}

document.querySelector("#give-crown").addEventListener("click", () => finale.chooseGive());
document.querySelector("#claim-crown").addEventListener("click", () => finale.chooseClaim());
document.querySelector("#play-again").addEventListener("click", () => location.reload());
document.querySelector("#play-again-secret").addEventListener("click", () => location.reload());

function showMessage(title, detail, duration = 2.2) {
  pickupTitle.textContent = title;
  pickupCount.textContent = detail;
  pickupToast.classList.add("visible");
  pickupToastTimer = duration;
}

const captureStatus = document.createElement("div");
captureStatus.className = "performance-capture-status";
captureStatus.setAttribute("role", "status");
document.body.appendChild(captureStatus);
const capturePanel = document.createElement("section");
capturePanel.className = "performance-capture-panel";
capturePanel.setAttribute("aria-label", "Performance capture report");
capturePanel.hidden = true;
const captureTitle = document.createElement("h2"); captureTitle.textContent = "Performance capture report";
const captureActions = document.createElement("div"); captureActions.className = "performance-capture-actions";
const copyReportButton = document.createElement("button"); copyReportButton.type = "button"; copyReportButton.textContent = "COPY PERFORMANCE REPORT";
const closeReportButton = document.createElement("button"); closeReportButton.type = "button"; closeReportButton.textContent = "CLOSE";
const captureReportText = document.createElement("textarea"); captureReportText.readOnly = true; captureReportText.spellcheck = false;
captureActions.append(copyReportButton, closeReportButton);
capturePanel.append(captureTitle, captureActions, captureReportText);
document.body.appendChild(capturePanel);
copyReportButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(captureReportText.value);
    copyReportButton.textContent = "COPIED";
  } catch {
    captureReportText.focus(); captureReportText.select();
    const copied = document.execCommand("copy");
    copyReportButton.textContent = copied ? "COPIED" : "SELECT REPORT TO COPY";
  }
  setTimeout(() => { copyReportButton.textContent = "COPY PERFORMANCE REPORT"; }, 1400);
});
closeReportButton.addEventListener("click", () => { capturePanel.hidden = true; input.clear(); });

let captureProgressUpdateAt = 0;
let latestCaptureReport = null;
let performanceCapture = { active: false };
let benchmarkMatrix = null;
let performanceCaptureInitStatus = "pending";
const performanceCaptureReady = Promise.all([import("./PerformanceCapture.js"), import("./BenchmarkMatrix.js")]).then(([{ PerformanceCapture: Capture }, { BenchmarkMatrix }]) => {
  performanceCapture = new Capture({
    durationSeconds: 15,
    onProgress(elapsed, duration) {
      if (elapsed !== 0 && elapsed - captureProgressUpdateAt < 250) return;
      captureProgressUpdateAt = elapsed;
      captureStatus.textContent = `${benchmarkMatrix?.active ? `BENCHMARK ${benchmarkMatrix.index + 1}/8: ${benchmarkMatrix.tests[benchmarkMatrix.index][0]}` : "PERFORMANCE CAPTURE"}\nRecording... ${Math.max(0, (duration - elapsed) / 1000).toFixed(1)}s`;
      captureStatus.classList.add("visible");
    },
    onComplete(report) {
      if (benchmarkMatrix?.active) { benchmarkMatrix.accept(report); return; }
      latestCaptureReport = report;
      captureReportText.value = Capture.format(report);
      captureStatus.textContent = "PERFORMANCE CAPTURE COMPLETE — PRESS K TO RUN AGAIN";
      capturePanel.hidden = false;
      input.clear();
      if (document.pointerLockElement) document.exitPointerLock();
      diagnosticModes.freezeGameLogic && (captureStatus.textContent += " | game logic frozen");
    },
  });
  benchmarkMatrix = new BenchmarkMatrix({
    capture: performanceCapture,
    snapshot: () => ({ ...perfQuality, shadows: renderer.shadowMap.enabled, hideUi: diagnosticModes.hideUi }),
    apply: applyPerformanceSettings,
    context: performanceBrowserContext,
    status: (text) => { captureStatus.textContent = text; captureStatus.classList.add("visible"); },
    format: Capture.format,
    complete: (text) => {
      captureReportText.value = text; capturePanel.hidden = false; input.clear();
      captureStatus.textContent = "BENCHMARK COMPLETE � SETTINGS RESTORED";
      if (document.pointerLockElement) document.exitPointerLock();
    },
  });
  performanceCaptureInitStatus = "ready";
  if (import.meta.env.DEV) console.info("Startup self-check: optional performance capture is ready.");
  return performanceCapture;
}).catch((error) => {
  performanceCaptureInitStatus = "unavailable";
  if (import.meta.env.DEV) console.error("Optional performance capture failed to initialize; gameplay remains available.", error);
  return null;
});

function applyPerformanceSettings(settings) {
  Object.assign(perfQuality, settings);
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.needsUpdate = settings.shadows;
  renderer.setPixelRatio(RENDER_QUALITY.pixelRatios[settings.pixelRatioIndex]);
  diagnosticModes.hideUi = settings.hideUi;
  document.body.classList.toggle("performance-ui-hidden", settings.hideUi);
  goldBurst.setEnabled(settings.particles);
  for (const owner of [boss, ratBoss, dragonBoss]) owner.setEffectsEnabled(settings.particles);
  for (const prop of level.environmentProps) prop.visible = settings.propsVisible;
  syncRoomSystems(true);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && benchmarkMatrix?.active) benchmarkMatrix.cancel("tab hidden");
});

async function startBenchmarkMatrix() {
  if (benchmarkMatrix?.active) { benchmarkMatrix.cancel("cancelled with B"); return; }
  if (!gameStarted || gameOver || menuOpen || finale.active || minimalRenderMode || diagnosticModes.freezeGameLogic || performanceCapture.active) {
    showMessage("BENCHMARK", "Start ordinary gameplay; close menus and disable M/G first", 3); return;
  }
  await performanceCaptureReady;
  if (!benchmarkMatrix) return;
  capturePanel.hidden = true; benchmarkMatrix.start();
}
async function startPerformanceCapture() {
  if (benchmarkMatrix?.active) return;
  capturePanel.hidden = true;
  captureProgressUpdateAt = 0;
  const capture = performanceCaptureInitStatus === "ready" ? performanceCapture : await performanceCaptureReady;
  if (!capture) {
    captureStatus.textContent = "PERFORMANCE CAPTURE UNAVAILABLE — GAMEPLAY IS UNAFFECTED";
    captureStatus.classList.add("visible");
    return;
  }
  captureStartedThisFrame = capture.start(performanceBrowserContext());
}

function performanceBrowserContext() {
  const gl = renderer.getContext();
  let webglVersion = "unavailable", webglVendor = "unavailable", webglRenderer = "unavailable";
  let gpuTimerQuery = "not available";
  try {
    webglVersion = gl.getParameter(gl.VERSION) || "unknown";
    webglVendor = gl.getParameter(gl.VENDOR) || "unknown";
    webglRenderer = gl.getParameter(gl.RENDERER) || "unknown";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || webglVendor;
      webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || webglRenderer;
    }
    if (typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext && gl.getExtension("EXT_disjoint_timer_query_webgl2")) gpuTimerQuery = "available (sampled asynchronously during capture)";
  } catch { /* Graphics details are optional browser capabilities. */ }
  const longTasksSupported = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask") || false;
  const diagnosticNames = [];
  if (renderer.getPixelRatio() !== 1) diagnosticNames.push(`pixel-ratio-${renderer.getPixelRatio()}`);
  if (!renderer.shadowMap.enabled) diagnosticNames.push("shadows-off");
  if (!perfQuality.localLights) diagnosticNames.push("local-lights-off");
  if (!perfQuality.particles) diagnosticNames.push("particles-off");
  if (!perfQuality.cullRooms) diagnosticNames.push("all-rooms-visible");
  if (perfQuality.currentRoomOnly) diagnosticNames.push("current-room-only");
  if (!perfQuality.propsVisible) diagnosticNames.push("props-off");
  if (diagnosticModes.hideUi) diagnosticNames.push("ui-hidden");
  if (diagnosticModes.freezeGameLogic) diagnosticNames.push("game-logic-frozen");
  if (minimalRenderMode) diagnosticNames.push("minimal-render");
  return {
    visibilityState: document.visibilityState,
    rendererSettings: JSON.stringify({ ...gl.getContextAttributes(), transparentOutput: false, logarithmicDepthBuffer: false, toneMapping: renderer.toneMapping, shadowMap: renderer.shadowMap.enabled, shadowSize: key.shadow.mapSize.x }),
    activeRoom: roomManager.currentRoomId,
    diagnosticModes: diagnosticNames.join(", ") || "normal settings",
    canvasWidth: renderer.domElement.width,
    canvasHeight: renderer.domElement.height,
    canvasCssWidth: renderer.domElement.clientWidth,
    canvasCssHeight: renderer.domElement.clientHeight,
    pixelRatio: renderer.getPixelRatio(),
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    userAgent: navigator.userAgent,
    webglVersion, webglVendor, webglRenderer, gpuTimerQuery, longTasksSupported,
  };
}

function showBossHitCallout(result, target) {
  bossHitCallout.textContent = result.defeated ? "DEFEATED" : result.blocked ? "BLOCKED" : result.vulnerable ? "HIT" : "ARMORED";
  bossHitCallout.classList.toggle("vulnerable", result.vulnerable && !result.blocked);
  bossHitCallout.classList.remove("visible");
  void bossHitCallout.offsetWidth;
  bossHitCallout.classList.add("visible");
  bossHitCalloutTimer = .75;
  bossHitCalloutTarget = target;
}

function openTunnelMenu() {
  targetRegistry.clear();
  const destinations = roomManager.destinations();
  tunnelDestinations.replaceChildren();
  for (const room of destinations) {
    const button = document.createElement("button");
    button.type = "button"; button.dataset.roomId = room.id;
    const name = document.createElement("span"); name.textContent = titleCase(room.name);
    button.appendChild(name);
    if (room.id === roomManager.currentRoomId) {
      button.classList.add("current-room");
      button.setAttribute("aria-current", "location");
      const current = document.createElement("small"); current.textContent = "CURRENT";
      button.appendChild(current);
    }
    tunnelDestinations.appendChild(button);
  }
  if (!destinations.length) return;
  menuOpen = true;
  tunnelMenu.classList.add("visible");
  tunnelDestinations.querySelector("button")?.focus();
  climbPrompt.classList.remove("visible");
  displayedPromptVisibility = false;
  if (document.pointerLockElement) document.exitPointerLock();
  input.clear();
}

function closeTunnelMenu() {
  menuOpen = false;
  tunnelMenu.classList.remove("visible");
  input.clear();
}

function titleCase(text) { return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()); }

tunnelDestinations.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-room-id]");
  if (!button) return;
  const room = level.rooms.get(button.dataset.roomId);
  const tunnel = roomManager.tunnels.get(button.dataset.roomId);
  if (!room || !tunnel) return;
  travelTarget = tunnel;
  travelTimer = .5;
  targetRegistry.clear();
  closeTunnelMenu();
  screenFade.classList.add("active");
});
tunnelClose.addEventListener("click", closeTunnelMenu);
window.addEventListener("keydown", (event) => { if (event.code === "Escape" && menuOpen) closeTunnelMenu(); });

function renderCrownProgress() {
  crownCountText.textContent = `${progression.crownFragmentsCollected} / ${progression.totalCrownFragments}`;
  crownIndicators.querySelectorAll("i").forEach((indicator, index) => {
    indicator.classList.toggle("filled", index < progression.crownFragmentsCollected);
  });
  crownHud.classList.toggle("complete", progression.crownComplete);
  crownStatus.textContent = progression.crownComplete ? "CROWN RESTORED" : "";
}

function beginCrownReconstruction() {
  pickupToast.classList.remove("visible");
  pickupToastTimer = 0;
  reconstructionRemaining = reconstructionDuration;
  reconstructionNextMessage = false;
  reconstructionMessage.textContent = "THE CROWN IS WHOLE";
  reconstructionOverlay.classList.add("active");
  player.hitStopTimer = 0;
  input.clear();
}

progression.on("fragmentCollected", ({ fragmentId, collected, total }) => {
  renderCrownProgress();
  pickupTitle.textContent = "CROWN FRAGMENT FOUND";
  pickupCount.textContent = `${collected} / ${total}`;
  pickupToast.classList.add("visible");
  pickupToastTimer = 1.45;
  const fragment = fragments.find((item) => item.id === fragmentId);
  if (fragment) {
    goldBurstRoomId = roomManager.currentRoomId;
    goldBurst.setEnabled(perfQuality.particles);
    goldBurst.burst(fragment.worldPosition);
  }
  player.hitStopTimer = Math.max(player.hitStopTimer, .18);
});
progression.on("crownComplete", () => { renderCrownProgress(); beginCrownReconstruction(); });
progression.on("tunnelDiscovered", ({ roomId }) => {
  const room = level.rooms.get(roomId);
  showMessage("RAT TUNNEL DISCOVERED", titleCase(room.name), 2.5);
});
progression.on("bossDefeated", ({ bossId }) => {
  if (bossId === "armoryBeetle") {
    showMessage("CROWN GUARDIAN DEFEATED", "THE ARMORY FRAGMENT IS YOURS", 2.8);
    bossHealthWrap.classList.remove("visible");
  } else if (bossId === "royalChambersRatKnight") {
    targetRegistry.clear();
    showMessage("CROWN GUARDIAN DEFEATED", "THE ROYAL CHAMBERS FRAGMENT IS YOURS", 2.8);
    bossHealthWrap.classList.remove("visible");
  }
});
boss.on("activated", () => showMessage("ARMORED BEETLE", "CROWN GUARDIAN", 2.2));
ratBoss.on("activated", () => showMessage("CROWN GUARDIAN", "ARMORED RAT KNIGHT", 2.0));
boss.on("defeated", ({ id }) => progression.defeatBoss(id));
ratBoss.on("defeated", ({ id }) => progression.defeatBoss(id));
renderCrownProgress();

function updateHud() {
  if (displayedHealth !== player.health) {
    displayedHealth = player.health;
    [...playerHealthText.children].forEach((heart, index) => heart.classList.toggle("lost", index >= player.health));
    playerHealthText.setAttribute("aria-label", `${player.health} of 3 hearts`);
  }
  const enemyDx = enemy.group.position.x - player.group.position.x;
  const enemyDz = enemy.group.position.z - player.group.position.z;
  const inCombatDistance = enemyDx * enemyDx + enemyDz * enemyDz <= 100;
  const wantsEnemyBar = roomManager.currentRoomId === "greatHall" && enemy.group.visible && enemy.health > 0
    && (enemy.recentDamageTimer > 0 || targetRegistry.target === enemy || (enemy.isHostile && inCombatDistance));
  let showEnemy = false;
  if (wantsEnemyBar) {
    camera.updateMatrixWorld();
    enemyHealthWorldPosition.set(enemy.group.position.x, enemy.group.position.y + 1.22, enemy.group.position.z).project(camera);
    showEnemy = enemyHealthWorldPosition.z >= -1 && enemyHealthWorldPosition.z <= 1
      && Math.abs(enemyHealthWorldPosition.x) <= 1.12 && Math.abs(enemyHealthWorldPosition.y) <= 1.12;
    if (showEnemy) {
      enemyHealthWrap.style.left = `${(enemyHealthWorldPosition.x * .5 + .5) * innerWidth}px`;
      enemyHealthWrap.style.top = `${(-enemyHealthWorldPosition.y * .5 + .5) * innerHeight}px`;
    }
  }
  if (displayedEnemyVisibility !== showEnemy) {
    displayedEnemyVisibility = showEnemy;
    enemyHealthWrap.classList.toggle("visible", showEnemy);
  }
  if (displayedEnemyHealth !== enemy.health) {
    displayedEnemyHealth = enemy.health;
    enemyHealthText.textContent = `${enemy.health} / ${enemy.healthMax}`;
    enemyHealthFill.style.width = `${(enemy.health / enemy.healthMax) * 100}%`;
  }
  const showDamageFlash = player.damageFlashTimer > 0;
  if (displayedDamageFlash !== showDamageFlash) {
    displayedDamageFlash = showDamageFlash;
    damageFlash.classList.toggle("active", showDamageFlash);
  }
  const currentBoss = roomManager.currentRoomId === "armory" ? boss : roomManager.currentRoomId === "royalChambers" ? ratBoss : roomManager.currentRoomId === "throneRoom" ? dragonBoss : null;
  const defeated = currentBoss === boss ? progression.armoryBossDefeated : currentBoss === ratBoss ? progression.royalChambersBossDefeated : currentBoss === dragonBoss ? dragonBoss.defeated : true;
  const showBoss = Boolean(currentBoss?.isActive && !defeated);
  if (displayedBossVisibility !== showBoss) {
    displayedBossVisibility = showBoss;
    bossHealthWrap.classList.toggle("visible", showBoss);
  }
  if (showBoss && (displayedBossHealth !== currentBoss.health || displayedBossBoss !== currentBoss)) {
    displayedBossHealth = currentBoss.health;
    displayedBossBoss = currentBoss;
    bossHealthName.textContent = currentBoss.name;
    bossHealthText.textContent = `${currentBoss.health} / ${currentBoss.healthMax}`;
    bossHealthFill.style.width = `${(currentBoss.health / currentBoss.healthMax) * 100}%`;
  }
  const showStamina = player.state === "CLIMB";
  if (displayedStaminaVisibility !== showStamina) {
    displayedStaminaVisibility = showStamina;
    climbStaminaHud.classList.toggle("visible", showStamina);
  }
  if (player.state === "CLIMB") {
    staminaWorldPosition.set(player.group.position.x, player.group.position.y + 1.75, player.group.position.z).project(camera);
    const screenX = (staminaWorldPosition.x * .5 + .5) * innerWidth;
    const screenY = (-staminaWorldPosition.y * .5 + .5) * innerHeight;
    climbStaminaHud.style.left = `${screenX}px`;
    climbStaminaHud.style.top = `${screenY}px`;
    const ratio = player.climbStamina / player.climbStaminaMax;
    climbStaminaArc.style.strokeDashoffset = `${(1 - ratio) * staminaCircumference}`;
    climbStaminaHud.classList.toggle("low", ratio < .25);
    const value = Math.ceil(player.climbStamina);
    if (displayedClimbStamina !== value) { displayedClimbStamina = value; climbStaminaText.textContent = `${value}`; }
  } else if (displayedClimbStamina !== -1) {
    displayedClimbStamina = -1;
  }
}

function retry() {
  targetRegistry.clear();
  player.reset(); enemy.reset(); combat.reset();
  if (deathRoom === "throneRoom" && !dragonBoss.defeated) {
    player.teleport(dragonStart, -Math.PI / 2);
    player.auraWalk = true;
    player.attachCrown(level.throneCrown);
    dragonBoss.activate();
    roomManager.currentRoomId = "throneRoom";
    followCamera.resetForPlayer();
  } else if (deathRoom === "armory" && !progression.armoryBossDefeated) {
    player.teleport(level.armorySpawn, -Math.PI / 2);
    boss.resetToIdle();
    roomManager.currentRoomId = "armory";
  } else if (deathRoom === "royalChambers" && !progression.royalChambersBossDefeated) {
    ratBoss.resetToIdle();
    player.teleport(level.royalChambersBossSafeSpawn, 0);
    roomManager.currentRoomId = "royalChambers";
  } else {
    if (!progression.armoryBossDefeated) boss.resetToIdle();
    if (!progression.royalChambersBossDefeated) ratBoss.resetToIdle();
    roomManager.currentRoomId = "greatHall";
  }
  deathRoom = null;
  gameOver = false; gameStarted = true;
  deathOverlay.classList.remove("visible");
  updateHud();
}

function updatePresentation(dt) {
  if (pickupToastTimer > 0) {
    pickupToastTimer = Math.max(0, pickupToastTimer - dt);
    if (pickupToastTimer === 0) pickupToast.classList.remove("visible");
  }
  if (reconstructionRemaining > 0) {
    reconstructionRemaining = Math.max(0, reconstructionRemaining - dt);
    input.clear();
    if (!reconstructionNextMessage && reconstructionRemaining <= 1.4) {
      reconstructionNextMessage = true;
      reconstructionMessage.textContent = "RETURN TO THE THRONE";
    }
    if (reconstructionRemaining === 0) {
      reconstructionOverlay.classList.remove("active");
      input.clear();
    }
  }
  if (interactionMessageTimer > 0) interactionMessageTimer = Math.max(0, interactionMessageTimer - dt);
  if (blockedFragmentMessageTimer > 0) blockedFragmentMessageTimer = Math.max(0, blockedFragmentMessageTimer - dt);
  if (roomTitleTimer > 0) {
    roomTitleTimer = Math.max(0, roomTitleTimer - dt);
    if (roomTitleTimer === 0) roomTitle.classList.remove("visible");
  }
  if (bossHitCalloutTimer > 0) {
    bossHitCalloutTimer = Math.max(0, bossHitCalloutTimer - dt);
    if (bossHitCalloutTimer === 0) bossHitCallout.classList.remove("visible");
  }
}

function frame() {
  requestAnimationFrame(frame);
  const frameStart = performance.now();
  syncRoomSystems();
  const interval = frameStart - previousFrameTime;
  previousFrameTime = frameStart;
  fpsSampleFrames++;
  const dt = Math.min(clock.getDelta(), .04);
  frameSubsystems.input = 0; frameSubsystems.player = 0; frameSubsystems.collision = 0;
  frameSubsystems.camera = 0; frameSubsystems.interactions = 0; frameSubsystems.enemies = 0;
  frameSubsystems.particles = 0; frameSubsystems.ui = 0; frameSubsystems.other = 0; frameSubsystems.render = 0;
  frameInteractionChecks = 0; frameFragmentChecks = 0; captureStartedThisFrame = false;
  if (travelTimer > 0) {
    travelTimer = Math.max(0, travelTimer - dt);
    if (travelTimer <= .28 && travelTarget) {
      const dx = travelTarget.position.x - travelTarget.spawn.x;
      const dz = travelTarget.position.z - travelTarget.spawn.z;
      player.teleport(travelTarget.spawn, Math.atan2(-dx, -dz));
      roomManager.currentRoomId = travelTarget.roomId;
      if (travelTarget.roomId !== "armory" && !progression.armoryBossDefeated) boss.resetToIdle();
      if (travelTarget.roomId !== "royalChambers" && !progression.royalChambersBossDefeated) ratBoss.resetToIdle();
      targetRegistry.clear();
      travelTarget = null;
    }
    if (travelTimer === 0) screenFade.classList.remove("active");
  }
  player.collisionChecks = 0; combat.hitChecks = 0;
  player.climbables.lastChecks = 0; roomManager.lastTunnelChecks = 0;
  updatePresentation(dt);
  const particleStart = performance.now();
  const roomFragments = fragmentsByRoom.get(roomManager.currentRoomId) || emptyFragments;
  if (!diagnosticModes.freezeGameLogic) {
    for (const fragment of roomFragments) if (!fragment.collected || fragment.collectionAnimating) fragment.update(dt);
    if (goldBurstRoomId === roomManager.currentRoomId) goldBurst.update(dt);
    else if (goldBurst.active) goldBurst.setEnabled(false);
  }
  frameSubsystems.particles += performance.now() - particleStart;

  const inputTimingStart = performance.now();
  const retryPressed = input.consume("KeyR");
  if (gameOver && retryPressed) retry();
  if (import.meta.env.DEV && input.consume("KeyO") && !benchmarkMatrix?.active) {
    renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
    renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
    showMessage("SHADOWS", renderer.shadowMap.enabled ? "ON" : "OFF", 1.1);
  }
  if (import.meta.env.DEV && input.consume("KeyL") && !benchmarkMatrix?.active) {
    perfQuality.localLights = !perfQuality.localLights;
    litRoomId = null; syncRoomLighting();
    showMessage("LOCAL LIGHTS", perfQuality.localLights ? "ON" : "OFF", 1.1);
  }
  if (import.meta.env.DEV && input.consume("KeyV") && !benchmarkMatrix?.active) {
    perfQuality.particles = !perfQuality.particles;
    goldBurst.setEnabled(perfQuality.particles);
    for (const effectOwner of [boss, ratBoss, dragonBoss]) effectOwner.setEffectsEnabled(perfQuality.particles);
    showMessage("PARTICLES / VFX", perfQuality.particles ? "ON" : "OFF", 1.1);
  }
  if (import.meta.env.DEV && input.consume("KeyB")) {
    startBenchmarkMatrix();
  }
  if (import.meta.env.DEV && input.consume("KeyP") && !benchmarkMatrix?.active) {
    perfQuality.propsVisible = !perfQuality.propsVisible;
    for (const prop of level.environmentProps) prop.visible = perfQuality.propsVisible;
    showMessage("ENVIRONMENT PROPS", perfQuality.propsVisible ? "ON" : "OFF", 1.1);
  }
  if (import.meta.env.DEV && input.consume("BracketLeft") && !benchmarkMatrix?.active) {
    perfQuality.pixelRatioIndex = (perfQuality.pixelRatioIndex + 1) % RENDER_QUALITY.pixelRatios.length;
    renderer.setPixelRatio(RENDER_QUALITY.pixelRatios[perfQuality.pixelRatioIndex]);
    showMessage("PIXEL RATIO", renderer.getPixelRatio().toFixed(2), 1.1);
  }
  if (import.meta.env.DEV && input.consume("KeyN") && !benchmarkMatrix?.active) {
    perfQuality.currentRoomOnly = !perfQuality.currentRoomOnly;
    if (perfQuality.currentRoomOnly) perfQuality.cullRooms = true;
    syncRoomVisibility();
    showMessage("ROOM VISIBILITY", perfQuality.currentRoomOnly ? "CURRENT ROOM ONLY" : "CURRENT + ADJACENT", 1.1);
  }
  if (import.meta.env.DEV && input.consume("KeyM") && !benchmarkMatrix?.active) {
    setMinimalRenderMode(!minimalRenderMode);
    showMessage("MINIMAL RENDER", minimalRenderMode ? "ON" : "OFF", 1.1);
  }
  if (import.meta.env.DEV && input.consume("KeyU") && !benchmarkMatrix?.active) {
    diagnosticModes.hideUi = !diagnosticModes.hideUi;
    document.body.classList.toggle("performance-ui-hidden", diagnosticModes.hideUi);
    showMessage("GAME UI", diagnosticModes.hideUi ? "HIDDEN" : "VISIBLE", 1.1);
  }
  if (import.meta.env.DEV && input.consume("KeyG") && !benchmarkMatrix?.active) {
    diagnosticModes.freezeGameLogic = !diagnosticModes.freezeGameLogic;
    player.interactionsEnabled = !diagnosticModes.freezeGameLogic;
    if (diagnosticModes.freezeGameLogic) {
      previousParticlesSettingBeforeFreeze = perfQuality.particles;
      perfQuality.particles = false;
    } else if (previousParticlesSettingBeforeFreeze !== null) {
      perfQuality.particles = previousParticlesSettingBeforeFreeze;
      previousParticlesSettingBeforeFreeze = null;
    }
    goldBurst.setEnabled(perfQuality.particles && !diagnosticModes.freezeGameLogic);
    for (const effectOwner of [boss, ratBoss, dragonBoss]) effectOwner.setEffectsEnabled(perfQuality.particles && !diagnosticModes.freezeGameLogic);
    if (diagnosticModes.freezeGameLogic) targetRegistry.clear();
    showMessage("GAME SYSTEMS", diagnosticModes.freezeGameLogic ? "FROZEN" : "RUNNING", 1.1);
  }
  if (import.meta.env.DEV && input.consume("KeyK") && !performanceCapture.active) {
    void startPerformanceCapture();
  }
  if (!finale.active && input.consume("F4")) {
    const enabled = !swordDebugVolume.visible;
    swordDebugVolume.visible = enabled;
    boss.setHitboxDebug(enabled);
    bossDebugPanel.classList.toggle("visible", enabled);
  }
  if (!finale.active && input.consume("F5")) {
    boss.forceVulnerable = !boss.forceVulnerable;
    showMessage("DEBUG VULNERABILITY", boss.forceVulnerable ? "FORCED ON" : "FORCED OFF", 1.5);
  }
  if (!finale.active && input.consume("F6")) {
    targetRegistry.clear();
    if (!gameStarted) { gameStarted = true; overlay.classList.add("hidden"); }
    if (!player.alive) player.reset();
    if (!progression.armoryBossDefeated && boss.isActive) boss.resetToIdle();
    player.teleport(level.armorySpawn, -Math.PI / 2);
    roomManager.currentRoomId = "armory";
    gameOver = false; deathOverlay.classList.remove("visible"); deathRoom = null;
    input.clear();
  }
  if (!finale.active && input.consume("F7")) {
    targetRegistry.clear();
    if (!gameStarted) { gameStarted = true; overlay.classList.add("hidden"); }
    if (!player.alive) player.reset();
    if (!progression.royalChambersBossDefeated && ratBoss.isActive) ratBoss.resetToIdle();
    player.teleport(level.royalChambersBossSafeSpawn, 0);
    roomManager.currentRoomId = "royalChambers";
    gameOver = false; deathOverlay.classList.remove("visible"); deathRoom = null;
    input.clear();
  }
  if (import.meta.env.DEV && !finale.active && input.consume("F8")) {
    targetRegistry.clear();
    if (!gameStarted) { gameStarted = true; overlay.classList.add("hidden"); }
    if (!player.alive) player.reset();
    player.teleport(level.throneRoomDebugSpawn, 0);
    roomManager.currentRoomId = "throneRoom";
    gameOver = false; deathOverlay.classList.remove("visible"); deathRoom = null;
    input.clear();
  }
  if (import.meta.env.DEV && !finale.active && input.consume("F9")) {
    targetRegistry.clear();
    if (!gameStarted) { gameStarted = true; overlay.classList.add("hidden"); }
    if (!player.alive) player.reset();
    progression.prepareFinaleDebugState();
    reconstructionRemaining = 0; reconstructionOverlay.classList.remove("active");
    for (const fragment of fragments) { fragment.collected = true; fragment.collectionAnimating = false; fragment.object.visible = false; }
    for (const debugBoss of [boss, ratBoss]) { debugBoss.health = 0; debugBoss.attackType = "NONE"; debugBoss.state = "DEAD"; debugBoss.group.visible = false; }
    renderCrownProgress();
    player.teleport(level.throneRoomDebugSpawn, 0);
    roomManager.currentRoomId = "throneRoom";
    gameOver = false; deathOverlay.classList.remove("visible"); deathRoom = null;
    input.clear();
  }
  if (import.meta.env.DEV && !finale.active && input.consume("F10")) {
    targetRegistry.clear();
    if (!gameStarted) { gameStarted = true; overlay.classList.add("hidden"); }
    if (!player.alive) player.reset();
    progression.prepareFinaleDebugState();
    for (const fragment of fragments) { fragment.collected = true; fragment.collectionAnimating = false; fragment.object.visible = false; }
    for (const debugBoss of [boss, ratBoss]) { debugBoss.health = 0; debugBoss.attackType = "NONE"; debugBoss.state = "DEAD"; debugBoss.group.visible = false; }
    endings.prepareDragonDebug(); finale.prepareDragonDebug();
    player.teleport(dragonStart, -Math.PI / 2); player.auraWalk = true; player.attachCrown(level.throneCrown);
    roomManager.currentRoomId = "throneRoom";
    gameOver = false; deathOverlay.classList.remove("visible"); deathRoom = null;
    renderCrownProgress(); input.clear();
  }
  if (import.meta.env.DEV && !finale.active && input.consume("F11")) {
    dragonBoss.setForcedVulnerable(!dragonBoss.forceVulnerable);
    showMessage("DEBUG DRAGON VULNERABILITY", dragonBoss.forceVulnerable ? "FORCED ON" : "FORCED OFF", 1.5);
  }
  frameSubsystems.input = performance.now() - inputTimingStart;
  const tabLockToggle = input.consume("Tab");
  const middleMouseLockToggle = input.consumeLockOn();
  const playerVisualTestActive = import.meta.env.DEV && visualTestIndex >= 0 && visualTestStates[visualTestIndex] !== "LIVE_GAME";
  if (!finale.active && (tabLockToggle || middleMouseLockToggle) && gameStarted && !gameOver && !menuOpen && travelTimer <= 0) {
    if (targetRegistry.target) targetRegistry.clear();
    else if (targetRegistry.toggle(player, roomManager.currentRoomId, camera)) player.enterCombat();
    else showMessage("NO LOCKABLE TARGET", "FACE A HOSTILE IN RANGE", 1.2);
  }
  if (finale.active) {
    if (!diagnosticModes.freezeGameLogic) finale.update(dt);
  } else if (playerVisualTestActive) {
    // Freeze the encounter while cycling poses so combat cannot interrupt inspection.
    targetRegistry.clear();
  } else if (gameStarted && capturePanel.hidden && !gameOver && reconstructionRemaining <= 0 && !menuOpen && travelTimer <= 0) {
    if (player.hitStopTimer > 0) player.hitStopTimer = Math.max(0, player.hitStopTimer - dt);
    else {
      let lockTarget = diagnosticModes.freezeGameLogic ? null : targetRegistry.update(player, roomManager.currentRoomId, dt);
      if (player.state === "CLIMB") { targetRegistry.clear(); lockTarget = null; }
      player.lastCollisionMs = 0;
      const playerUpdateStart = performance.now();
      player.update(dt, input, followCamera, lockTarget);
      const playerElapsed = performance.now() - playerUpdateStart;
      frameSubsystems.collision += player.lastCollisionMs;
      frameSubsystems.player += Math.max(0, playerElapsed - player.lastCollisionMs);
      if (dragonBoss.isActive && roomManager.currentRoomId === "throneRoom") {
        player.group.position.x = THREE.MathUtils.clamp(player.group.position.x, 28, 41.1);
        player.group.position.z = THREE.MathUtils.clamp(player.group.position.z, -38.5, -22.5);
      }
      const changedRoom = roomManager.updateCurrentRoom(player.group.position);
      if (changedRoom) {
        syncRoomSystems(true);
        roomTitle.textContent = changedRoom.name;
        roomTitle.classList.add("visible");
        roomTitleTimer = 1.5;
        if (changedRoom.id !== "armory" && !progression.armoryBossDefeated && boss.isActive) boss.resetToIdle();
        if (changedRoom.id !== "royalChambers" && !progression.royalChambersBossDefeated && ratBoss.isActive) ratBoss.resetToIdle();
        if (changedRoom.id !== targetRegistry.targetRoomId) targetRegistry.clear();
      }
      const enemyUpdateStart = performance.now();
      if (!diagnosticModes.freezeGameLogic) {
        enemy.group.visible = roomManager.currentRoomId === "greatHall" && enemy.status !== "DEAD";
        if (roomManager.currentRoomId === "greatHall") enemy.update(dt, player);
        else enemy.playerHit = false;
        if (roomManager.currentRoomId === "armory" && (!progression.armoryBossDefeated || boss.isDead)) boss.update(dt, player);
        else if (roomManager.currentRoomId !== "armory" && !progression.armoryBossDefeated && boss.isActive) boss.resetToIdle();
        if (roomManager.currentRoomId === "royalChambers" && (!progression.royalChambersBossDefeated || ratBoss.isDead)) ratBoss.update(dt, player);
        else if (roomManager.currentRoomId !== "royalChambers" && !progression.royalChambersBossDefeated && ratBoss.isActive) ratBoss.resetToIdle();
        if (roomManager.currentRoomId === "throneRoom" && dragonBoss.isActive) dragonBoss.update(dt, player);
        lockTarget = targetRegistry.update(player, roomManager.currentRoomId, dt);
      }
      frameSubsystems.enemies += performance.now() - enemyUpdateStart;
      const interactionStart = performance.now();
      const nearbyTunnel = diagnosticModes.freezeGameLogic || dragonBoss.isActive ? null : roomManager.nearbyTunnel(player.group.position, roomManager.currentRoomId);
      if (!diagnosticModes.freezeGameLogic) frameInteractionChecks += roomManager.lastTunnelChecks || 0;
      if (nearbyTunnel) roomManager.discover(nearbyTunnel);
      const throneDx = player.group.position.x - level.thronePosition.x;
      const throneDz = player.group.position.z - level.thronePosition.z;
      const throneRadius = progression.crownComplete ? 5.4 : 2.8;
      const atThrone = roomManager.currentRoomId === "throneRoom" && throneDx * throneDx + throneDz * throneDz <= throneRadius * throneRadius;
      let interaction = null;
      if (player.nearbyClimbable && player.grounded && !player.attackActive && player.dodgeTimer <= 0) interaction = { type: "climb", target: player.nearbyClimbable, prompt: "E — CLIMB" };
      else if (nearbyTunnel) interaction = { type: "tunnel", target: nearbyTunnel, prompt: "E — ENTER RAT TUNNEL" };
      else if (atThrone) interaction = { type: "throne", prompt: progression.crownComplete ? "E — APPROACH THE THRONE" : "E — THE THRONE AWAITS ITS CROWN" };
      climbInteractionContext = interaction?.type || (player.state === "CLIMB" ? "climb (E detach)" : "none");
      const prompt = interaction?.prompt || (player.state === "CLIMB" ? "E — DETACH" : "");
      const promptLabel = prompt.replace(/^E\s*[—-]\s*/, "");
      if (climbPromptLabel.textContent !== promptLabel) climbPromptLabel.textContent = promptLabel;
      const showPrompt = Boolean(interaction) || player.state === "CLIMB";
      if (displayedPromptVisibility !== showPrompt) {
        displayedPromptVisibility = showPrompt;
        climbPrompt.classList.toggle("visible", showPrompt);
      }
      if (!diagnosticModes.freezeGameLogic && input.consume("KeyE") && interaction) {
        if (interaction.type === "tunnel") openTunnelMenu();
        else if (interaction.type === "climb") player.beginClimb(interaction.target);
        else if (!progression.crownComplete) showMessage("THE THRONE AWAITS ITS CROWN", `CROWN FRAGMENTS: ${progression.crownFragmentsCollected} / ${progression.totalCrownFragments}`, 2.5);
        else {
          if (!finale.start()) showMessage("THE THRONE AWAITS ITS CROWN", "CROWN FRAGMENTS: 5 / 5", 2.5);
        }
      }
      const dx = enemy.group.position.x - player.group.position.x;
      const dz = enemy.group.position.z - player.group.position.z;
      if (!diagnosticModes.freezeGameLogic && enemy.isHostile && dx * dx + dz * dz <= enemy.disengageRange * enemy.disengageRange) player.enterCombat();
      const combatTargets = roomManager.currentRoomId === "armory" ? armoryTargets : roomManager.currentRoomId === "royalChambers" ? royalChambersTargets : roomManager.currentRoomId === "throneRoom" ? throneRoomTargets : greatHallTargets;
      if (!diagnosticModes.freezeGameLogic) combat.resolveAttack(combatTargets);
      if (combat.lastHit?.target === boss || combat.lastHit?.target === ratBoss) {
        const result = combat.lastHit;
        if (!result.defeated) showMessage(result.blocked ? "BLOCKED" : result.vulnerable ? "HIT" : "ARMORED SHELL", result.damage ? `${result.damage} DAMAGE` : "NO DAMAGE", .72);
        showBossHitCallout(result, result.target);
      }
      const activeAttacker = roomManager.currentRoomId === "armory" ? boss : roomManager.currentRoomId === "royalChambers" ? ratBoss : roomManager.currentRoomId === "throneRoom" ? dragonBoss : enemy;
      if (!diagnosticModes.freezeGameLogic && player.alive && activeAttacker.playerHit && player.takeDamage(activeAttacker.group.position)) {
        if (!player.alive) {
          deathRoom = roomManager.currentRoomId;
          targetRegistry.clear();
          gameOver = true; deathOverlay.classList.add("visible");
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }
      if (!diagnosticModes.freezeGameLogic && player.alive && !progression.crownComplete) {
        for (const fragment of fragmentsByRoom.get(roomManager.currentRoomId) || emptyFragments) {
          if (fragment.collected) continue;
          frameFragmentChecks++;
          const guardedFragment = fragment.id === 3 && !progression.armoryBossDefeated || fragment.id === 5 && !progression.royalChambersBossDefeated;
          if (guardedFragment) {
            const dx = player.group.position.x - fragment.worldPosition.x;
            const dy = player.group.position.y - fragment.worldPosition.y;
            const dz = player.group.position.z - fragment.worldPosition.z;
            if (dx * dx + dy * dy + dz * dz <= fragment.triggerRadiusSquared && blockedFragmentMessageTimer <= 0) {
              showMessage("A CROWN GUARDIAN", "BLOCKS YOUR CLAIM", 1.4);
              blockedFragmentMessageTimer = 1.8;
            }
            continue;
          }
          if (fragment.tryCollect(player.group.position)) progression.collectFragment(fragment.id);
          if (reconstructionRemaining > 0) break;
        }
      }
      
      frameSubsystems.interactions += performance.now() - interactionStart;
    }
  }

  const cameraUpdateStart = performance.now();
  const mouseMovement = input.consumeMouse();
  const cameraLockTarget = !playerVisualTestActive && !finale.active && reconstructionRemaining <= 0 ? targetRegistry.update(player, roomManager.currentRoomId, dt) : null;
  if (!finale.active && reconstructionRemaining <= 0) followCamera.update(dt, mouseMovement, player.group.position, player.state === "CLIMB", cameraLockTarget, roomManager.currentRoomId);
  if (cameraLockTarget) {
    lockIndicatorPosition.set(cameraLockTarget.group.position.x, cameraLockTarget.group.position.y + (cameraLockTarget.lockHeight || 1), cameraLockTarget.group.position.z).project(camera);
    const onscreen = lockIndicatorPosition.z >= -1 && lockIndicatorPosition.z <= 1 && Math.abs(lockIndicatorPosition.x) <= 1.1 && Math.abs(lockIndicatorPosition.y) <= 1.1;
    lockOnIndicator.classList.toggle("visible", onscreen);
    lockOnIndicator.style.left = `${(lockIndicatorPosition.x * .5 + .5) * innerWidth}px`;
    lockOnIndicator.style.top = `${(-lockIndicatorPosition.y * .5 + .5) * innerHeight}px`;
  } else lockOnIndicator.classList.remove("visible");
  if (bossHitCalloutTimer > 0) {
    staminaWorldPosition.set(bossHitCalloutTarget.group.position.x, bossHitCalloutTarget.group.position.y + (bossHitCalloutTarget.lockHeight || 2.35) + .35, bossHitCalloutTarget.group.position.z).project(camera);
    bossHitCallout.style.left = `${(staminaWorldPosition.x * .5 + .5) * innerWidth}px`;
    bossHitCallout.style.top = `${(-staminaWorldPosition.y * .5 + .5) * innerHeight}px`;
  }
  frameSubsystems.camera = performance.now() - cameraUpdateStart;
  const uiUpdateStart = performance.now();
  if (player.state !== displayedState) { displayedState = player.state; stateLabel.textContent = displayedState; }
  updateHud();
  if (swordDebugVolume.visible) {
    swordDebugVolume.position.copy(player.group.position).addScaledVector(combat.forward.set(-Math.sin(player.group.rotation.y), 0, -Math.cos(player.group.rotation.y)), 1.6);
    swordDebugVolume.position.y += .78;
    swordDebugVolume.rotation.y = player.group.rotation.y;
    bossDebugPanel.textContent = `BOSS HITBOX DEBUG  (F4 hide)\nF5 forced vulnerable: ${boss.forceVulnerable ? "ON" : "OFF"}   F6 Armory entry\nLast sword result: ${combat.lastSwordResult}\nBoss state: ${boss.state} / ${boss.attackType}\nVulnerable: ${boss.vulnerable}\nYellow: sword volume   Blue: shell region   Green: weak point`;
  }
  syncRoomSystems();
  frameSubsystems.ui += performance.now() - uiUpdateStart;
  const visualStart = performance.now();
  player.updateVisual(dt);
  frameSubsystems.player += performance.now() - visualStart;
  const updateCpuMs = performance.now() - frameStart;
  if (performanceCapture.active) gpuTimer.poll((ms, token) => { if (token === performanceCapture.startedAt) performanceCapture.recordGpu(ms); });
  const renderStart = performance.now();
  if (performanceCapture.active) gpuTimer.begin(renderStart, performanceCapture.startedAt);
  renderer.render(scene, camera);
  gpuTimer.end();
  renderCpuMs = performance.now() - renderStart;
  const postRenderUiStart = performance.now();
  if (import.meta.env.DEV && !finale.active && input.consume("F2")) {
    if (gameOver || !player.alive) retry();
    visualTestIndex = (visualTestIndex + 1) % visualTestStates.length;
    const nextState = visualTestStates[visualTestIndex];
    player.visualTestState = nextState === "LIVE_GAME" ? null : nextState;
    targetRegistry.clear();
    input.clear();
    showMessage(nextState === "LIVE_GAME" ? "PLAYER VISUAL TEST" : "PLAYER VISUAL TEST", nextState.replaceAll("_", " "), 1.15);
  }
  if (input.consume("F3")) { perfVisible = !perfVisible; perfPanel.classList.toggle("visible", perfVisible); player.visual.setFootIKDebugVisible(perfVisible); }
  if (import.meta.env.DEV && input.consume("F12")) {
    mapDebugVisible = !mapDebugVisible;
    mapDebugGroup.visible = mapDebugVisible;
    mapDebugPanel.classList.toggle("visible", mapDebugVisible);
    mapDebugPanel.setAttribute("aria-hidden", String(!mapDebugVisible));
  }
  if (mapDebugVisible && performance.now() >= mapDebugRefreshAt) {
    mapDebugRefreshAt = performance.now() + 250;
    const room = level.rooms.get(roomManager.currentRoomId);
    mapDebugPanel.textContent = `MAP DEBUG  (F12 hide)\nCurrent room: ${room.name}\nBounds X ${room.bounds.minX.toFixed(1)}..${room.bounds.maxX.toFixed(1)}  Z ${room.bounds.minZ.toFixed(1)}..${room.bounds.maxZ.toFixed(1)}\nConnections: ${level.connections.map(({ from, to }) => `${from}–${to}`).join("  | ")}\nMarkers: cyan doorway  green tunnel  gold fragment\nBoss arenas: Armory and Royal Chambers`;
    for (const { roomId, helper } of mapDebugRoomBounds) helper.material.color.set(roomId === room.id ? 0xffffff : 0x7bc9d4);
  }
  const now = performance.now();
  if (now - fpsWindowStart >= 250) {
    const sampleDuration = now - fpsWindowStart;
    fps = fpsSampleFrames * 1000 / sampleDuration;
    sampledFrameTimeMs = sampleDuration / Math.max(1, fpsSampleFrames);
    fpsSampleFrames = 0;
    const fpsValue = Math.round(fps);
    const fpsBand = fpsValue >= 60 ? "good" : fpsValue >= 40 ? "warn" : "bad";
    if (fpsCounterValue.textContent !== `${fpsValue}`) fpsCounterValue.textContent = `${fpsValue}`;
    if (displayedFpsBand !== fpsBand) {
      displayedFpsBand = fpsBand;
      fpsCounter.dataset.performance = fpsBand;
    }
    if (perfVisible || performanceCapture.active) {
      const memory = renderer.info.memory;
      const debugBoss = roomManager.currentRoomId === "throneRoom" ? dragonBoss : roomManager.currentRoomId === "royalChambers" ? ratBoss : roomManager.currentRoomId === "armory" ? boss : null;
      refreshScenePerformanceStats();
      const activeEnemies = Number(roomManager.currentRoomId === "greatHall")
        + Number(roomManager.currentRoomId === "armory" && (!progression.armoryBossDefeated || boss.isDead))
        + Number(roomManager.currentRoomId === "royalChambers" && (!progression.royalChambersBossDefeated || ratBoss.isDead))
        + Number(roomManager.currentRoomId === "throneRoom" && dragonBoss.isActive);
      if (perfVisible) {
        const climbSurface = player.climbTarget || player.nearbyClimbable;
        const climbPosition = player.group.position;
        const climbDx = climbSurface ? climbPosition.x - climbSurface.origin.x : 0;
        const climbDz = climbSurface ? climbPosition.z - climbSurface.origin.z : 0;
        const climbHitDistance = climbSurface ? climbDx * climbSurface.normal.x + climbDz * climbSurface.normal.z : null;
        const climbForwardX = -Math.sin(player.group.rotation.y);
        const climbForwardZ = -Math.cos(player.group.rotation.y);
        const climbSurfaceName = climbSurface ? (climbSurface.object.name || climbSurface.object.userData.climbableName || "registered surface") : "none";
        const leftFootY = player.visual.getFootWorldY("left");
        const rightFootY = player.visual.getFootWorldY("right");
        const leftFootIK = player.visual.footIK?.left;
        const rightFootIK = player.visual.footIK?.right;
        const lockTargetName = targetRegistry.target?.name || targetRegistry.target?.group?.name || targetRegistry.target?.constructor?.name || "none";
        const groundSurfaceName = typeof player.groundContact.surface === "string" ? player.groundContact.surface : player.groundContact.surface ? "support collider" : "none";
        perfPanel.textContent = `FPS             ${fps.toFixed(1)}\nFrame time      ${sampledFrameTimeMs.toFixed(2)} ms avg\nPlayer visual   ${player.visualHeight.toFixed(2)} m\nCollider        ${player.height.toFixed(2)} m high / ${player.radius.toFixed(2)} m radius\nDoor/player     ${(CASTLE_SCALE.humanDoorHeight / player.visualHeight).toFixed(1)}x\nPlanar speed    ${player.planarSpeed.toFixed(2)} m/s\nVertical speed  ${player.velocity.y.toFixed(2)} m/s\nGrounded        ${player.groundContact.valid} (physics ${player.grounded})\nGround Y        ${player.groundContact.point.y.toFixed(3)} m\nGround distance ${player.groundContact.distance.toFixed(3)} m\nGround surface  ${groundSurfaceName}\nMove input      ${player.moveInputActive}\nGameplay state  ${player.state}\nLeft foot Y     ${leftFootY === null ? "n/a" : `${leftFootY.toFixed(3)} m`}\nRight foot Y    ${rightFootY === null ? "n/a" : `${rightFootY.toFixed(3)} m`}\nLeft Foot Ray   ${leftFootIK?.hit ? "hit" : "miss"}${leftFootIK?.hitDistance == null ? "" : ` ${leftFootIK.hitDistance.toFixed(3)} m`}\nRight Foot Ray  ${rightFootIK?.hit ? "hit" : "miss"}${rightFootIK?.hitDistance == null ? "" : ` ${rightFootIK.hitDistance.toFixed(3)} m`}\nLeft Foot Target Y  ${leftFootIK?.targetY == null ? "n/a" : `${leftFootIK.targetY.toFixed(3)} m`}\nRight Foot Target Y ${rightFootIK?.targetY == null ? "n/a" : `${rightFootIK.targetY.toFixed(3)} m`}\nLEFT surface       ${typeof leftFootIK?.surface === "string" ? leftFootIK.surface : leftFootIK?.surface?.name || "support collider"}\nLEFT ground Y      ${leftFootIK?.hitY == null ? "n/a" : `${leftFootIK.hitY.toFixed(3)} m`}\nLEFT target ankle  ${leftFootIK?.targetY == null ? "n/a" : `${leftFootIK.targetY.toFixed(3)} m`}\nLEFT actual ankle  ${leftFootIK?.ankleWorld ? `${leftFootIK.ankleWorld.y.toFixed(3)} m` : "n/a"}\nLEFT visible sole  ${leftFootIK?.visibleSoleY == null ? "n/a" : `${leftFootIK.visibleSoleY.toFixed(3)} m`}\nLEFT sole gap      ${leftFootIK?.visibleSoleY == null || leftFootIK?.hitY == null ? "n/a" : `${(leftFootIK.visibleSoleY - leftFootIK.hitY).toFixed(3)} m`}\nLEFT ankle error   ${leftFootIK?.ankleTargetError == null ? "n/a" : `${leftFootIK.ankleTargetError.toFixed(3)} m`}\nRIGHT surface      ${typeof rightFootIK?.surface === "string" ? rightFootIK.surface : rightFootIK?.surface?.name || "support collider"}\nRIGHT ground Y     ${rightFootIK?.hitY == null ? "n/a" : `${rightFootIK.hitY.toFixed(3)} m`}\nRIGHT target ankle ${rightFootIK?.targetY == null ? "n/a" : `${rightFootIK.targetY.toFixed(3)} m`}\nRIGHT actual ankle ${rightFootIK?.ankleWorld ? `${rightFootIK.ankleWorld.y.toFixed(3)} m` : "n/a"}\nRIGHT visible sole ${rightFootIK?.visibleSoleY == null ? "n/a" : `${rightFootIK.visibleSoleY.toFixed(3)} m`}\nRIGHT sole gap     ${rightFootIK?.visibleSoleY == null || rightFootIK?.hitY == null ? "n/a" : `${(rightFootIK.visibleSoleY - rightFootIK.hitY).toFixed(3)} m`}\nRIGHT ankle error  ${rightFootIK?.ankleTargetError == null ? "n/a" : `${rightFootIK.ankleTargetError.toFixed(3)} m`}\nAnkle-to-sole cfg  ${player.visual.footIK?.left?.soleOffset.toFixed(4) ?? "n/a"} / ${player.visual.footIK?.right?.soleOffset.toFixed(4) ?? "n/a"} m\nMeasured sole dz  ${leftFootIK?.visibleSoleY == null || !leftFootIK?.ankleWorld ? "n/a" : (leftFootIK.ankleWorld.y-leftFootIK.visibleSoleY).toFixed(4)} / ${rightFootIK?.visibleSoleY == null || !rightFootIK?.ankleWorld ? "n/a" : (rightFootIK.ankleWorld.y-rightFootIK.visibleSoleY).toFixed(4)} m\nSole clearance     ${player.visual.footIK ? "0.0030 m" : "n/a"}\nDesired pelvis     ${(player.visual.desiredPelvisOffset || 0).toFixed(3)} m\nActual pelvis      ${player.visual.pelvisOffset.toFixed(3)} m\nLeft IK Weight  ${leftFootIK?.weight.toFixed(2) ?? "0.00"}\nRight IK Weight ${rightFootIK?.weight.toFixed(2) ?? "0.00"}\nPelvis Offset   ${player.visual.pelvisOffset.toFixed(3)} m\nAnimation       ${player.visual.animationController?.currentClip || player.visualState}\nAura enabled    ${player.auraWalk}\nAura anim active ${player.visualState === "AURA_WALK"}\nUpdate CPU      ${updateCpuMs.toFixed(2)} ms\nRender CPU      ${renderCpuMs.toFixed(2)} ms\nDraw calls      ${renderer.info.render.calls}\nTriangles       ${renderer.info.render.triangles}\nVisible meshes  ${visibleMeshCount} / ${totalMeshCount}\nGeometries      ${memory.geometries}\nTextures        ${memory.textures}\nActive lights   ${activeLightCount}\nShadow lights   ${shadowLightCount}\nPixel ratio     ${renderer.getPixelRatio().toFixed(2)}\nCanvas          ${renderer.domElement.width} x ${renderer.domElement.height}\nVisible Rooms   ${minimalRenderMode ? 0 : visibleRoomCount}\nUpdating Rooms  ${gameStarted && !gameOver && !menuOpen && capturePanel.hidden ? 1 : 0}\nActive room     ${roomManager.currentRoomId}\nActive enemies  ${activeEnemies}\nActive bosses   ${Number(Boolean(debugBoss?.isActive))}\nCollision checks ${player.collisionChecks}\nInteraction checks ${frameInteractionChecks + frameFragmentChecks + (player.climbables?.lastChecks || 0) + combat.hitChecks}\nRaycasts/frame  0 (none in project)\nShadows         ${renderer.shadowMap.enabled ? "ON" : "OFF"}\nLocal lights    ${perfQuality.localLights ? "ON" : "OFF"}\nParticles       ${perfQuality.particles ? "ON" : "OFF"}\nRoom culling    ${perfQuality.cullRooms ? "ON" : "OFF"}\nRoom mode       ${perfQuality.currentRoomOnly ? "CURRENT ONLY" : "CURRENT + NEAR DOORWAY"}\nProps           ${perfQuality.propsVisible ? "ON" : "OFF"}\nMinimal render  ${minimalRenderMode ? "ON" : "OFF"}\nUI hidden       ${diagnosticModes.hideUi}\nLogic frozen    ${diagnosticModes.freezeGameLogic}\nCapture         ${performanceCapture.active ? "RECORDING" : "K = 15s capture; J = snapshot"}\nDev keys        O shadows L lights V VFX B matrix N current-only\n                M minimal U UI G logic P props [ pixel ratio\nState           ${player.state}\nClimb State     ${player.state === "CLIMB" ? player.climbVisualState : "inactive"}\nClimb Candidate ${player.nearbyClimbable ? climbSurfaceName : "none"}\nClimb Hit Dist  ${climbHitDistance === null ? "n/a" : `${climbHitDistance.toFixed(2)} m / attach ${climbSurface.attachDistance.toFixed(2)} m`}\nClimb Surface   ${climbSurfaceName}\nClimb Ray Hit   N/A - registered-surface proximity test\nClimb Origin    ${climbPosition.x.toFixed(2)}, ${climbPosition.y.toFixed(2)}, ${climbPosition.z.toFixed(2)} (gameplay root)\nClimb Forward   ${climbForwardX.toFixed(2)}, 0, ${climbForwardZ.toFixed(2)} (gameplay yaw)\nSurface Normal  ${climbSurface ? `${climbSurface.normal.x.toFixed(2)}, ${climbSurface.normal.y.toFixed(2)}, ${climbSurface.normal.z.toFixed(2)}` : "n/a"}\nClimb stamina   ${player.climbStamina.toFixed(0)}\nClimb target    ${player.climbTarget?.object.name || player.nearbyClimbable?.object.name || "none"}\nInteraction Ctx ${climbInteractionContext}\nLock target     ${lockTargetName}\nTarget distance ${targetRegistry.target ? `${targetRegistry.targetDistance.toFixed(2)} m` : "n/a"}\nLock candidates ${targetRegistry.lastCandidateCount}\nCamera pitch    ${(followCamera.pitch * 180 / Math.PI).toFixed(1)} deg\nCamera distance ${followCamera.desiredDistance.toFixed(2)} / ${followCamera.actualDistance.toFixed(2)} m\nCamera blocked  ${followCamera.cameraObstructed}\nBoss state      ${debugBoss?.state || "none"}\nBoss HP         ${debugBoss ? `${debugBoss.health} / ${debugBoss.healthMax}` : "none"}\nBoss guard      ${debugBoss?.state === "GUARD" || false}\nBoss attack     ${debugBoss?.currentAttack || debugBoss?.attackType || "none"}\nBoss stagger    ${debugBoss ? `${debugBoss.stagger || 0} / ${debugBoss.staggerThreshold || 0}` : "none"}\nDragon phase    ${dragonBoss.phase}\nDragon state    ${dragonBoss.state}\nDragon HP      ${dragonBoss.health} / ${dragonBoss.healthMax}\nDragon attack   ${dragonBoss.currentAttack}\nVulnerable      ${dragonBoss.vulnerable}\nStagger         ${dragonBoss.stagger} / ${dragonBoss.staggerThreshold}\nDamage zone     ${dragonBoss.activeDamageZone}\nCrown           ${progression.crownFragmentsCollected} / ${progression.totalCrownFragments}${progression.crownComplete ? " COMPLETE" : ""}\nFinale          ${finale.phase}\nEnding          ${endings.endingState}\nChoice Made     ${endings.throneChoiceMade}\nCrown on Player ${endings.crownClaimedByPlayer}\nDragon Unlocked ${endings.dragonEncounterUnlocked}\n${player.visual.animationController?.debugText() || "Animation        PENDING GLB"}`;
      }
    }
    fpsWindowStart = now;
  }
  frameSubsystems.ui += performance.now() - postRenderUiStart;
  frameSubsystems.render = renderCpuMs;
  const measuredSubsystems = frameSubsystems.input + frameSubsystems.player + frameSubsystems.collision
    + frameSubsystems.camera + frameSubsystems.interactions + frameSubsystems.enemies + frameSubsystems.particles + frameSubsystems.ui;
  frameSubsystems.other = Math.max(0, performance.now() - frameStart - renderCpuMs - measuredSubsystems);
  if (benchmarkMatrix?.active) {
    const ctx = benchmarkMatrix.initialContext;
    const invalid = document.hidden ? "tab hidden" : gameOver ? "player died" : roomManager.currentRoomId !== ctx.activeRoom ? "room changed"
      : menuOpen || finale.active || travelTimer > 0 || reconstructionRemaining > 0 ? "gameplay interrupted"
      : innerWidth !== ctx.canvasCssWidth || innerHeight !== ctx.canvasCssHeight ? "window resized" : null;
    if (benchmarkMatrix.tick(performance.now(), invalid)) captureStartedThisFrame = true;
  }
  if (performanceCapture.active || (import.meta.env.DEV && input.pressed.has("KeyJ"))) {
    captureFrameStats.hidden = Number(document.hidden);
    captureFrameStats.gameOver = Number(gameOver);
    captureFrameStats.activeRoom = roomManager.currentRoomId;
    captureFrameStats.drawCalls = renderer.info.render.calls;
    captureFrameStats.triangles = renderer.info.render.triangles;
    captureFrameStats.points = renderer.info.render.points;
    captureFrameStats.lines = renderer.info.render.lines;
    captureFrameStats.geometries = renderer.info.memory.geometries;
    captureFrameStats.textures = renderer.info.memory.textures;
    captureFrameStats.visibleMeshes = visibleMeshCount;
    captureFrameStats.activeEnvironmentGroups = minimalRenderMode ? 0 : visibleEnvironmentCount;
    captureFrameStats.visibleRooms = minimalRenderMode ? 0 : visibleRoomCount;
    captureFrameStats.updatingRooms = gameStarted && !gameOver && !menuOpen && capturePanel.hidden ? 1 : 0;
    captureFrameStats.activeLights = activeLightCount;
    captureFrameStats.shadowLights = shadowLightCount;
    captureFrameStats.activeEnemies = Number(roomManager.currentRoomId === "greatHall" && enemy.isHostile) + Number(roomManager.currentRoomId === "armory" && boss.isActive) + Number(roomManager.currentRoomId === "royalChambers" && ratBoss.isActive) + Number(roomManager.currentRoomId === "throneRoom" && dragonBoss.isActive);
    captureFrameStats.activeBosses = Number(roomManager.currentRoomId === "armory" && boss.isActive) + Number(roomManager.currentRoomId === "royalChambers" && ratBoss.isActive) + Number(roomManager.currentRoomId === "throneRoom" && dragonBoss.isActive);
    captureFrameStats.activeParticles = Number(goldBurst.active && goldBurstRoomId === roomManager.currentRoomId) + Number(roomManager.currentRoomId === "armory" && boss.sparkTimer > 0) + Number(roomManager.currentRoomId === "royalChambers" && ratBoss.sparkTimer > 0) + Number(roomManager.currentRoomId === "throneRoom" && dragonBoss.smoke.visible);
    captureFrameStats.collisionChecks = player.collisionChecks;
    captureFrameStats.raycasts = 0;
    captureFrameStats.interactionChecks = frameInteractionChecks + frameFragmentChecks + (player.climbables?.lastChecks || 0) + combat.hitChecks;
    if (import.meta.env.DEV && input.consume("KeyJ")) void copyPerformanceSnapshot(interval);
    if (performanceCapture.active && !captureStartedThisFrame) performanceCapture.record(interval, frameSubsystems, captureFrameStats, performance.now(), frameStart);
  }
}
function runStartupSelfCheck() {
  if (!import.meta.env.DEV) return;
  const buttonRect = beginButton?.getBoundingClientRect();
  const topAtButton = buttonRect && document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2);
  const startupChecks = {
    beginButtonExists: Boolean(beginButton),
    beginClickListenerAttached,
    canvasExists: Boolean(root.querySelector("canvas")),
    gameLoopExists: typeof frame === "function" && gameLoopStarted,
    performanceCapture: performanceCaptureInitStatus,
    beginButtonReceivesPointer: Boolean(beginButton && topAtButton && (beginButton === topAtButton || beginButton.contains(topAtButton))),
  };
  const failedChecks = Object.entries(startupChecks).filter(([name, value]) =>
    name === "performanceCapture" ? value === "unavailable" : value === false,
  );
  if (failedChecks.length) console.error("Game startup self-check failed.", startupChecks);
  else console.info("Game startup self-check passed.", startupChecks);
}
frame();
gameLoopStarted = true;
runStartupSelfCheck();
window.addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// TODO: add camera obstruction raycasting after the graybox camera distance feels right.
