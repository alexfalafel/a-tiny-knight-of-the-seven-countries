export class InputManager {
  constructor(element, onPointerLockChange) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set();
    this.lastPressedDirection = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseMovement = { x: 0, y: 0 };
    this.attackPressed = false;
    this.attackHeld = false;
    this.lockPressed = false;
    this.onPointerLockChange = onPointerLockChange;
    this.onKeyDown = (event) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const typingOrButtonTarget = event.target instanceof Element
        && event.target.closest("button, a, input, textarea, select, [contenteditable='true']");
      const gameHandledKey = ["Space", "Tab", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "KeyO", "KeyL", "KeyV", "KeyB", "KeyP", "KeyN", "KeyM", "KeyU", "KeyG", "KeyK"].includes(event.code);
      if (!typingOrButtonTarget && gameHandledKey) event.preventDefault();
      if (!this.keys.has(event.code)) {
        this.pressed.add(event.code);
        if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) this.lastPressedDirection = event.code;
      }
      this.keys.add(event.code);
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onMouseDown = (event) => {
      if (event.button === 0 && (document.pointerLockElement === this.element || event.target === this.element)) {
        event.preventDefault();
        this.attackPressed = true;
        this.attackHeld = true;
      }
      if (event.button === 1 && (document.pointerLockElement === this.element || event.target === this.element)) {
        event.preventDefault(); this.lockPressed = true;
      }
    };
    this.onMouseMove = (event) => {
      if (document.pointerLockElement === this.element) {
        this.mouseX += event.movementX;
        this.mouseY += event.movementY;
      }
    };
    this.onMouseUp = (event) => { if (event.button === 0) this.attackHeld = false; };
    this.onLockChange = () => {
      const locked = document.pointerLockElement === this.element;
      if (!locked) this.clear();
      this.onPointerLockChange(locked);
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.onBlur = () => this.clear();
    window.addEventListener("blur", this.onBlur);
    this.onVisibilityChange = () => { if (document.hidden) this.clear(); };
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  consume(code) { const value = this.pressed.has(code); this.pressed.delete(code); return value; }
  consumeAttack() { const value = this.attackPressed; this.attackPressed = false; return value; }
  clearAttack() { this.attackPressed = false; this.attackHeld = false; }
  consumeLockOn() { const value = this.lockPressed; this.lockPressed = false; return value; }
  consumeMouse() { this.mouseMovement.x = this.mouseX; this.mouseMovement.y = this.mouseY; this.mouseX = 0; this.mouseY = 0; return this.mouseMovement; }
  clearActions() { this.pressed.clear(); this.clearAttack(); this.lockPressed = false; this.mouseX = 0; this.mouseY = 0; }
  clear() { this.keys.clear(); this.pressed.clear(); this.lastPressedDirection = null; this.clearAttack(); this.lockPressed = false; this.mouseX = 0; this.mouseY = 0; }
  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }
}
