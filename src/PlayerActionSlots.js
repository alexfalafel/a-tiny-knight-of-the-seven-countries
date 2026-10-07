// Central action bindings. FinaleSequence owns Digit1 and Digit2 while a
// throne choice is active; it runs outside player updates.
export const PLAYER_ACTION_SLOTS = Object.freeze({
  Digit1: Object.freeze({ type: "AURA", action: "TOGGLE_AURA" }),
  Digit2: Object.freeze({ type: "EMOTE", name: "Kneeling Bow", clip: "01a10fb3-8e13-75e8-afb0-d94a6529ed62", behavior: "ONE_SHOT", loopMode: "ONCE", footIK: false, hideSword: false }),
  Digit3: Object.freeze({ type: "EMOTE", name: "Kneel", clip: "01a10fb4-abe5-7736-9785-3578dbd64869", behavior: "HOLD_POSE", loopMode: "ONCE", footIK: false, hideSword: true }),
  Digit4: null,
  Digit5: null,
  Digit6: null,
  Digit7: null,
  Digit8: null,
  Digit9: null,
});

export function consumePlayerActionSlot(input) {
  let selected = null;
  for (const [key, action] of Object.entries(PLAYER_ACTION_SLOTS)) {
    if (input.consume(key) && action && !selected) selected = { ...action, key };
  }
  return selected;
}
