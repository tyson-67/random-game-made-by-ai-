const STORAGE_KEY = "mini-motorsport-save-v1";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  money: document.getElementById("money"),
  lapTime: document.getElementById("lapTime"),
  bestLap: document.getElementById("bestLap"),
  laps: document.getElementById("laps"),
  lastReward: document.getElementById("lastReward"),
  cleanBonus: document.getElementById("cleanBonus"),
  message: document.getElementById("message"),
};

const track = {
  outer: { x: 70, y: 50, w: 780, h: 520 },
  inner: { x: 250, y: 180, w: 420, h: 260 },
};

const checkpoints = [
  { x: 460, y: 510, w: 220, h: 20 }, // south
  { x: 760, y: 260, w: 20, h: 160 }, // east
  { x: 340, y: 90, w: 220, h: 20 }, // north
  { x: 140, y: 260, w: 20, h: 160 }, // west
];

const finishGate = { x: 450, y: 510, w: 20, h: 60 };

const gameState = loadState();
const keys = { up: false, down: false, left: false, right: false };

const car = {
  x: 460,
  y: 535,
  angle: -Math.PI / 2,
  speed: 0,
  width: 20,
  height: 36,
};

let lastTime = performance.now();
let lapStartTime = performance.now();
let currentLapMs = 0;
let lastLapMs = null;
let checkpointIndex = 0;
let touchedWallThisLap = false;

const baseStats = {
  maxSpeed: 260,
  accel: 210,
  friction: 130,
  turnRate: 3.2,
  grip: 0.12,
  brakeStrength: 260,
};

const upgradeDefs = {
  engine: { baseCost: 150, factor: 1.45, maxLevel: 8 },
  tires: { baseCost: 120, factor: 1.4, maxLevel: 8 },
  brakes: { baseCost: 130, factor: 1.35, maxLevel: 8 },
};

bindInputs();
bindShopButtons();
refreshHUD();
requestAnimationFrame(loop);

function bindInputs() {
  const setKey = (event, value) => {
    if (["ArrowUp", "w", "W"].includes(event.key)) keys.up = value;
    if (["ArrowDown", "s", "S"].includes(event.key)) keys.down = value;
    if (["ArrowLeft", "a", "A"].includes(event.key)) keys.left = value;
    if (["ArrowRight", "d", "D"].includes(event.key)) keys.right = value;
  };

  addEventListener("keydown", (event) => setKey(event, true));
  addEventListener("keyup", (event) => setKey(event, false));
}

function bindShopButtons() {
  document.querySelectorAll(".upgrade").forEach((card) => {
    const key = card.dataset.upgrade;
    card.querySelector(".buy").addEventListener("click", () => buyUpgrade(key));
  });
  updateShopUI();
}

function buyUpgrade(type) {
  const def = upgradeDefs[type];
  const level = gameState.upgrades[type];
  if (level >= def.maxLevel) {
    setMessage(`${capitalize(type)} is already max level.`);
    return;
  }
  const cost = getUpgradeCost(type, level);
  if (gameState.money < cost) {
    setMessage(`Need ${cost - gameState.money} more credits for ${type}.`);
    return;
  }

  gameState.money -= cost;
  gameState.upgrades[type] += 1;
  setMessage(`${capitalize(type)} upgraded to level ${gameState.upgrades[type]}!`);
  saveState();
  refreshHUD();
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  updateCar(dt);
  updateLapState(timestamp);
  draw();

  requestAnimationFrame(loop);
}

function updateCar(dt) {
  const stats = getStats();
  const speedRatio = Math.min(Math.abs(car.speed) / stats.maxSpeed, 1);

  if (keys.left) car.angle -= stats.turnRate * (0.2 + speedRatio) * dt;
  if (keys.right) car.angle += stats.turnRate * (0.2 + speedRatio) * dt;

  const forward = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  if (forward > 0) {
    car.speed += stats.accel * dt;
  } else if (forward < 0) {
    car.speed -= stats.brakeStrength * dt;
  } else {
    car.speed = approach(car.speed, 0, stats.friction * dt);
  }

  car.speed = clamp(car.speed, -stats.maxSpeed * 0.5, stats.maxSpeed);

  const targetVx = Math.cos(car.angle) * car.speed;
  const targetVy = Math.sin(car.angle) * car.speed;
  const vx = approach(0, targetVx, Math.abs(targetVx) * stats.grip);
  const vy = approach(0, targetVy, Math.abs(targetVy) * stats.grip);

  car.x += vx * dt;
  car.y += vy * dt;

  if (!isOnTrack(car.x, car.y)) {
    touchedWallThisLap = true;
    car.speed *= 0.84;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    car.x = approach(car.x, centerX, 55 * dt);
    car.y = approach(car.y, centerY, 55 * dt);
  }
}

function updateLapState(timestamp) {
  currentLapMs = timestamp - lapStartTime;
  ui.lapTime.textContent = formatTime(currentLapMs);

  const cp = checkpoints[checkpointIndex];
  if (rectContainsPoint(cp, car.x, car.y)) {
    checkpointIndex = (checkpointIndex + 1) % checkpoints.length;
  }

  const crossedFinish = rectContainsPoint(finishGate, car.x, car.y);
  const allCheckpointsDone = checkpointIndex === 0;
  if (crossedFinish && allCheckpointsDone && currentLapMs > 4500) {
    completeLap();
  }
}

