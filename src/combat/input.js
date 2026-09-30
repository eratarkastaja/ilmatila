/** Keyboard state scoped to one combat session. */
const GAME_ACTION_CODES = new Set(['Space', 'KeyM', 'KeyR', 'KeyT', 'KeyC', 'Digit1', 'Digit2', 'Digit3']);

export class CombatInput {
  constructor(target = window) {
    this.target = target;
    this.pressed = new Set();
    this.justPressed = new Set();
    this.onKeyDown = event => {
      if (!GAME_ACTION_CODES.has(event.code)) return;
      if (event.ctrlKey || event.altKey || event.metaKey) {
        event.preventDefault();
        return;
      }
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
