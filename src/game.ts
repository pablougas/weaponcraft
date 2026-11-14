import Phaser from 'phaser';

const WIDTH = 800;
const HEIGHT = 520;
const ORE_LOCATIONS = [
  { x: 150, y: 120 },
  { x: 660, y: 130 },
  { x: 250, y: 390 },
  { x: 590, y: 360 },
  { x: 405, y: 90 },
];

class ForgeScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private ore: Phaser.GameObjects.Arc[] = [];
  private collected = 0;
  private onScore: (collected: number, total: number) => void;
  private pointerTarget?: Phaser.Math.Vector2;

  constructor(onScore: (collected: number, total: number) => void) {
    super('ForgeScene');
    this.onScore = onScore;
  }

  create(): void {
    this.collected = 0;
    this.pointerTarget = undefined;
    this.onScore(0, ORE_LOCATIONS.length);
    this.drawArena();
    this.player = this.add.circle(WIDTH / 2, HEIGHT / 2, 18, 0x7dd3fc)
      .setStrokeStyle(3, 0xe0f2fe);
    this.ore = ORE_LOCATIONS.map(({ x, y }) =>
      this.add.circle(x, y, 11, 0xfbbf24).setStrokeStyle(4, 0xfef3c7),
    );

    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }
    this.cursors = this.input.keyboard.createCursorKeys();
    this.movementKeys = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerTarget = new Phaser.Math.Vector2(pointer.x, pointer.y);
    });
  }

  update(_time: number, delta: number): void {
    const keyboard = this.cursors;
    const keys = this.movementKeys;
    const direction = new Phaser.Math.Vector2(
      Number(keyboard.right.isDown || keys.right.isDown)
        - Number(keyboard.left.isDown || keys.left.isDown),
      Number(keyboard.down.isDown || keys.down.isDown)
        - Number(keyboard.up.isDown || keys.up.isDown),
    );

    if (this.pointerTarget) {
      direction.set(
        this.pointerTarget.x - this.player.x,
        this.pointerTarget.y - this.player.y,
      );
      if (direction.lengthSq() <= 100) {
        this.pointerTarget = undefined;
        direction.set(0, 0);
      }
    }

    if (direction.lengthSq() > 0) {
      direction.normalize();
      const step = 220 * (delta / 1000);
      this.player.x = Phaser.Math.Clamp(this.player.x + direction.x * step, 30, WIDTH - 30);
      this.player.y = Phaser.Math.Clamp(this.player.y + direction.y * step, 30, HEIGHT - 30);
    }

    this.ore = this.ore.filter((ore) => {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, ore.x, ore.y) > 31) {
        return true;
      }
      ore.destroy();
      this.collected += 1;
      this.onScore(this.collected, ORE_LOCATIONS.length);
      return false;
    });
  }

  private drawArena(): void {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x182338);
    const grid = this.add.graphics().lineStyle(1, 0x293950, 0.65);
    for (let x = 20; x < WIDTH; x += 40) {
      grid.lineBetween(x, 0, x, HEIGHT);
    }
    for (let y = 20; y < HEIGHT; y += 40) {
      grid.lineBetween(0, y, WIDTH, y);
    }
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH - 24, HEIGHT - 24)
      .setStrokeStyle(2, 0x52647c);
  }
}

export function startGame(
  parent: HTMLElement,
  onScore: (collected: number, total: number) => void,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#182338',
    scene: [new ForgeScene(onScore)],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WIDTH,
      height: HEIGHT,
    },
    input: { activePointers: 1 },
  });
}
