const canvas = document.querySelector('#worm-game');
const context = canvas?.getContext('2d');
const scoreElement = document.querySelector('#game-score');
const highScoreElement = document.querySelector('#high-score');
const statusElement = document.querySelector('#game-status');
const startButton = document.querySelector('#start-game');
const pauseButton = document.querySelector('#pause-game');
const restartButton = document.querySelector('#restart-game');
const touchButtons = document.querySelectorAll('[data-direction]');

const columns = 24;
const rows = 16;
const cellSize = canvas ? canvas.width / columns : 20;
const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

let worm = [];
let food = null;
let direction = directions.right;
let queuedDirection = direction;
let score = 0;
let highScore = Number.parseInt(localStorage.getItem('worm-high-score') || '0', 10);
let timerId = null;
let gameState = 'idle';
let enemies = [];
let gems = [];
let tickCount = 0;

const STEP_MS = 140;
const ENEMY_COUNT = 3;
const ENEMY_LIFETIME = 5000;
const EXPLOSION_DURATION = 2000;
const GEM_COUNT = 3;
const GEM_LIFETIME = 10000;

function updateStatus(message) {
  if (statusElement) statusElement.textContent = message;
}

function updateScore() {
  if (scoreElement) scoreElement.textContent = String(score);
  if (highScoreElement) highScoreElement.textContent = String(highScore);
}

function resetGame() {
  worm = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
  direction = directions.right;
  queuedDirection = direction;
  score = 0;
  food = createFood();
  resetHazards();
  tickCount = 0;
  gameState = 'idle';
  updateScore();
  updateStatus('Ready');
  if (pauseButton) pauseButton.disabled = true;
  draw();
}

function createFood() {
  return randomOpenCell() || { x: 1, y: 1 };
}

function randomOpenCell(extraBlocked = []) {
  const openCells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const blockedByWorm = worm.some((segment) => segment.x === x && segment.y === y);
      const blockedByOther = extraBlocked.some((cell) => cell.x === x && cell.y === y);
      if (!blockedByWorm && !blockedByOther) openCells.push({ x, y });
    }
  }
  return openCells[Math.floor(Math.random() * openCells.length)];
}

function resetHazards() {
  const blocked = [food];
  enemies = Array.from({ length: ENEMY_COUNT }, () => {
    const cell = randomOpenCell(blocked) || { x: 2, y: 2 };
    blocked.push(cell);
    return { ...cell, age: 0, exploding: false, explosionAge: 0, direction: directions.left };
  });
  gems = [];
  for (let index = 0; index < GEM_COUNT; index += 1) {
    const cell = randomOpenCell([...blocked, ...gems]) || { x: 3 + index, y: 3 };
    const gem = { ...cell, age: 0 };
    gems.push(gem);
  }
}

function updateEnemies() {
  enemies.forEach((enemy) => {
    if (enemy.exploding) {
      enemy.explosionAge += STEP_MS;
      if (enemy.explosionAge >= EXPLOSION_DURATION) {
        const cell = randomOpenCell([food, ...gems, ...enemies]);
        Object.assign(enemy, cell || { x: 2, y: 2 }, { age: 0, exploding: false, explosionAge: 0 });
      }
      return;
    }
    enemy.age += STEP_MS;
    if (enemy.age >= ENEMY_LIFETIME) {
      enemy.exploding = true;
      enemy.explosionAge = 0;
      return;
    }
    if (Math.random() < 0.35) {
      const options = Object.values(directions).filter((candidate) => !isOpposite(candidate, enemy.direction));
      enemy.direction = options[Math.floor(Math.random() * options.length)];
    }
    const next = { x: enemy.x + enemy.direction.x, y: enemy.y + enemy.direction.y };
    if (next.x >= 0 && next.x < columns && next.y >= 0 && next.y < rows) Object.assign(enemy, next);
  });
}

function updateGems() {
  gems = gems.filter((gem) => {
    gem.age += STEP_MS;
    return gem.age < GEM_LIFETIME;
  });
}

function isOpposite(next, current) {
  return next.x + current.x === 0 && next.y + current.y === 0;
}

function setDirection(nextDirection) {
  const next = directions[nextDirection];
  if (next && !isOpposite(next, direction)) queuedDirection = next;
}