function completeLap() {
  lastLapMs = currentLapMs;
  lapStartTime = performance.now();
  currentLapMs = 0;
  gameState.laps += 1;

  const reward = calculateReward(lastLapMs, !touchedWallThisLap);
  gameState.money += reward;
  gameState.lastReward = reward;
  gameState.cleanLap = !touchedWallThisLap;

  if (!gameState.bestLapMs || lastLapMs < gameState.bestLapMs) {
    gameState.bestLapMs = lastLapMs;
    setMessage(`New best lap! +${reward} credits`);
  } else {
    setMessage(`Lap complete. +${reward} credits`);
  }

  checkpointIndex = 0;
  touchedWallThisLap = false;
  saveState();
  refreshHUD();
}

function calculateReward(lapMs, cleanLap) {
  const secs = lapMs / 1000;
  const paceScore = Math.max(70, Math.round(450 - secs * 12));
  const cleanBonus = cleanLap ? 60 : 0;
  return paceScore + cleanBonus;
}

function getStats() {
  const engine = gameState.upgrades.engine;
  const tires = gameState.upgrades.tires;
  const brakes = gameState.upgrades.brakes;

  return {
    maxSpeed: baseStats.maxSpeed + engine * 14,
    accel: baseStats.accel + engine * 24,
    friction: Math.max(90, baseStats.friction - tires * 4),
    turnRate: baseStats.turnRate + tires * 0.08,
    grip: baseStats.grip + tires * 0.016,
    brakeStrength: baseStats.brakeStrength + brakes * 35,
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Track
  ctx.fillStyle = "#606977";
  ctx.fillRect(track.outer.x, track.outer.y, track.outer.w, track.outer.h);
  ctx.fillStyle = "#20242d";
  ctx.fillRect(track.inner.x, track.inner.y, track.inner.w, track.inner.h);

  // Finish and checkpoints
  ctx.fillStyle = "#f4f0ff";
  ctx.fillRect(finishGate.x, finishGate.y, finishGate.w, finishGate.h);
  checkpoints.forEach((cp, idx) => {
    ctx.fillStyle = idx === checkpointIndex ? "#4bd86d" : "#2f945f";
    ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
  });

  // Car
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = touchedWallThisLap ? "#f39a9a" : "#8db4ff";
  ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);
  ctx.fillStyle = "#dce6ff";
  ctx.fillRect(-5, -car.height / 2 + 4, 10, 6);
  ctx.restore();

  // Mini HUD on canvas
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(16, 14, 220, 72);
  ctx.fillStyle = "#ffffff";
  ctx.font = "16px sans-serif";
  ctx.fillText(`Lap: ${formatTime(currentLapMs)}`, 24, 40);
  ctx.fillText(`Speed: ${Math.round(Math.abs(car.speed))}`, 24, 64);
}

function refreshHUD() {
  ui.money.textContent = gameState.money;
  ui.bestLap.textContent = gameState.bestLapMs ? formatTime(gameState.bestLapMs) : "--:--.---";
  ui.laps.textContent = gameState.laps;
  ui.lastReward.textContent = gameState.lastReward;
  ui.cleanBonus.textContent = gameState.cleanLap ? "Yes" : "No";
  updateShopUI();
}

function updateShopUI() {
  document.querySelectorAll(".upgrade").forEach((card) => {
    const type = card.dataset.upgrade;
    const level = gameState.upgrades[type];
    const def = upgradeDefs[type];
    const cost = getUpgradeCost(type, level);

    card.querySelector(".level").textContent = level;
    const buyBtn = card.querySelector(".buy");
    const costEl = card.querySelector(".cost");

    if (level >= def.maxLevel) {
      costEl.textContent = "MAX";
      buyBtn.textContent = "Maxed";
      buyBtn.disabled = true;
      return;
    }

    costEl.textContent = cost;
    buyBtn.textContent = `Buy (${cost} cr)`;
    buyBtn.disabled = gameState.money < cost;
  });
}

function getUpgradeCost(type, currentLevel) {
  const { baseCost, factor } = upgradeDefs[type];
  return Math.round(baseCost * factor ** currentLevel);
}

function loadState() {
  const fallback = {
    money: 300,
    bestLapMs: null,
    laps: 0,
    lastReward: 0,
    cleanLap: false,
    upgrades: { engine: 0, tires: 0, brakes: 0 },
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      upgrades: { ...fallback.upgrades, ...parsed.upgrades },
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
}

function setMessage(msg) {
  ui.message.textContent = msg;
}

function isOnTrack(x, y) {
  const inOuter =
    x > track.outer.x &&
    x < track.outer.x + track.outer.w &&
    y > track.outer.y &&
    y < track.outer.y + track.outer.h;
  const inInner =
    x > track.inner.x &&
    x < track.inner.x + track.inner.w &&
    y > track.inner.y &&
    y < track.inner.y + track.inner.h;
  return inOuter && !inInner;
}

function rectContainsPoint(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function approach(value, target, amount) {
  if (value < target) return Math.min(value + amount, target);
  if (value > target) return Math.max(value - amount, target);
  return target;
}

function formatTime(ms) {
  const totalMs = Math.max(0, Math.floor(ms));
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const msPart = totalMs % 1000;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
}

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}
