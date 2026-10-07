import * as THREE from "three";
import { DormantGroup } from "./SceneOptimization.js";
import { ClimbableRegistry } from "./ClimbableRegistry.js";
import { PLAYER_VISUAL_HEIGHT } from "./PlayerScale.js";

// Keep the established rat height as the reference for human-scale architecture.
export const CASTLE_SCALE = Object.freeze({
  playerHeight: PLAYER_VISUAL_HEIGHT,
  architecturalGrid: 6,
  humanDoorHeight: 9.5,
  standardWallHeight: 12.5,
  greatHallWallHeight: 16,
  throneWallHeight: 16,
  greatHallCeilingHeight: 21,
  throneCeilingHeight: 22,
});

const definitions = [
  { id: "greatHall", name: "GREAT HALL", center: [0, 0], size: [42, 30], doors: ["north", "south", "east", "west"], color: 0x555653, floor: 0x373a39 },
  { id: "royalKitchen", name: "ROYAL KITCHEN", center: [0, 37], size: [28, 24], doors: ["east"], color: 0x61594b, floor: 0x403b33 },
  { id: "armory", name: "ARMORY", center: [31, 37], size: [24, 24], doors: ["west"], color: 0x555b5e, floor: 0x353a3d },
  { id: "dungeon", name: "DUNGEON", center: [62, 37], size: [24, 24], doors: ["north"], color: 0x414343, floor: 0x292d2e },
  { id: "royalChambers", name: "ROYAL CHAMBERS", center: [62, 0], size: [24, 24], doors: ["south", "east"], color: 0x655a57, floor: 0x423b3a },
  { id: "throneRoom", name: "THRONE ROOM", center: [36, 0], size: [32, 30], doors: ["west"], color: 0x554346, floor: 0x382e31 },
];

const roomOffsets = {
  greatHall: [0, 0], royalKitchen: [-36, -37], armory: [4, -37],
  dungeon: [-62, -3], royalChambers: [-62, -31], throneRoom: [-6, -31],
};
const boxGeometryCache = new Map();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitFloor = new THREE.PlaneGeometry(1, 1);
const barrelGeometry = new THREE.CylinderGeometry(.75, .9, 1.8, 10);
const tunnelHoleGeometry = new THREE.CylinderGeometry(.62, .62, .09, 16);
const tunnelArchGeometry = new THREE.TorusGeometry(.72, .12, 6, 16, Math.PI);
const columnShaftGeometry = new THREE.CylinderGeometry(.42, .48, 1, 10);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
const brazierFlameGeometry = new THREE.ConeGeometry(1, 1, 7);
const chainLinkGeometry = new THREE.TorusGeometry(.08, .018, 4, 8);
const armorHeadGeometry = new THREE.SphereGeometry(.3, 8, 6);

function getBoxGeometry(size) {
  const key = size.join("x");
  let geometry = boxGeometryCache.get(key);
  if (!geometry) { geometry = new THREE.BoxGeometry(...size); boxGeometryCache.set(key, geometry); }
  return geometry;
}

function makeBox(group, material, size, position, colliders, options = {}) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(...size);
  mesh.position.set(...position); mesh.castShadow = options.castShadow ?? (size[1] > .15 && size[0] * size[1] * size[2] >= 2); mesh.receiveShadow = true; group.add(mesh);
  if (options.collision !== false) colliders.push({ minX: position[0] - size[0] / 2, maxX: position[0] + size[0] / 2, minZ: position[2] - size[2] / 2, maxZ: position[2] + size[2] / 2, minY: position[1] - size[1] / 2, maxY: position[1] + size[1] / 2, ...(options.supportTop ? { supportTop: true } : {}) });
  return mesh;
}

function makeFloor(group, color, x, z, width, depth) {
  const floor = new THREE.Mesh(unitFloor, color);
  floor.scale.set(width, depth, 1);
  floor.rotation.x = -Math.PI / 2; floor.position.set(x, -.02, z); floor.receiveShadow = true; group.add(floor);
}

function addStaticBox(group, material, size, position, rotation = null) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(...size); mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = false; mesh.receiveShadow = false; group.add(mesh);
  return mesh;
}

function addRoomFloorDetails(group, materials, x, z, width, depth) {
  const seamY = -.008;
  for (let offset = -width / 2 + CASTLE_SCALE.architecturalGrid; offset < width / 2 - 1; offset += CASTLE_SCALE.architecturalGrid) {
    addStaticBox(group, materials.floorSeam, [.035, .018, depth - 1], [x + offset, seamY, z]);
  }
  for (let offset = -depth / 2 + CASTLE_SCALE.architecturalGrid; offset < depth / 2 - 1; offset += CASTLE_SCALE.architecturalGrid) {
    addStaticBox(group, materials.floorSeam, [width - 1, .018, .035], [x, seamY, z + offset]);
  }
  const border = .16;
  for (const side of [-1, 1]) {
    addStaticBox(group, materials.oldStone, [width, .05, border], [x, .006, z + side * (depth / 2 - border / 2)]);
    addStaticBox(group, materials.oldStone, [border, .05, depth,], [x + side * (width / 2 - border / 2), .006, z]);
  }
}

