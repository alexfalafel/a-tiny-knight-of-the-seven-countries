// Weapon coordinate contract:
// - WeaponSocket is the character's palm reference frame and stays fixed.
// - WeaponMount origin is the center of the grip.
// - In the procedural sword mesh, +Y runs from pommel toward blade tip.
//   The existing mount plus model correction orient that axis in the palm.
// Imported assets retain their authored axes and pivot under ImportedSwordRoot;
// use externalSwordTransform to correct that model without moving the character.
export const PLAYER_WEAPON_CONFIG = Object.freeze({
  externalModelPath: "/assets/models/weapons/rat-knight-sword.glb",
  targetLength: 0.52,
  autoScale: true,
  manualScaleOverride: null,
  socket: Object.freeze({
    // Rendered palm measurement: 274 hand-weighted vertices between cuff and
    // separated digits. Reproduce with scripts/measure-weapon-palm.mjs.
    position: Object.freeze([-0.010524349544901668,0.14062618089190557,-0.014258887849805996]),
    // Character-side reference orientation; per-weapon adjustments belong to
    // the fallback or external correction transform below.
    rotation: Object.freeze([7.162024018455033e-7,0.19270480095141193,4.6169900727656435e-8]),
    scale: Object.freeze([1, 1, 1]),
  }),
  // Keep the mount's grip pivot at the palm socket origin; per-sword model
  // correction stays in fallback.modelTransform / externalSwordTransform.
  mount: Object.freeze({
    position: Object.freeze([0, 0, 0]),
    rotation: Object.freeze([0, 0, -Math.PI / 2]),
    scale: Object.freeze([1, 1, 1]),
  }),
  backSheath: Object.freeze({
    preferredBone: "mixamorigSpine2",
    fallbackBone: "mixamorigSpine1",
    socketPosition: Object.freeze([0, 0, 0]),
    socketRotation: Object.freeze([0, 0, 0]),
    correctionPosition: Object.freeze([-0.0014, 0.0800, -0.2000]),
    correctionRotation: Object.freeze([0.633757, 0.285426, 0.001507]),
    correctionScale: 1,
  }),
  fallback: Object.freeze({
    socketPosition: Object.freeze([0.035, -0.25, -0.055]),
    socketRotation: Object.freeze([-0.18, 0, -0.12]),
    // Neutral Idle: quaternion-aligned so grip-to-tip follows character forward,
    // pivoting around the unchanged handle center. Fixed local rotation; animations carry it naturally.
    modelTransform: Object.freeze({
      position: Object.freeze([0, 0, 0]),
      rotation: Object.freeze([-0.7879970093975879,0.07886802245747797,-2.932407630153058]),
      scale: 0.78,
    }),
  }),
  // Authored SwordGripPoint/GripReference wins; otherwise set the GLB-local
  // visible handle center here. Correction.position is the desired grip offset.
  externalSwordGripPoint: Object.freeze([0, 0, 0]),
  // Model-specific correction for a future Meshy export.
  externalSwordTransform: Object.freeze({
    position: Object.freeze([0, 0, 0]),
    rotation: Object.freeze([0, 0, 0]),
    scale: 1,
  }),
});
