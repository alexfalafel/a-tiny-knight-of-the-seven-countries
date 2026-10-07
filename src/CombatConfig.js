// Player survivability and boss attack tuning live here. Distances are metres,
// durations seconds, turn speeds radians/second. Player sword damage is unchanged.
export const PLAYER_COMBAT = Object.freeze({
  maxHP: 100, damageIframes: .65, normalDamage: 10, dragonDamage: 30,
  healAmount: 40, maxHealCharges: 3, healCommit: .7, healDuration: 1,
  dodgeDuration: .24, dodgeCooldown: .72, dodgeSpeed: 11,
});
export const BEETLE_COMBAT = Object.freeze({
  health: 10, turnSpeed: 2.2, trackingCutoff: .18, decisionDelay: .65,
  SWIPE: { windup: .75, active: .24, recovery: 1, damage: 16, reach: 2.35, halfWidth: 1.3 },
  CHARGE: { windup: 1.1, recovery: 1.5, missRecovery: 1.75, damage: 24, speed: 8, maxDistance: 10, radius: 1.5 },
  SLAM: { windup: 1.25, active: .22, recovery: 1.45, damage: 28, reach: 2.35 },
});
export const RAT_COMBAT = Object.freeze({
  health: 18, turnSpeed: 2.6, trackingCutoff: .18, decisionDelay: .55,
  QUICK: { windup: .5, active: .24, recovery: .85, damage: 16, reach: 2.9, halfWidth: 1.15 },
  COMBO_1: { windup: .7, active: .26, recovery: .25, damage: 16, reach: 2.9, halfWidth: 1.25 },
  COMBO_2: { windup: .5, active: .28, recovery: 1.25, damage: 18, reach: 2.9, halfWidth: 1.25 },
  HEAVY: { windup: 1.25, active: .3, recovery: 1.5, damage: 28, reach: 3.25, halfWidth: 1.3 },
  LUNGE: { windup: .95, recovery: 1.35, damage: 24, speed: 7.5, maxDistance: 6.5, radius: 1.1 },
});

// Presentation-only tuning for confirmed damaging sword hits. Indexes are
// Attack 1/2/3. These values do not feed damage, reach, or combat timers.
export const COMBAT_IMPACT = Object.freeze({
  hitStopSeconds: Object.freeze([.045, .050, .065]),
  camera: Object.freeze({
    duration: .12,
    decay: "linear",
    strengths: Object.freeze([.014, .019, .024]),
    maxStrength: .028,
  }),
  reactions: Object.freeze({
    CHITIN: Object.freeze({ duration: .16, strength: .035 }),
    ARMORED_RAT: Object.freeze({ duration: .19, strength: .045 }),
    FLESH: Object.freeze({ duration: .17, strength: .04 }),
    GENERIC: Object.freeze({ duration: .17, strength: .04 }),
  }),
  particles: Object.freeze({
    poolSize: 48,
    maxPerHit: 6,
    attack3Bonus: 1,
    profiles: Object.freeze({
      CHITIN: Object.freeze({ name: "SPARK_CHITIN", count: 5, lifetime: .24, speed: 2.4, gravity: 5.2, colors: Object.freeze([0xffe08a, 0xffa840]) }),
      ARMORED_RAT: Object.freeze({ name: "ARMOR_SPARK_LIGHT_BLOOD", count: 4, lifetime: .3, speed: 1.75, gravity: 4.6, colors: Object.freeze([0xffd47a, 0xffa84b, 0x771b22]) }),
      FLESH: Object.freeze({ name: "LIGHT_BLOOD", count: 4, lifetime: .22, speed: 1.65, gravity: 5.5, colors: Object.freeze([0x8f2027, 0x59141a]) }),
      GENERIC: Object.freeze({ name: "GENERIC_SWORD_BURST", count: 4, lifetime: .2, speed: 1.8, gravity: 5, colors: Object.freeze([0xe5c58a, 0x9e854e]) }),
    }),
  }),
  sfxHooks: Object.freeze({
    CHITIN: "SFX_SWORD_HIT_CHITIN",
    ARMORED_RAT: "SFX_SWORD_HIT_ARMOR",
    FLESH: "SFX_SWORD_HIT_FLESH",
    GENERIC: "SFX_SWORD_HIT_HEAVY",
  }),
});
