/** Keyboard state scoped to one combat session. */
export class CombatInput {
  constructor(target = window) {
    this.target = target;
    this.pressed = new Set();
    this.justPressed = new Set();
    this.onKeyDown = event => {
      if (!this.pressed.has(event.code)) this.justPressed.add(event.code);
      this.pressed.add(event.code);
    };
    this.onKeyUp = event => this.pressed.delete(event.code);
    this.onBlur = () => this.clear();
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  consumeJustPressed() {
    const keys = this.justPressed;
    this.justPressed = new Set();
    return keys;
  }

  clear() {
    this.pressed.clear();
    this.justPressed.clear();
  }

  dispose() {
    this.clear();
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