function startGame() {
  if (timerId !== null) return;
  if (gameState === 'idle' || gameState === 'over') resetGame();
  gameState = 'running';
  updateStatus('Running');
  if (pauseButton) pauseButton.disabled = false;
  timerId = window.setInterval(tick, STEP_MS);
}

function pauseGame() {
  if (gameState !== 'running') return;
  window.clearInterval(timerId);
  timerId = null;
  gameState = 'paused';
  updateStatus('Paused');
}

function restartGame() {
  window.clearInterval(timerId);
  timerId = null;
  resetGame();
  startGame();
}

function endGame() {
  window.clearInterval(timerId);
  timerId = null;
  gameState = 'over';
  updateStatus('Game over · press Restart to try again');
  if (pauseButton) pauseButton.disabled = true;
  draw(true);
}

function tick() {
  tickCount += 1;
  updateEnemies();
  updateGems();
  direction = queuedDirection;
  const head = { x: worm[0].x + direction.x, y: worm[0].y + direction.y };
  const hitWall = head.x < 0 || head.x >= columns || head.y < 0 || head.y >= rows;
  const hitSelf = worm.some((segment) => segment.x === head.x && segment.y === head.y);
  const hitEnemy = enemies.some((enemy) => !enemy.exploding && [head, ...worm].some((segment) => enemy.x === segment.x && enemy.y === segment.y));
  if (hitWall || hitSelf || hitEnemy) {
    endGame();
    return;
  }
  worm.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score += 1;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('worm-high-score', String(highScore));
    }
    food = createFood();
    updateScore();
  } else {
    worm.pop();
  }
  const gemIndex = gems.findIndex((gem) => gem.x === head.x && gem.y === head.y);
  if (gemIndex >= 0) {
    gems.splice(gemIndex, 1);
    if (worm.length > 1) worm.pop();
  }
  draw();
}

function draw(gameOver = false) {
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fffdf9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(139, 93, 183, .08)';
  for (let x = 0; x <= columns; x += 1) {
    context.beginPath(); context.moveTo(x * cellSize, 0); context.lineTo(x * cellSize, canvas.height); context.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    context.beginPath(); context.moveTo(0, y * cellSize); context.lineTo(canvas.width, y * cellSize); context.stroke();
  }
  context.fillStyle = '#ff9fca';
  context.beginPath(); context.arc((food.x + .5) * cellSize, (food.y + .5) * cellSize, cellSize * .3, 0, Math.PI * 2); context.fill();
  gems.forEach((gem) => {
    context.fillStyle = tickCount % 2 === 0 ? '#ffe27a' : '#fff3b8';
    context.beginPath(); context.arc((gem.x + .5) * cellSize, (gem.y + .5) * cellSize, cellSize * .24, 0, Math.PI * 2); context.fill();
  });
  enemies.forEach((enemy) => {
    context.fillStyle = enemy.exploding ? 'rgba(255, 126, 113, .45)' : '#ff7e71';
    context.beginPath();
    context.arc((enemy.x + .5) * cellSize, (enemy.y + .5) * cellSize, enemy.exploding ? cellSize * .48 : cellSize * .32, 0, Math.PI * 2);
    context.fill();
  });
  worm.forEach((segment, index) => {
    context.fillStyle = index === 0 ? '#7456a5' : '#a98bd0';
    context.beginPath(); context.roundRect(segment.x * cellSize + 2, segment.y * cellSize + 2, cellSize - 4, cellSize - 4, 5); context.fill();
  });
  if (gameOver) {
    context.fillStyle = 'rgba(51, 44, 73, .16)';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
}

document.addEventListener('keydown', (event) => {
  const keys = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
  if (keys[event.key]) { event.preventDefault(); setDirection(keys[event.key]); }
  if (event.code === 'Space') { event.preventDefault(); gameState === 'running' ? pauseGame() : startGame(); }
});

touchButtons.forEach((button) => button.addEventListener('pointerdown', () => setDirection(button.dataset.direction)));
startButton?.addEventListener('click', startGame);
pauseButton?.addEventListener('click', () => (gameState === 'paused' ? startGame() : pauseGame()));
restartButton?.addEventListener('click', restartGame);

resetGame();
