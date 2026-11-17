// Keyboard and mouse state, in the game's logical 1280x720 coordinates.
// The game reads `down` every step and `pressed` edges once per frame; the canvas
// converts client pixels to logical coordinates so aiming works at any window size.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 640;
    this.mouseY = 360;
    this.mouseDown = false;
    this.mousePressed = false;
    this.anyKey = false;
  }

  attach() {
    window.addEventListener('keydown', (event) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      if (!event.repeat) {
        this.keys.add(event.code);
        this.pressed.add(event.code);
        this.anyKey = true;
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    this.canvas.addEventListener('mousemove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = 1280 / rect.width;
      const scaleY = 720 / rect.height;
      this.mouseX = (event.clientX - rect.left) * scaleX;
      this.mouseY = (event.clientY - rect.top) * scaleY;
    });
    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
        this.anyKey = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  down(code) {
    return this.keys.has(code);
  }

  /** True once for the frame the key went down; cleared by endFrame(). */
  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasMousePressed() {
    return this.mousePressed;
  }

  moveX() {
    let x = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return x;
  }

  moveY() {
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    return y;
  }

  firing() {
    return this.mouseDown || this.down('Space');
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
    this.anyKey = false;
  }
}