function addWallDetails(group, materials, side, center, size, hasDoor, doorWidth, wallHeight) {
  const horizontal = side === "north" || side === "south";
  const [x, z] = center; const [width, depth] = size;
  const length = horizontal ? width : depth;
  const half = length / 2;
  const coordinate = side === "north" ? z - depth / 2 : side === "south" ? z + depth / 2 : side === "west" ? x - width / 2 : x + width / 2;
  const inward = side === "north" || side === "west" ? 1 : -1;
  const wallThickness = .8;
  const placeStrip = (alongCenter, alongLength, y, height, material, thickness = .2) => {
    const pos = horizontal
      ? [x + alongCenter, y, coordinate + inward * (wallThickness / 2 + thickness / 2 - .035)]
      : [coordinate + inward * (wallThickness / 2 + thickness / 2 - .035), y, z + alongCenter];
    const stripSize = horizontal ? [alongLength, height, thickness] : [thickness, height, alongLength];
    addStaticBox(group, material, stripSize, pos);
  };
  placeStrip(0, length, .24, .42, materials.oldStone, .3);
  placeStrip(0, length, wallHeight - .35, .5, materials.trim, .36);
  const baySpacing = CASTLE_SCALE.architecturalGrid;
  const bayOffsets = [];
  for (let offset = -half + baySpacing; offset < half - 1; offset += baySpacing) bayOffsets.push(offset);
  for (const offset of bayOffsets) {
    if (hasDoor && Math.abs(offset) < doorWidth / 2 + .9) continue;
    placeStrip(offset, .66, wallHeight / 2, wallHeight - .9, materials.oldStone, .42);
    placeStrip(offset, 1.2, .47, .22, materials.bronze, .44);
    placeStrip(offset, 1.05, wallHeight - .82, .2, materials.bronze, .44);
  }

  if (hasDoor) {
    const doorHeight = Math.min(CASTLE_SCALE.humanDoorHeight, wallHeight - 1.5);
    const jambOffset = doorWidth / 2 + .12;
    for (const sign of [-1, 1]) {
      placeStrip(sign * jambOffset, .58, doorHeight / 2, doorHeight, materials.trim, .48);
      placeStrip(sign * jambOffset, .92, .55, .25, materials.bronze, .56);
      placeStrip(sign * jambOffset, .92, doorHeight - .2, .24, materials.bronze, .56);
    }
    placeStrip(0, doorWidth + .9, doorHeight + .22, .44, materials.oldStone, .55);
    placeStrip(0, doorWidth + .55, doorHeight + .5, .16, materials.bronze, .6);
  }
}

function addTunnelFrame(group, material, position) {
  const [x, y, z] = position;
  addStaticBox(group, material, [.18, 1.15, .2], [x - .7, y + .38, z + .1]);
  addStaticBox(group, material, [.18, 1.15, .2], [x + .7, y + .38, z + .1]);
  addStaticBox(group, material, [1.55, .2, .22], [x, y + .95, z + .1]);
  addStaticBox(group, material, [.42, .16, .34], [x - .93, y + .08, z + .27]);
  addStaticBox(group, material, [.36, .13, .3], [x + .94, y + .07, z + .28]);
}

function addCeilingStructure(group, material, center, size, ceilingHeight, baySpacing = CASTLE_SCALE.architecturalGrid) {
  const [x, z] = center; const [width, depth] = size;
  const beamY = ceilingHeight - .58;
  for (let offset = -depth / 2 + baySpacing / 2; offset < depth / 2; offset += baySpacing) {
    addStaticBox(group, material, [width - 1.2, .72, .72], [x, beamY, z + offset]);
  }
  for (const side of [-1, 1]) {
    addStaticBox(group, material, [.72, .72, depth - 1.2], [x + side * (width / 2 - 3), beamY - .38, z]);
  }
}

function wallWithDoor(group, mat, colliders, side, center, size, doorWidth = 6, h = CASTLE_SCALE.standardWallHeight) {
  const [x, z] = center; const [w, d] = size; const t = .8; const half = (side === "north" || side === "south" ? w : d) / 2;
  const openingHeight = Math.min(CASTLE_SCALE.humanDoorHeight, h - 1.5);
  const headerHeight = h - openingHeight;
  const horizontal = side === "north" || side === "south";
  const coordinate = side === "north" ? z - d / 2 : side === "south" ? z + d / 2 : side === "west" ? x - w / 2 : x + w / 2;
  if (side === "north" || side === "south") {
    makeBox(group, mat, [half - doorWidth / 2, h, t], [x - (half + doorWidth / 2) / 2, h / 2, coordinate], colliders);
    makeBox(group, mat, [half - doorWidth / 2, h, t], [x + (half + doorWidth / 2) / 2, h / 2, coordinate], colliders);
    makeBox(group, mat, [doorWidth, headerHeight, t], [x, openingHeight + headerHeight / 2, coordinate], colliders);
  } else {
    makeBox(group, mat, [t, h, half - doorWidth / 2], [coordinate, h / 2, z - (half + doorWidth / 2) / 2], colliders);
    makeBox(group, mat, [t, h, half - doorWidth / 2], [coordinate, h / 2, z + (half + doorWidth / 2) / 2], colliders);
    makeBox(group, mat, [t, headerHeight, doorWidth], [coordinate, openingHeight + headerHeight / 2, z], colliders);
  }
}

function plainWall(group, mat, colliders, side, center, size, h = CASTLE_SCALE.standardWallHeight) {
  const [x, z] = center; const [w, d] = size;
  const args = side === "north" || side === "south"
    ? [[w, h, .8], [x, h / 2, z + (side === "north" ? -d / 2 : d / 2)]]
    : [[.8, h, d], [x + (side === "west" ? -w / 2 : w / 2), h / 2, z]];
  makeBox(group, mat, args[0], args[1], colliders);
}

function addTunnel(group, room, material, darkMaterial, colliders) {
  const [x, y, z] = room.tunnel.position;
  const hole = new THREE.Mesh(tunnelHoleGeometry, darkMaterial);
  hole.rotation.x = Math.PI / 2; hole.position.set(x, y, z); group.add(hole);
  const arch = new THREE.Mesh(tunnelArchGeometry, material);
  arch.rotation.z = Math.PI; arch.position.set(x, y, z + .04); group.add(arch);
  addTunnelFrame(group, material, room.tunnel.position);
}

