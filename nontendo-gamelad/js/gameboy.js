document.addEventListener("DOMContentLoaded", () => {
  // console.log("DOM loaded");

  // DOM ELEMENT REFERENCES
  const pwr = document.getElementById("pwr");
  const powerSwitch = document.querySelector(".power-switch");
  const screenDiv = document.querySelector(".screen");
  const canvas = document.getElementById("screenCanvas");
  const ctx = canvas ? canvas.getContext("2d") : null;

  if (!pwr || !canvas || !ctx) {
    console.error("Missing elements:", { pwr, canvas, ctx });
    return;
  }

  // AUDIO
  const beepSound = new Audio("/assets/sfx/food-beep.m4a");
  beepSound.volume = 0.3;

  const gameOverSound = new Audio("/assets/sfx/game-over.m4a");
  gameOverSound.volume = 0.5;

  // STATE VARIABLES
  let isOn = false;
  let loadingTimeout = null;
  let gameStarted = false;
  let isGameOver = false;
  let isPaused = false;

  // CONSTANTS
  const COLORS = {
    darkest: "#0f380f",
    dark: "#306230",
    light: "#8bac0f",
    lightest: "#9bbc0f",
  };

  const gridSize = 8;

  // making canvas size multiples of gridSize to fix food spawning of canvas
  canvas.width = Math.floor(canvas.width / gridSize) * gridSize;
  canvas.height = Math.floor(canvas.height / gridSize) * gridSize;

  const gridWidth = canvas.width / gridSize; // 20 cells
  const gridHeight = canvas.height / gridSize; // 18 cells
  ctx.fillStyle = COLORS.lightest;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  function playBeep() {
    const beep = new Audio("/assets/sfx/food-beep.m4a");
    beep.volume = 0.5;
    beep.play();
  }

  function playGameOverSound() {
    const gameOver = new Audio("/assets/sfx/game-over.m4a");
    gameOver.volume = 0.5;
    gameOver.play();
  }

  // GAME STATE VARIABLES
  let snake = [];
  let food = null;
  let direction = { x: 1, y: 0 };
  let nextDirection = { x: 1, y: 0 };
  let score = 0;
  let gameLoop = null;

  // POWER/LED FUNCTIONS
  function powerOn() {
    if (isOn) return;
    isOn = true;
    // led
    pwr.classList.add("on");
    pwr.classList.remove("off", "fade-out");
    // screen
    screenDiv.classList.remove("off");
    screenDiv.style.opacity = "1";
    screenDiv.style.filter = "none";
    // boot sequence
    startLoading(1200);
  }

  function powerOff() {
    if (!isOn) return;
    isOn = false;
    stopGame();
    // led
    pwr.classList.remove("on", "dim");
    pwr.classList.add("fade-out");
    // screen
    screenDiv.classList.add("off");
    // remove all text elements
    screenDiv
      .querySelectorAll(".boot-text, .nontendo-text, .press-start, .loader")
      .forEach((el) => el.remove());
    // clear any pending timeouts
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
    // stop game
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    isPaused = false;
    isGameOver = false;
    gameStarted = false;
    // clear canvas
    ctx.fillStyle = COLORS.lightest;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  powerSwitch.addEventListener("click", () => {
    const turningOn = !isOn;
    powerSwitch.classList.toggle("on", turningOn);
    turningOn ? powerOn() : powerOff();
  });

  // SCREEN/BOOT ANIMATION FUNCTIONS
  function startLoading(duration = 1200) {
    screenDiv
      .querySelectorAll(
        ".boot-text, .nontendo-text, .press-start, .loader, .boot-wipe",
      )
      .forEach((el) => el.remove());

    clearTimeout(loadingTimeout);

    screenDiv.classList.add("loading", "booting");

    const bootText = document.createElement("div");
    bootText.className = "boot-text";
    bootText.textContent = "Booting...";
    screenDiv.appendChild(bootText);

    const loader = document.createElement("div");
    loader.className = "loader";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.animationDuration = `${duration}ms`;
    loader.appendChild(bar);
    screenDiv.appendChild(loader);

    // Add wipe overlay
    const wipe = document.createElement("div");
    wipe.className = "boot-wipe";
    wipe.style.animationDuration = `${duration}ms`;
    screenDiv.appendChild(wipe);

    requestAnimationFrame(() => (bootText.style.opacity = "1"));

    loadingTimeout = setTimeout(() => {
      bootText.remove();
      loader.remove();
      wipe.remove();

      screenDiv.classList.remove("loading", "booting");
      screenDiv.classList.add("ready");

      setTimeout(() => {
        const logo = document.createElement("div");
        logo.className = "nontendo-text";
        logo.textContent = "NONTENDO";
        screenDiv.appendChild(logo);
        requestAnimationFrame(() => logo.classList.add("show"));

        const pressStart = document.createElement("div");
        pressStart.className = "press-start";
        pressStart.textContent = "PRESS START";
        screenDiv.appendChild(pressStart);
      }, 1000);
    }, duration);
  }

  function stopLoading() {
    if (!screenDiv) return;
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
    screenDiv.classList.remove("loading", "ready");

    const logo = screenDiv.querySelector(".nontendo-text");
    if (logo) {
      logo.classList.remove("show");

      const onEnd = (e) => {
        if (e.propertyName === "transform") {
          logo.removeEventListener("transitionend", onEnd);
          if (document.body.contains(logo)) logo.remove();
        }
      };
      logo.addEventListener("transitionend", onEnd);

      // Fallback removal
      setTimeout(() => {
        if (document.body.contains(logo)) logo.remove();
      }, 900);
    }

    // Remove leftover boot-text and press-start text
    const bootText = screenDiv.querySelector(".boot-text");
    if (bootText) bootText.remove();

    const pressStart = screenDiv.querySelector(".press-start");
    if (pressStart) pressStart.remove();
  }

  // GAME INITIALIZATION FUNCTIONS
  function initSnake() {
    snake = [
      { x: 5, y: Math.floor(gridHeight / 2) },
      { x: 4, y: Math.floor(gridHeight / 2) },
      { x: 3, y: Math.floor(gridHeight / 2) },
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    spawnFood();
  }

  function spawnFood() {
    let validPosition = false;
    while (!validPosition) {
      food = {
        x: Math.floor(Math.random() * gridWidth),
        y: Math.floor(Math.random() * gridHeight),
      };
      // Clamp to grid just in case
      food.x = Math.min(food.x, gridWidth - 1);
      food.y = Math.min(food.y, gridHeight - 1);
      // Make sure food is not on the snake
      validPosition = !snake.some(
        (segment) => segment.x === food.x && segment.y === food.y,
      );
    }
  }

  // GAME RENDERING FUNCTIONS
  function drawRect(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * gridSize, y * gridSize, gridSize, gridSize);
  }

  function drawGame() {
    if (!gameStarted) return;
    ctx.fillStyle = COLORS.lightest;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (snake.length === 0) return;

    // Draw snake
    snake.forEach((segment, index) => {
      drawRect(
        segment.x,
        segment.y,
        index === 0 ? COLORS.darkest : COLORS.dark,
      );
    });

    // Draw food
    if (food) {
      drawRect(food.x, food.y, COLORS.dark);
    }

    // Draw score
    ctx.fillStyle = COLORS.darkest;
    ctx.font = "8px Bitty";
    ctx.fillText(`SCORE: ${score}`, 4, 10);
  }

  function drawPauseOverlay() {
    ctx.fillStyle = "rgba(155, 188, 15, 0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = COLORS.darkest;
    ctx.font = "12px Bitty";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
    ctx.font = "8px Bitty";
    ctx.fillText("PRESS START", canvas.width / 2, canvas.height / 2 + 16);
    ctx.textAlign = "left";
  }

  // GAME LOGIC FUNCTIONS
  function updateSnake() {
    // Update direction
    direction = { ...nextDirection };
    // Calculate new head position
    const newHead = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y,
    };
    // Check wall collision
    if (
      newHead.x < 0 ||
      newHead.x >= gridWidth ||
      newHead.y < 0 ||
      newHead.y >= gridHeight
    ) {
      gameOver();
      return;
    }
    // Check self collision
    if (
      snake.some(
        (segment) => segment.x === newHead.x && segment.y === newHead.y,
      )
    ) {
      gameOver();
      return;
    }
    // Add new head
    snake.unshift(newHead);
    // Check food collision
    if (food && newHead.x === food.x && newHead.y === food.y) {
      score += 10;
      spawnFood();
      playBeep();
    } else {
      snake.pop();
    }
  }

  // GAME STATE CONTROL FUNCTIONS
  function startGameLoop() {
    if (gameLoop) clearInterval(gameLoop);

    gameLoop = setInterval(() => {
      if (isPaused || isGameOver) return;

      updateSnake();
      if (isGameOver) return;

      drawGame();
    }, 150);
  }
  function startGame() {
    if (gameStarted) return;

    isGameOver = false;
    isPaused = false;
    gameStarted = true;

    initSnake();
    drawGame();
    startGameLoop();
  }

  function stopGame() {
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    gameStarted = false;

    // Clear canvas
    ctx.fillStyle = COLORS.lightest;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function pauseGame() {
    if (!gameStarted || isGameOver) return;

    isPaused = true;
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }

    drawGame();
    drawPauseOverlay();
  }

  function resumeGame() {
    if (!isPaused || isGameOver) return;

    isPaused = false;
    startGameLoop();
  }

  function gameOver() {
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    isGameOver = true;
    gameStarted = false;
    playGameOverSound();
    // Draw game over screen
    ctx.fillStyle = COLORS.lightest;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = COLORS.darkest;
    ctx.font = "12px Bitty";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = "8px Bitty";
    ctx.fillText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 5);
    ctx.fillText("PRESS START", canvas.width / 2, canvas.height / 2 + 20);
    ctx.textAlign = "left";

    gameStarted = false;
  }

  // INPUT HANDLING
  function handleInput(input) {
    if (!isOn) return;
    if (!gameStarted) {
      if (input === "start" && isOn) {
        // Removes "press start" text if it exists
        const pressStart = screenDiv.querySelector(".press-start");
        if (pressStart) pressStart.remove();

        const logo = screenDiv.querySelector(".nontendo-text");
        if (logo) {
          logo.classList.remove("show");
          setTimeout(() => logo.remove(), 500);
        }

        startGame();
      }
      return;
    }

    // Prevents reversing into itself
    switch (input) {
      case "up":
        if (direction.y === 0) nextDirection = { x: 0, y: -1 };
        break;
      case "down":
        if (direction.y === 0) nextDirection = { x: 0, y: 1 };
        break;
      case "left":
        if (direction.x === 0) nextDirection = { x: -1, y: 0 };
        break;
      case "right":
        if (direction.x === 0) nextDirection = { x: 1, y: 0 };
        break;
      case "start":
        // Pause/resume
        if (isPaused) {
          resumeGame();
        } else {
          pauseGame();
        }
        break;
    }
  }

  // EVENT LISTENERS
  const buttons = document.querySelectorAll("[data-input]");

  buttons.forEach((button) => {
    const input = button.dataset.input;

    button.addEventListener("mousedown", () => {
      button.classList.add("pressed");
      handleInput(input);
    });

    button.addEventListener("mouseup", () => {
      button.classList.remove("pressed");
    });

    button.addEventListener("mouseleave", () => {
      button.classList.remove("pressed");
    });
  });

  // Keyboard controls
  const pressedKeys = new Set();

  document.addEventListener("keydown", (e) => {
    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Enter: "start",
      " ": "start",
      w: "up",
      s: "down",
      a: "left",
      d: "right",
    };

    const input = keyMap[e.key];
    if (input) {
      e.preventDefault();

      // Prevent repeating keydown events
      if (pressedKeys.has(e.key)) return;
      pressedKeys.add(e.key);

      // Add visual feedback to the button
      const button = document.querySelector(`[data-input="${input}"]`);
      if (button) {
        button.classList.add("pressed");
      }

      handleInput(input);
    }
  });

  document.addEventListener("keyup", (e) => {
    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Enter: "start",
      " ": "start",
      w: "up",
      s: "down",
      a: "left",
      d: "right",
    };

    const input = keyMap[e.key];
    if (input) {
      pressedKeys.delete(e.key);

      // Remove visual feedback from the button
      const button = document.querySelector(`[data-input="${input}"]`);
      if (button) {
        button.classList.remove("pressed");
      }
    }
  });

  // INITIALIZATION
  isOn = false;
  pwr.classList.add("off");
  pwr.classList.remove("on", "dim");
  screenDiv.classList.add("off"); // Start with screen in off state
});
