/** Keyboard state scoped to one combat session. */
const GAME_ACTION_CODES = new Set(['Space', 'KeyM', 'KeyR', 'KeyT', 'KeyY', 'KeyF', 'KeyC', 'Digit1', 'Digit2', 'Digit3', 'Digit4']);
const MOUSE_ACTION_CODES = new Map([[0, 'MousePrimary'], [2, 'MouseSecondary']]);

export class CombatInput {
  constructor(target = window, pointerTarget = null) {
    this.target = target;
    this.pointerTarget = pointerTarget;
    this.pressed = new Set();
    this.justPressed = new Set();
    this._availableJustPressed = new Set();
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
    this.onPointerDown = event => {
      if (event.pointerType !== 'mouse') return;
      const code = MOUSE_ACTION_CODES.get(event.button);
      if (!code) return;
      event.preventDefault();
      if (!this.pressed.has(code)) this.justPressed.add(code);
      this.pressed.add(code);
    };
    this.onPointerUp = event => {
      if (event.pointerType !== 'mouse') return;
      const code = MOUSE_ACTION_CODES.get(event.button);
      if (code) this.pressed.delete(code);
    };
    this.onPointerCancel = () => {
      this.pressed.delete('MousePrimary');
      this.pressed.delete('MouseSecondary');
      this.justPressed.delete('MousePrimary');
      this.justPressed.delete('MouseSecondary');
    };
    this.onBlur = () => this.clear();
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    pointerTarget?.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointerup', this.onPointerUp);
    pointerTarget?.addEventListener('pointercancel', this.onPointerCancel);
  }

  consumeJustPressed() {
    const keys = this.justPressed;
    this.justPressed = this._availableJustPressed;
    this.justPressed.clear();
    this._availableJustPressed = keys;
    return keys;
  }

  clear() {
    this.pressed.clear();
    this.justPressed.clear();
    this._availableJustPressed.clear();
  }

  dispose() {
    this.clear();
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.pointerTarget?.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.pointerTarget?.removeEventListener('pointercancel', this.onPointerCancel);
  }
}