export function createTestLevel(scene) {
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: 0x514e49, roughness: .96 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x292b2c, roughness: .98 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x49392b, roughness: .88 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x756956, roughness: .92 }),
    oldStone: new THREE.MeshStandardMaterial({ color: 0x625c52, roughness: .94 }),
    floorSeam: new THREE.MeshStandardMaterial({ color: 0x282a2a, roughness: 1 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x77603b, metalness: .48, roughness: .56 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x383b3b, metalness: .58, roughness: .62 }),
    armoryStone: new THREE.MeshStandardMaterial({ color: 0x414548, roughness: .96 }),
    throneStone: new THREE.MeshStandardMaterial({ color: 0x493a3b, roughness: .94 }),
    ivory: new THREE.MeshStandardMaterial({ color: 0xb4a78d, roughness: .92 }),
    flame: new THREE.MeshStandardMaterial({ color: 0xff9b3e, emissive: 0xff641a, emissiveIntensity: 1.6, roughness: .48 }),
    red: new THREE.MeshStandardMaterial({ color: 0x593238, roughness: .91 }),
    tunnel: new THREE.MeshStandardMaterial({ color: 0x111314, roughness: 1 }),
  };
  const rooms = new Map(); const colliders = []; const connectorColliders = []; const environmentProps = []; const climbables = new ClimbableRegistry();
  // Visual-only foot supports, stored once in world coordinates. Imported
  // floors/platforms can register the same lightweight bounds + top-Y shape.
  const footContactSurfaces = new Map();
  const roomLights = [];
  const floorMaterials = new Map();
  for (const def of definitions) {
    const group = new DormantGroup(); group.name = def.id; scene.add(group);
    const roomColliders = []; const roomClimbables = [];
    const [x, z] = def.center; const [w, d] = def.size;
    const wallHeight = def.id === "greatHall" ? CASTLE_SCALE.greatHallWallHeight
      : def.id === "throneRoom" ? CASTLE_SCALE.throneWallHeight : CASTLE_SCALE.standardWallHeight;
    const ceilingHeight = def.id === "greatHall" ? CASTLE_SCALE.greatHallCeilingHeight
      : def.id === "throneRoom" ? CASTLE_SCALE.throneCeilingHeight : wallHeight + 2.5;
    let floorMaterial = floorMaterials.get(def.floor);
    if (!floorMaterial) floorMaterials.set(def.floor, floorMaterial = new THREE.MeshStandardMaterial({ color: def.floor, roughness: .97 }));
    makeFloor(group, floorMaterial, x, z, w, d);
    addRoomFloorDetails(group, materials, x, z, w, d);
    const mat = def.id === "dungeon" ? materials.dark : def.id === "armory" ? materials.armoryStone : def.id === "throneRoom" ? materials.throneStone : materials.stone;
    for (const side of ["north", "south", "east", "west"]) {
      const doorWidth = side === "south" && def.id === "greatHall" ? 14 : 6;
      if (def.doors.includes(side)) wallWithDoor(group, mat, roomColliders, side, def.center, def.size, doorWidth, wallHeight);
      else plainWall(group, mat, roomColliders, side, def.center, def.size, wallHeight);
      addWallDetails(group, materials, side, def.center, def.size, def.doors.includes(side), doorWidth, wallHeight);
    }
    addCeilingStructure(group, materials.wood, def.center, def.size, ceilingHeight);
    const room = { ...def, group, wallHeight, ceilingHeight, bounds: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }, spawn: new THREE.Vector3(), colliders: roomColliders, climbables: roomClimbables, tunnel: null, fragmentPosition: null };
    rooms.set(def.id, room);

    const lightSpecs = {
      greatHall: [[0xffd29a, 4.2, 34, [0, 11, 2]], [0xffc47d, 2.4, 26, [0, 11, -11]]],
      royalKitchen: [[0xffa95b, 3.2, 24, [0, 8, 37]]],
      armory: [[0xffc47d, 3.0, 24, [31, 8, 37]]],
      dungeon: [[0xffa765, 2.4, 18, [62, 7, 37]]],
      royalChambers: [[0xffd8a0, 3.0, 26, [62, 8, -1]]],
      throneRoom: [[0xffc778, 4.2, 34, [36, 12, -3]], [0xffd29a, 2.3, 24, [36, 12, -10]]],
    }[def.id];
    for (const [color, intensity, distance, position] of lightSpecs) {
      const light = new THREE.PointLight(color, intensity, distance, 2);
      light.position.set(...position); group.add(light); roomLights.push({ roomId: def.id, light });
    }
  }

  const get = (id) => rooms.get(id); const G = (id) => get(id).group; const C = (id) => get(id).colliders;
  const addFurniture = (id, material, size, position, options = {}) => {
    const mesh = makeBox(G(id), material, size, position, C(id), options);
    if (options.environmentProp ?? !options.supportTop) environmentProps.push(mesh);
    return mesh;
  };
  const addPropBox = (id, material, size, position) => addFurniture(id, material, size, position, { collision: false, environmentProp: true, castShadow: false });
  const addFootContactProp = (id, name, material, size, position) => {
    const mesh = addPropBox(id, material, size, position);
    mesh.name = name;
    const [dx, dz] = roomOffsets[id];
    let surfaces = footContactSurfaces.get(id);
    if (!surfaces) footContactSurfaces.set(id, surfaces = []);
    surfaces.push({ name, minX: position[0] + dx - size[0] / 2, maxX: position[0] + dx + size[0] / 2,
      minZ: position[2] + dz - size[2] / 2, maxZ: position[2] + dz + size[2] / 2, topY: position[1] + size[1] / 2 });
    return mesh;
  };
  const addStaticCylinder = (id, geometry, material, position, scale, isProp = false) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = false; mesh.receiveShadow = false; G(id).add(mesh);
    if (isProp) environmentProps.push(mesh);
    return mesh;
  };
  const addColumn = (id, x, z, height = CASTLE_SCALE.standardWallHeight - .8, radius = .92) => {
    addStaticCylinder(id, columnShaftGeometry, materials.oldStone, [x, height / 2, z], [radius * 2, height, radius * 2]);
    addFurniture(id, materials.trim, [radius * 2.35, .62, radius * 2.35], [x, .31, z], { collision: false, environmentProp: false, castShadow: false });
    addFurniture(id, materials.trim, [radius * 2.2, .7, radius * 2.2], [x, height - .35, z], { collision: false, environmentProp: false, castShadow: false });
    addFurniture(id, materials.bronze, [radius * 2.05, .12, radius * 2.05], [x, .68, z], { collision: false, environmentProp: false, castShadow: false });
    C(id).push({ minX: x - radius, maxX: x + radius, minY: 0, maxY: height, minZ: z - radius, maxZ: z + radius });
  };
  const addBrazier = (id, x, z, scale = 1) => {
    const y = .66 * scale;
    addPropBox(id, materials.oldStone, [.42 * scale, .82 * scale, .42 * scale], [x, y * .56, z]);
    addStaticCylinder(id, cylinderGeometry, materials.iron, [x, y + .12 * scale, z], [.76 * scale, .24 * scale, .76 * scale], true);
    const flame = addStaticCylinder(id, brazierFlameGeometry, materials.flame, [x, y + .55 * scale, z], [.22 * scale, .55 * scale, .22 * scale], true);
    flame.rotation.y = .2;
  };
  const addRug = (id, x, z, width, depth, material = materials.red) => {
    addFootContactProp(id, `${id} Rug`, material, [width, .045, depth], [x, .025, z]);
    for (const side of [-1, 1]) {
      addFootContactProp(id, `${id} Rug Border`, materials.bronze, [width, .025, .075], [x, .062, z + side * (depth / 2 - .12)]);
      addFootContactProp(id, `${id} Rug Border`, materials.bronze, [.075, .025, depth,], [x + side * (width / 2 - .12), .062, z]);
    }
  };
  const addWallBanner = (id, x, z, width, height, material = materials.red) => {
    const top = get(id).wallHeight - .72, bottom = Math.max(1.25, top - height), centerY = (top + bottom) / 2;
    const panelHeight = top - bottom;
    addPropBox(id, material, [width, panelHeight, .07], [x, centerY, z]);
    addPropBox(id, materials.bronze, [width + .3, .22, .24], [x, top + .12, z]);
    addPropBox(id, materials.ivory, [.12, panelHeight * .52, .035], [x, centerY, z - .055]);
  };
  const addArmorStand = (x, z, height = 2.0) => {
    const id = "armory";
    addPropBox(id, materials.iron, [1.1, height * .48, .72], [x, height * .42, z]);
    addPropBox(id, materials.iron, [1.8, .62, .85], [x, height * .78, z]);
    addStaticCylinder(id, armorHeadGeometry, materials.iron, [x, height * .94, z], [1.02, 1.18, 1.02], true);
    for (const side of [-1, 1]) {
      addPropBox(id, materials.iron, [.46, height * .45, .54], [x + side * .78, height * .38, z]);
      addPropBox(id, materials.iron, [.38, height * .34, .5], [x + side * 1.04, height * .78, z]);
    }
    addPropBox(id, materials.bronze, [1.8, .24, 1.2], [x, .12, z]);
  };
  const addHumanTable = (id, x, z, width, depth, topY, material = materials.wood) => {
    const topThickness = .28, legWidth = .38, legHeight = topY - topThickness;
    const top = addFurniture(id, material, [width, topThickness, depth], [x, topY - topThickness / 2, z], { supportTop: true, environmentProp: false, castShadow: false });
    for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
      addFurniture(id, material, [legWidth, legHeight, legWidth], [x + sideX * (width / 2 - .7), legHeight / 2, z + sideZ * (depth / 2 - .7)], { environmentProp: false, castShadow: false });
    }
    return top;
  };
  const addClimbPanelX = (id, x, z, normalX, width, topY, landing) => {
    const panel = addFurniture(id, materials.red, [.12, topY, width], [x, topY / 2, z], { collision: false, environmentProp: false, castShadow: false });
    roomClimb(id, panel, [x, 0, z], [normalX, 0, 0], [0, 0, 1], width / 2, topY, landing);
    return panel;
  };
  const addClimbPanelZ = (id, x, z, normalZ, width, topY, landing) => {
    const panel = addFurniture(id, materials.red, [width, topY, .12], [x, topY / 2, z], { collision: false, environmentProp: false, castShadow: false });
    roomClimb(id, panel, [x, 0, z], [0, 0, normalZ], [1, 0, 0], width / 2, topY, landing);
    return panel;
  };
  const addGate = (id, x, z, gap = 1.6) => {
    const barCount = 7, span = 5.4, spacing = span / (barCount - 1), gateHeight = CASTLE_SCALE.humanDoorHeight;
    for (let i = 0; i < barCount; i++) {
      const dz = -span / 2 + i * spacing;
      if (Math.abs(dz) < gap / 2 + .01) continue;
      addFurniture(id, materials.iron, [.24, gateHeight, .24], [x, gateHeight / 2, z + dz], { collision: false, environmentProp: false, castShadow: false });
    }
    addFurniture(id, materials.iron, [.36, .12, 6.1], [x, gateHeight + .06, z], { collision: false, environmentProp: false, castShadow: false });
    // Two simple screen colliders preserve the rat-width door gap while avoiding
    // one gameplay collider for every visible iron bar.
    const segmentDepth = (span - gap) / 2;
    for (const side of [-1, 1]) {
      const centerZ = z + side * (gap / 2 + segmentDepth / 2);
      C(id).push({ minX: x - .12, maxX: x + .12, minY: 0, maxY: gateHeight, minZ: centerZ - segmentDepth / 2, maxZ: centerZ + segmentDepth / 2 });
    }
    C(id).push({ minX: x - .18, maxX: x + .18, minY: gateHeight, maxY: gateHeight + .12, minZ: z - 3.05, maxZ: z + 3.05 });
  };

  // Great Hall: one entrance-to-dais axis, two structural column rows, and a clear aisle.
  addFurniture("greatHall", materials.oldStone, [14.3, 1.13, 7], [0, .565, -1.8], { supportTop: true, environmentProp: false });
  for (let i = 0; i < 5; i++) {
    const height = .28 * (i + 1), z = 6.025 - i * 1.15;
    addFurniture("greatHall", materials.stone, [14.3, height, 1.15], [0, height / 2, z], { collision: false, environmentProp: false, castShadow: false });
  }
  for (const x of [-17, 17]) for (const z of [-9, -3, 3, 9]) addColumn("greatHall", x, z, CASTLE_SCALE.greatHallWallHeight - .8, 1.05);
  for (const x of [-10, 10]) {
    addHumanTable("greatHall", x, -.5, 5.2, 17, 3.8);
    const innerEdge = x > 0 ? x - 2.6 : x + 2.6, normalX = x > 0 ? -1 : 1;
    addClimbPanelX("greatHall", innerEdge, -.5, normalX, 4.6, 3.8, {
      normalOffset: -.35, y: 3.8,
      minX: x > 0 ? 8.6 : -11.4, maxX: x > 0 ? 11.4 : -8.6, minZ: -2.8, maxZ: 1.8,
    });
  }
  addFootContactProp("greatHall", "Great Hall Rug", materials.red, [7.5, .055, 25], [0, .035, 0]);
  for (const x of [-3.75, 3.75]) addFootContactProp("greatHall", "Great Hall Rug Border", materials.bronze, [.08, .035, 25], [x, .07, 0]);
  for (const x of [-13, 13]) addWallBanner("greatHall", x, -14.45, 4.4, 8.4);
  addWallBanner("greatHall", 0, -14.45, 7.5, 9.2, materials.ivory);
  addBrazier("greatHall", -17.5, -8, 2.5); addBrazier("greatHall", 17.5, -8, 2.5);

  // Kitchen: east service entrance opens to a prep island; storage and hearth stay on the north/west edge.
  for (const x of [-9, 9]) {
    const counterHeight = 3.8;
    addFurniture("royalKitchen", materials.wood, [4.5, counterHeight, 3.4], [x, counterHeight / 2, 37], { supportTop: true, environmentProp: false, castShadow: false });
    if (x > 0) addClimbPanelX("royalKitchen", 6.75, 37, -1, 3.1, counterHeight, {
      normalOffset: -.35, y: counterHeight, minX: 7.2, maxX: 10.8, minZ: 35.5, maxZ: 38.5,
    });
  }
  addHumanTable("royalKitchen", -.5, 37, 8.2, 4.4, 3.8);
  // One monumental hearth with a readable fire mouth, backed by the storage wall.
  addPropBox("royalKitchen", materials.dark, [5.8, 6.4, 1.15], [-10.5, 3.2, 44]);
  addPropBox("royalKitchen", materials.oldStone, [.7, 6.1, 1.45], [-13.0, 3.05, 43.75]);
  addPropBox("royalKitchen", materials.oldStone, [.7, 6.1, 1.45], [-8.0, 3.05, 43.75]);
  addPropBox("royalKitchen", materials.oldStone, [5.8, .4, 1.45], [-10.5, 6.35, 43.75]);
  addPropBox("royalKitchen", materials.flame, [3.2, 1.6, .12], [-10.5, 2.05, 43.32]);
  for (const x of [-5, 2]) {
    for (const y of [3.2, 5.8]) addFurniture("royalKitchen", materials.wood, [5, .24, 1.15], [x, y, 26], { supportTop: true, environmentProp: true, castShadow: false });
    for (const dx of [-2.2, 2.2]) addPropBox("royalKitchen", materials.wood, [.18, 5.9, 1.2], [x + dx, 2.95, 26]);
  }
  for (const x of [9.6, 11.8]) {
    const barrel = new THREE.Mesh(barrelGeometry, materials.wood); barrel.position.set(x, .9, 46); barrel.castShadow = false; G("royalKitchen").add(barrel);
    environmentProps.push(barrel);
    C("royalKitchen").push({ minX: x - .9, maxX: x + .9, minY: 0, maxY: 1.8, minZ: 45.1, maxZ: 46.9 });
  }
  const towel = addFurniture("royalKitchen", materials.red, [7, 7.5, .1], [0, 3.75, 48.1], { collision: false, environmentProp: false, castShadow: false });
  roomClimb("royalKitchen", towel, [0, 0, 48.15], [0, 0, -1], [1, 0, 0], 3.5, 7.5);

  // Armory: an intentionally empty 20 x 20 m combat floor with equipment only at the perimeter.
  const addWeaponRack = (x, z) => {
    addPropBox("armory", materials.wood, [1, 6, 5.2], [x, 3, z]);
    for (const side of [-1, 0, 1]) {
      addPropBox("armory", materials.iron, [1.1, 4.8, .28], [x + (x < 31 ? .55 : -.55), 3.7, z + side * 1.35]);
      addPropBox("armory", materials.bronze, [1.5, .28, .5], [x + (x < 31 ? .55 : -.55), .5, z + side * 1.35]);
    }
  };
  addWeaponRack(20.2, 31); addWeaponRack(20.2, 43); addWeaponRack(41.8, 31);
  addArmorStand(22.4, 26.4, 6.0); addArmorStand(39.6, 26.4, 6.0);
  addColumn("armory", 20, 37, 11.8, .95); addColumn("armory", 42, 37, 11.8, .95);
  addBrazier("armory", 21, 46.5, 2.3);

  // Dungeon: a straight central passage with six repeated cell bays and open rat-width gates.
  for (const gateZ of [31, 37, 43]) {
    addGate("dungeon", 59, gateZ); addGate("dungeon", 65, gateZ);
  }
  for (const dividerZ of [34, 40]) {
    addFurniture("dungeon", materials.dark, [6, 12.5, .8], [55.5, 6.25, dividerZ], { environmentProp: false, castShadow: false });
    addFurniture("dungeon", materials.dark, [6, 12.5, .8], [68.5, 6.25, dividerZ], { environmentProp: false, castShadow: false });
  }
  addFurniture("dungeon", materials.oldStone, [1.8, .42, 1.8], [57.4, .21, 37], { supportTop: true, environmentProp: false, castShadow: false });
  for (const x of [52.6, 71.4]) for (const z of [27, 47]) addColumn("dungeon", x, z, 11.8, .82);
  for (const z of [30, 44]) {
    const chain = addStaticCylinder("dungeon", chainLinkGeometry, materials.iron, [62, 8.5, z], [4, 4, 4], true);
    chain.rotation.x = Math.PI / 2;
  }
  addWallBanner("dungeon", 62, 48.45, 4.5, 6.5, materials.dark);

  // Royal chambers: an uncluttered entry/study strip, clear boss ground, and a raised canopy bed beyond it.
  addPropBox("royalChambers", materials.wood, [4.2, 2.8, 1.4], [52.5, 1.4, 4]);
  addPropBox("royalChambers", materials.wood, [.45, 3.2, 1.55], [52.5, 2.9, 4]);
  addPropBox("royalChambers", materials.wood, [4, .28, 1.55], [52.5, 3.8, 4]);
  const bed = addFurniture("royalChambers", materials.wood, [10, 3.8, 8], [62, 1.9, -3], { supportTop: true, environmentProp: false, castShadow: false });
  addFurniture("royalChambers", materials.red, [9.2, .24, 7.4], [62, 3.92, -3], { supportTop: true, environmentProp: false, castShadow: false });
  roomClimb("royalChambers", bed, [57, 0, -3], [-1, 0, 0], [0, 0, 1], 3.7, 3.8, { normalOffset: -.35, y: 3.8, minX: 57.8, maxX: 66.2, minZ: -6.4, maxZ: .4 });
  for (const x of [57.5, 66.5]) for (const z of [-6.5, .5]) addPropBox("royalChambers", materials.wood, [.35, 7.5, .35], [x, 3.75, z]);
  addPropBox("royalChambers", materials.wood, [9.5, .28, 8], [62, 7.64, -3]);
  addClimbPanelZ("royalChambers", 62, -7.08, -1, 8.5, 7.5, { normalOffset: -.35, y: 3.8, minX: 57.8, maxX: 66.2, minZ: -6.6, maxZ: -.2 });
  addColumn("royalChambers", 52.5, -3, 11.7, .82); addColumn("royalChambers", 71.5, -3, 11.7, .82);
  addWallBanner("royalChambers", 62, -11.45, 6, 7.4);

  // Throne room: west-entry ceremonial runner, centered stair and dais, paired supports, and a single dominant throne.
  addFootContactProp("throneRoom", "Throne Room Rug", materials.red, [20, .06, 5.2], [26, .04, 0]);
  addFootContactProp("throneRoom", "Throne Room Rug Border", materials.bronze, [20, .04, .11], [26, .09, -2.5]);
  addFootContactProp("throneRoom", "Throne Room Rug Border", materials.bronze, [20, .04, .11], [26, .09, 2.5]);
  addFurniture("throneRoom", materials.trim, [14, 1.25, 7], [36, .625, -5], { supportTop: true, environmentProp: false, castShadow: false });
  for (let i = 0; i < 4; i++) {
    const height = .28 * (i + 1);
    addFurniture("throneRoom", materials.oldStone, [14, height, 1.2], [36, height / 2, -1.4 - i * 1.2], { supportTop: true, environmentProp: false, castShadow: false });
  }
  for (const x of [24, 48]) for (const z of [-11, 10]) addColumn("throneRoom", x, z, 15.2, 1.15);
  addWallBanner("throneRoom", 28, -14.45, 4.2, 8.5);
  addWallBanner("throneRoom", 44, -14.45, 4.2, 8.5);
  addBrazier("throneRoom", 24, -5, 2.8); addBrazier("throneRoom", 48, -5, 2.8);
  const throne = new THREE.Group(); throne.position.set(36, 1.25, -4); G("throneRoom").add(throne);
  makeBox(throne, materials.wood, [3.8, 4.8, .8], [0, 2.4, 0], []);
  makeBox(throne, materials.wood, [4.2, .8, 2.1], [0, .4, .55], []);
  // Seat top is at world/room-local Y 2.05 (throne group itself starts at 1.25).
  C("throneRoom").push({ minX: 33.9, maxX: 38.1, minY: 1.25, maxY: 2.05, minZ: -4.5, maxZ: -2.4, supportTop: true });
  makeBox(throne, materials.wood, [.5, 5.2, .6], [-1.85, 2.6, .65], []);
  makeBox(throne, materials.wood, [.5, 5.2, .6], [1.85, 2.6, .65], []);
  for (let i = -2; i <= 2; i++) {
    const blade = new THREE.Mesh(getBoxGeometry([.22, 5.6, .14]), materials.iron);
    blade.position.set(i * .62, 5.7, -.5); blade.rotation.z = i * .08; blade.castShadow = true; throne.add(blade);
    const crossguard = new THREE.Mesh(getBoxGeometry([1.1, .22, .24]), materials.iron);
    crossguard.position.set(i * .62, 3.9, -.5); crossguard.rotation.z = i * .08; throne.add(crossguard);
  }
  const throneCrown = new THREE.Group();
  throneCrown.position.set(0, 5.5, .05); throne.add(throneCrown); throneCrown.visible = false;
  const crownGold = new THREE.MeshStandardMaterial({ color: 0xe6b83f, metalness: .72, roughness: .28, emissive: 0x5b3b05 });
  const crownBand = new THREE.Mesh(new THREE.TorusGeometry(.62, .12, 8, 16), crownGold); crownBand.rotation.x = Math.PI / 2; throneCrown.add(crownBand);
  const crownSpikeGeometry = new THREE.ConeGeometry(.12, .56, 5);
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(crownSpikeGeometry, crownGold);
    const angle = (i / 5) * Math.PI * 2; spike.position.set(Math.cos(angle) * .57, .26, Math.sin(angle) * .57); throneCrown.add(spike);
  }

  // Corridor floors and side walls connect the room doorways without long empty runs.
  const connections = [
    { from: "greatHall", to: "royalKitchen", center: [-21.5, 0], size: [1, 6], axis: "x" },
    { from: "greatHall", to: "armory", center: [22, 0], size: [2, 6], axis: "x" },
    { from: "greatHall", to: "dungeon", center: [0, 18.5], size: [7, 6], axis: "z" },
    { from: "greatHall", to: "royalChambers", center: [0, -17], size: [4, 6], axis: "z" },
    { from: "royalChambers", to: "throneRoom", center: [13, -31], size: [2, 6], axis: "x" },
  ];
  for (const connection of connections) {
    const corridorData = corridor(scene, materials.dark, connection.center, connection.size, connection.axis);
    connection.group = corridorData.group;
    connection.colliders = corridorData.colliders;
    connectorColliders.push(...connection.colliders);
    const [cx, cz] = connection.center;
    if (connection.axis === "x") {
      const halfWidth = connection.size[1] / 2 + .02;
      for (const side of [-1, 1]) addStaticBox(connection.group, materials.trim, [.38, CASTLE_SCALE.humanDoorHeight, .38], [cx, CASTLE_SCALE.humanDoorHeight / 2, cz + side * halfWidth]);
      addStaticBox(connection.group, materials.oldStone, [.6, .55, connection.size[1] + .85], [cx, CASTLE_SCALE.humanDoorHeight + .3, cz]);
    } else {
      const halfWidth = connection.size[1] / 2 + .02;
      for (const side of [-1, 1]) addStaticBox(connection.group, materials.trim, [.38, CASTLE_SCALE.humanDoorHeight, .38], [cx + side * halfWidth, CASTLE_SCALE.humanDoorHeight / 2, cz]);
      addStaticBox(connection.group, materials.oldStone, [connection.size[1] + .85, .55, .6], [cx, CASTLE_SCALE.humanDoorHeight + .3, cz]);
    }
  }

  const tunnelData = [
    ["greatHall", [-16, .7, -12.5]], ["royalKitchen", [-11, .7, 29]], ["armory", [39, .7, 45]],
    ["dungeon", [72, .7, 34]], ["royalChambers", [70, .7, -10]], ["throneRoom", [27, .7, 5]],
  ];
  const tunnels = tunnelData.map(([roomId, position]) => {
    const room = get(roomId);
    const spawnDirection = roomId === "greatHall" || roomId === "dungeon" ? -1.8 : roomId === "throneRoom" ? 2 : 1.8;
    room.tunnel = { id: `${roomId}Tunnel`, roomId, position: new THREE.Vector3(...position), spawn: new THREE.Vector3(position[0] + spawnDirection, 0, position[2]) };
    addTunnel(room.group, room, materials.trim, materials.tunnel, room.colliders);
    return room.tunnel;
  });
  const fragmentSpawns = [
    { id: 1, roomId: "greatHall", position: [0, 1.38, -1.8] },
    { id: 2, roomId: "royalKitchen", position: [8, 4.05, 37] },
    { id: 3, roomId: "armory", position: [31, .25, 46] },
    { id: 4, roomId: "dungeon", position: [57.4, .67, 37] },
    { id: 5, roomId: "royalChambers", position: [62, 4.05, -3] },
  ];
  for (const fragment of fragmentSpawns) get(fragment.roomId).fragmentPosition = new THREE.Vector3(...fragment.position);

  // Shift each finished room as a unit so its geometry, cached collision, and traversal data stay aligned.
  for (const room of rooms.values()) {
    const [dx, dz] = roomOffsets[room.id];
    room.group.position.set(dx, 0, dz);
    room.center = [room.center[0] + dx, room.center[1] + dz];
    room.bounds.minX += dx; room.bounds.maxX += dx;
    room.bounds.minZ += dz; room.bounds.maxZ += dz;
    for (const box of room.colliders) { box.minX += dx; box.maxX += dx; box.minZ += dz; box.maxZ += dz; }
    for (const surface of room.climbables) {
      surface.origin.x += dx; surface.origin.z += dz;
      if (surface.landing) { surface.landing.minX += dx; surface.landing.maxX += dx; surface.landing.minZ += dz; surface.landing.maxZ += dz; }
    }
    if (room.tunnel) { room.tunnel.position.x += dx; room.tunnel.position.z += dz; room.tunnel.spawn.x += dx; room.tunnel.spawn.z += dz; }
    if (room.fragmentPosition) { room.fragmentPosition.x += dx; room.fragmentPosition.z += dz; }
  }
  for (const fragment of fragmentSpawns) {
    const [dx, dz] = roomOffsets[fragment.roomId];
    fragment.position[0] += dx; fragment.position[2] += dz;
  }
  for (const room of rooms.values()) room.spawn.set(room.tunnel.spawn.x, 0, room.tunnel.spawn.z);
  for (const room of rooms.values()) colliders.push(...room.colliders);
  const adjacentRoomIds = new Map([...rooms.keys()].map((id) => [id, new Set([id])]));
  for (const connection of connections) {
    adjacentRoomIds.get(connection.from).add(connection.to);
    adjacentRoomIds.get(connection.to).add(connection.from);
    for (const box of connection.colliders) box.roomIds = [connection.from, connection.to];
  }
  const collisionCellSize = 8;
  const collisionGrid = new Map();
  const indexCollider = (box) => {
    const minCellX = Math.floor(box.minX / collisionCellSize), maxCellX = Math.floor(box.maxX / collisionCellSize);
    const minCellZ = Math.floor(box.minZ / collisionCellSize), maxCellZ = Math.floor(box.maxZ / collisionCellSize);
    for (let x = minCellX; x <= maxCellX; x++) for (let z = minCellZ; z <= maxCellZ; z++) {
      const key = `${x},${z}`;
      let bucket = collisionGrid.get(key);
      if (!bucket) collisionGrid.set(key, bucket = []);
      bucket.push(box);
    }
  };
  for (const room of rooms.values()) for (const box of room.colliders) { box.roomIds = [room.id]; indexCollider(box); }
  for (const box of connectorColliders) indexCollider(box);
  let collisionQueryStamp = 0;
  const collidersNear = (roomId, position, output) => {
    output.length = 0;
    const cellX = Math.floor(position.x / collisionCellSize), cellZ = Math.floor(position.z / collisionCellSize);
    const stamp = ++collisionQueryStamp;
    for (let x = cellX - 1; x <= cellX + 1; x++) for (let z = cellZ - 1; z <= cellZ + 1; z++) {
      const bucket = collisionGrid.get(`${x},${z}`);
      if (!bucket) continue;
      for (const box of bucket) {
        if (box._collisionQueryStamp === stamp) continue;
        box._collisionQueryStamp = stamp;
        let isNearbyRoom = false;
        for (const candidateRoom of box.roomIds) if (candidateRoom === roomId) { isNearbyRoom = true; break; }
        if (isNearbyRoom) output.push(box);
      }
    }
    return output;
  };
  const climbablesForRoom = (roomId) => rooms.get(roomId).climbables;

  // Batch only static siblings. Climb targets and the reparented crown keep their identity.
  const protectedObjects = new Set(climbables.surfaces.map((surface) => surface.object));
  const propSet = new Set(environmentProps);
  const batchStatic = (group) => {
    const batches = new Map();
    for (const child of [...group.children]) {
      if (child === throneCrown) continue;
      if (child.isGroup) { batchStatic(child); continue; }
      if (!child.isMesh || protectedObjects.has(child) || child.children.length || Array.isArray(child.material)) continue;
      const key = `${child.geometry.id}/${child.material.id}/${child.castShadow}/${child.receiveShadow}/${propSet.has(child)}`;
      let batch = batches.get(key);
      if (!batch) batches.set(key, batch = []);
      batch.push(child);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const first = meshes[0];
      const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
      batch.name = 'StaticEnvironmentBatch';
      batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
      meshes.forEach((mesh, index) => {
        mesh.updateMatrix(); batch.setMatrixAt(index, mesh.matrix); group.remove(mesh);
        if (propSet.has(mesh)) environmentProps.splice(environmentProps.indexOf(mesh), 1);
      });
      if (propSet.has(first)) environmentProps.push(batch);
      batch.computeBoundingBox(); batch.computeBoundingSphere(); group.add(batch);
    }
  };
  const freezeStatic = (object) => {
    if (object === throneCrown) return;
    object.updateMatrix(); object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false;
    for (const child of object.children) freezeStatic(child);
  };
  for (const group of [...rooms.values()].map((room) => room.group).concat(connections.map((connection) => connection.group))) {
    batchStatic(group); group.updateMatrixWorld(true); freezeStatic(group);
  }
  return {
    colliders, collidersNear, footContactSurfaces, adjacentRoomIds, climbablesForRoom, connectorColliders, environmentProps, climbables, rooms, tunnels, fragmentSpawns, connections, roomLights,
    spawn: new THREE.Vector3(0, 0, 9.5),
    armorySpawn: new THREE.Vector3(24.8, 0, 0), armoryBossSpawn: new THREE.Vector3(35, 0, -5), armoryArenaBounds: { minX: 25, maxX: 45, minZ: -10, maxZ: 10 },
    royalChambersBossSpawn: new THREE.Vector3(0, 0, -27.5), royalChambersBossSafeSpawn: new THREE.Vector3(0, 0, -17.5), royalChambersArenaBounds: { minX: -9, maxX: 9, minZ: -30, maxZ: -20 },
    thronePosition: new THREE.Vector3(30, 0, -32.7), throneRoomDebugSpawn: new THREE.Vector3(30, 0, -29), dragonStart: new THREE.Vector3(36.5, 0, -29.4), throneCrown,
  };

  function roomClimb(roomId, object, origin, normal, horizontal, halfWidth, topY, landing = null) {
    const surface = climbables.register(object, { origin, normal, horizontal, halfWidth, topY, ...(landing ? { landing } : {}) });
    get(roomId).climbables.push(surface);
  }
}

function corridor(scene, material, center, size, axis) {
  const [x, z] = center; const [length, width] = size;
  const group = new DormantGroup(); group.name = "CastleConnector"; scene.add(group);
  const connectionColliders = [];
  makeFloor(group, material, x, z, axis === "z" ? width : length, axis === "z" ? length : width);
  if (axis === "z") {
    for (const side of [-1, 1]) makeBox(group, material, [.55, CASTLE_SCALE.standardWallHeight, length], [x + side * (width / 2 + .28), CASTLE_SCALE.standardWallHeight / 2, z], connectionColliders);
  } else {
    for (const side of [-1, 1]) makeBox(group, material, [length, CASTLE_SCALE.standardWallHeight, .55], [x, CASTLE_SCALE.standardWallHeight / 2, z + side * (width / 2 + .28)], connectionColliders);
  }
  if (axis === "z") addStaticBox(group, material, [width + .55, .55, .55], [x, CASTLE_SCALE.standardWallHeight - .35, z]);
  else addStaticBox(group, material, [.55, .55, width + .55], [x, CASTLE_SCALE.standardWallHeight - .35, z]);
  return { group, colliders: connectionColliders };
}
