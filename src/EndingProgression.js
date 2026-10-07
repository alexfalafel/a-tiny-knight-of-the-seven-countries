export const ENDING_STATES = Object.freeze({
  NONE: "NONE",
  GOOD: "GOOD",
  SECRET_PATH: "SECRET_PATH",
  SECRET_COMPLETE: "SECRET_COMPLETE",
});

export class EndingProgression {
  constructor() { this.reset(); }

  reset() {
    this.endingState = ENDING_STATES.NONE;
    this.throneChoiceMade = false;
    this.crownGivenToQueen = false;
    this.crownClaimedByPlayer = false;
    this.dragonEncounterUnlocked = false;
    this.branchState = "NONE";
    this.finaleStarted = false;
    this.dragonDefeated = false;
  }

  beginFinale(crownComplete) {
    if (!crownComplete || this.endingState !== ENDING_STATES.NONE || this.finaleStarted) return false;
    this.finaleStarted = true;
    return true;
  }

  chooseGive() {
    if (!this.finaleStarted || this.throneChoiceMade) return false;
    this.throneChoiceMade = true;
    this.crownGivenToQueen = true;
    this.endingState = ENDING_STATES.GOOD;
    return true;
  }

  chooseClaim() {
    if (!this.finaleStarted || this.throneChoiceMade) return false;
    this.throneChoiceMade = true;
    this.crownClaimedByPlayer = true;
    this.dragonEncounterUnlocked = true;
    this.endingState = ENDING_STATES.SECRET_PATH;
    this.branchState = "DRAGON_REVEAL";
    return true;
  }

  markDragonPending() { if (this.crownClaimedByPlayer) this.branchState = "DRAGON_ENCOUNTER_PENDING"; }

  completeSecret() {
    if (!this.crownClaimedByPlayer || !this.dragonDefeated) return false;
    this.endingState = ENDING_STATES.SECRET_COMPLETE;
    this.branchState = "TINY_KING_ENDING";
    return true;
  }

  prepareDragonDebug() {
    this.endingState = ENDING_STATES.SECRET_PATH;
    this.throneChoiceMade = true;
    this.crownGivenToQueen = false;
    this.crownClaimedByPlayer = true;
    this.dragonEncounterUnlocked = true;
    this.dragonDefeated = false;
    this.branchState = "DRAGON_BOSS";
    this.finaleStarted = true;
  }
}
