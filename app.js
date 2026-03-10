const CELL_SIZE = 16;
// Generated from Natural Earth 10m admin-0 country polygons (IRN/OMN/ARE)
// over bbox [55.1, 24.0, 58.8, 27.15] with 5x5 supersampling per cell.
const BOARD_MASK_ROWS = [
  ".............###########............................",
  "........######..##########..........................",
  ".......##......############.........................",
  "..#...##......#############.........................",
  "####....####################........................",
  "###.########################........................",
  "############################........................",
  "############################........................",
  "#################..##########.......................",
  "##############....###########.......................",
  "##############.....##########.......................",
  "#############.....############......................",
  "############......#############.....................",
  "###########......####################...............",
  "########.........########################...........",
  "######............##################################",
  "#####.............##################################",
  "###...............##################################",
  "##................##################################",
  "#.................##################################",
  "..................##################################",
  "..................##################################",
  "...................#################################",
  "....................################################",
  ".....................###############################",
  "......................##############################",
  ".......................#############################",
  "........................############################",
  ".........................###########################",
  "...........................#########################",
];
const BOARD_WIDTH = BOARD_MASK_ROWS[0].length;
const BOARD_HEIGHT = BOARD_MASK_ROWS.length;
const NEIGHBORS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const DIGIT_SEGMENTS = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
  "-": ["g"],
};

const windowEl = document.getElementById("app-window");
const desktopShortcutEl = document.getElementById("desktop-shortcut");
const boardEl = document.getElementById("board");
const mineCounterEl = document.getElementById("mine-counter");
const timerCounterEl = document.getElementById("timer-counter");
const resetButtonEl = document.getElementById("reset-button");
const minimizeWindowEl = document.getElementById("window-minimize");
const maximizeWindowEl = document.getElementById("window-maximize");
const closeWindowEl = document.getElementById("window-close");
const gameMenuEl = document.getElementById("menu-game");
const gameMenuPopupEl = document.getElementById("game-menu");
const newGameMenuItemEl = document.getElementById("menu-new");
const helpMenuEl = document.getElementById("menu-help");
const helpMenuPopupEl = document.getElementById("help-menu");
const helpHowMenuItemEl = document.getElementById("menu-help-how");
const helpDialogEl = document.getElementById("help-dialog");

const state = {
  board: [],
  mask: [],
  playableCount: 0,
  mineCount: 0,
  started: false,
  minesPlaced: false,
  gameOver: false,
  won: false,
  flaggedCount: 0,
  revealedCount: 0,
  timer: 0,
  timerId: null,
  face: "smile",
  openMenu: null,
};

function buildMask() {
  const mask = BOARD_MASK_ROWS.map((row) => [...row].map((cell) => cell === "#"));
  const playableCount = mask.reduce(
    (count, row) => count + row.filter(Boolean).length,
    0,
  );

  return { mask, playableCount };
}

function createBoard() {
  return state.mask.map((rowMask, row) =>
    rowMask.map((playable, col) => ({
      row,
      col,
      playable,
      mine: false,
      adjacent: 0,
      revealed: false,
      mark: "hidden",
      exploded: false,
      wrongFlag: false,
    })),
  );
}

function resetGame() {
  stopTimer();

  const { mask, playableCount } = buildMask();

  state.mask = mask;
  state.playableCount = playableCount;
  state.mineCount = Math.max(40, Math.round(playableCount * 0.18));
  state.board = createBoard();
  state.started = false;
  state.minesPlaced = false;
  state.gameOver = false;
  state.won = false;
  state.flaggedCount = 0;
  state.revealedCount = 0;
  state.timer = 0;

  setFace("smile");
  updateCounters();
  renderBoard();
}

function setFace(face) {
  state.face = face;
  resetButtonEl.innerHTML = faceSvg(face);
}

function updateCounters() {
  mineCounterEl.innerHTML = renderCounter(state.mineCount - state.flaggedCount);
  timerCounterEl.innerHTML = renderCounter(state.timer);
  mineCounterEl.setAttribute("aria-label", `${state.mineCount - state.flaggedCount} mines remaining`);
  timerCounterEl.setAttribute("aria-label", `${state.timer} seconds elapsed`);
}

function renderCounter(value) {
  const clamped = Math.max(-99, Math.min(999, value));
  const chars =
    clamped < 0
      ? `-${String(Math.abs(clamped)).padStart(2, "0")}`
      : String(clamped).padStart(3, "0");

  return chars
    .split("")
    .map((character) => renderDigit(character))
    .join("");
}

function renderDigit(character) {
  const activeSegments = new Set(DIGIT_SEGMENTS[character] || []);

  return `<span class="digit">${["a", "b", "c", "d", "e", "f", "g"]
    .map(
      (segment) =>
        `<span class="segment ${segment}${activeSegments.has(segment) ? " is-on" : ""}"></span>`,
    )
    .join("")}</span>`;
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    if (state.timer < 999) {
      state.timer += 1;
      updateCounters();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function shuffle(list) {
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
}

function placeMines(safeRow, safeCol) {
  const candidates = [];

  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.playable && !(cell.row === safeRow && cell.col === safeCol)) {
        candidates.push(cell);
      }
    });
  });

  shuffle(candidates);

  candidates.slice(0, state.mineCount).forEach((cell) => {
    cell.mine = true;
  });

  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.playable || cell.mine) {
        return;
      }

      cell.adjacent = getNeighbors(cell.row, cell.col).filter((neighbor) => neighbor.mine).length;
    });
  });

  state.minesPlaced = true;
}

function getCell(row, col) {
  return state.board[row]?.[col] || null;
}

function getNeighbors(row, col) {
  return NEIGHBORS.map(([rowOffset, colOffset]) => getCell(row + rowOffset, col + colOffset)).filter(
    (cell) => cell && cell.playable,
  );
}

function revealFlood(startRow, startCol) {
  const stack = [[startRow, startCol]];

  while (stack.length > 0) {
    const [row, col] = stack.pop();
    const cell = getCell(row, col);

    if (!cell || !cell.playable || cell.revealed || cell.mark === "flagged") {
      continue;
    }

    cell.revealed = true;
    cell.mark = "hidden";
    state.revealedCount += 1;

    if (cell.adjacent !== 0) {
      continue;
    }

    getNeighbors(row, col).forEach((neighbor) => {
      if (!neighbor.revealed && neighbor.mark !== "flagged" && !neighbor.mine) {
        stack.push([neighbor.row, neighbor.col]);
      }
    });
  }
}

function explode(row, col) {
  state.gameOver = true;
  state.won = false;
  stopTimer();

  state.board.forEach((boardRow) => {
    boardRow.forEach((cell) => {
      if (!cell.playable) {
        return;
      }

      if (cell.mine) {
        cell.revealed = true;
      }

      if (cell.mark === "flagged" && !cell.mine) {
        cell.wrongFlag = true;
      }
    });
  });

  const explodedCell = getCell(row, col);
  if (explodedCell) {
    explodedCell.exploded = true;
  }

  setFace("dead");
  updateCounters();
  renderBoard();
}

function finishWin() {
  state.gameOver = true;
  state.won = true;
  stopTimer();

  state.board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.playable && cell.mine) {
        cell.mark = "flagged";
      }
    });
  });

  state.flaggedCount = state.mineCount;
  setFace("win");
  updateCounters();
  renderBoard();
}

function checkWin() {
  if (state.revealedCount === state.playableCount - state.mineCount) {
    finishWin();
  }
}

function revealCell(row, col) {
  const cell = getCell(row, col);

  if (!cell || !cell.playable || cell.revealed || cell.mark === "flagged" || state.gameOver) {
    return;
  }

  if (!state.started) {
    state.started = true;
    placeMines(row, col);
    startTimer();
  }

  if (cell.mine) {
    explode(row, col);
    return;
  }

  revealFlood(row, col);
  checkWin();
  updateCounters();
  renderBoard();
}

function chordCell(row, col) {
  const cell = getCell(row, col);

  if (!cell || !cell.revealed || cell.adjacent === 0 || state.gameOver) {
    return;
  }

  const neighbors = getNeighbors(row, col);
  const flaggedNeighbors = neighbors.filter((neighbor) => neighbor.mark === "flagged").length;

  if (flaggedNeighbors !== cell.adjacent) {
    return;
  }

  for (const neighbor of neighbors) {
    if (neighbor.mark === "flagged" || neighbor.revealed) {
      continue;
    }

    if (neighbor.mine) {
      explode(neighbor.row, neighbor.col);
      return;
    }
  }

  neighbors.forEach((neighbor) => {
    if (!neighbor.revealed && neighbor.mark !== "flagged") {
      revealFlood(neighbor.row, neighbor.col);
    }
  });

  checkWin();
  updateCounters();
  renderBoard();
}

function cycleMark(row, col) {
  const cell = getCell(row, col);

  if (!cell || !cell.playable || cell.revealed || state.gameOver) {
    return;
  }

  if (cell.mark === "hidden") {
    cell.mark = "flagged";
    state.flaggedCount += 1;
  } else if (cell.mark === "flagged") {
    cell.mark = "question";
    state.flaggedCount -= 1;
  } else {
    cell.mark = "hidden";
  }

  updateCounters();
  renderBoard();
}

function renderBoard() {
  boardEl.style.gridTemplateColumns = `repeat(${BOARD_WIDTH}, ${CELL_SIZE}px)`;

  const cells = state.board
    .flat()
    .map((cell) => {
      if (!cell.playable) {
        return '<div class="cell is-void" aria-hidden="true"></div>';
      }

      const classes = ["cell"];
      let content = "";
      let countAttribute = "";

      if (cell.revealed) {
        classes.push("is-revealed");

        if (cell.mine) {
          if (cell.exploded) {
            classes.push("is-exploded");
          }

          content = mineSvg();
        } else if (cell.adjacent > 0) {
          countAttribute = ` data-count="${cell.adjacent}"`;
          content = `<span class="cell-value">${cell.adjacent}</span>`;
        }
      } else {
        classes.push("is-hidden");

        if (cell.wrongFlag) {
          content = crossedFlagSvg();
        } else if (cell.mark === "flagged") {
          content = flagSvg();
        } else if (cell.mark === "question") {
          content = '<span class="question-mark">?</span>';
        }
      }

      return `<button class="${classes.join(" ")}" type="button" data-row="${cell.row}" data-col="${cell.col}"${countAttribute} aria-label="Cell">${content}</button>`;
    })
    .join("");

  boardEl.innerHTML = cells;
}

function faceSvg(face) {
  if (face === "dead") {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#ffff00" stroke="#000000" stroke-width="1.5" />
        <path d="M7.5 7.5 L10 10 M10 7.5 L7.5 10" stroke="#000000" stroke-width="1.5" stroke-linecap="square" />
        <path d="M14 7.5 L16.5 10 M16.5 7.5 L14 10" stroke="#000000" stroke-width="1.5" stroke-linecap="square" />
        <path d="M7 17 Q12 13 17 17" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    `;
  }

  if (face === "win") {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#ffff00" stroke="#000000" stroke-width="1.5" />
        <rect x="6" y="6.5" width="4.5" height="3" fill="#000000" />
        <rect x="13.5" y="6.5" width="4.5" height="3" fill="#000000" />
        <rect x="10.5" y="7.5" width="3" height="1.5" fill="#000000" />
        <path d="M7 15 Q12 19 17 15" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    `;
  }

  if (face === "surprised") {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#ffff00" stroke="#000000" stroke-width="1.5" />
        <circle cx="8.5" cy="8.5" r="1.3" fill="#000000" />
        <circle cx="15.5" cy="8.5" r="1.3" fill="#000000" />
        <circle cx="12" cy="15" r="2.1" fill="#000000" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#ffff00" stroke="#000000" stroke-width="1.5" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="#000000" />
      <circle cx="15.5" cy="8.5" r="1.3" fill="#000000" />
      <path d="M7 14.5 Q12 18.5 17 14.5" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  `;
}

function flagSvg() {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="7" y="2" width="1" height="10" fill="#000000" />
      <polygon points="8,2 8,8 3,6 3,2" fill="#ff0000" />
      <rect x="5" y="12" width="6" height="1" fill="#000000" />
      <rect x="4" y="13" width="8" height="1" fill="#000000" />
    </svg>
  `;
}

function crossedFlagSvg() {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="7" y="2" width="1" height="10" fill="#000000" />
      <polygon points="8,2 8,8 3,6 3,2" fill="#ff0000" />
      <rect x="5" y="12" width="6" height="1" fill="#000000" />
      <rect x="4" y="13" width="8" height="1" fill="#000000" />
      <path d="M3 3 L13 13 M13 3 L3 13" stroke="#000000" stroke-width="1.5" />
    </svg>
  `;
}

function mineSvg() {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" fill="#000000" />
      <rect x="7.5" y="1" width="1" height="4" fill="#000000" />
      <rect x="7.5" y="11" width="1" height="4" fill="#000000" />
      <rect x="1" y="7.5" width="4" height="1" fill="#000000" />
      <rect x="11" y="7.5" width="4" height="1" fill="#000000" />
      <rect x="2.6" y="2.6" width="1" height="3" transform="rotate(-45 3.1 4.1)" fill="#000000" />
      <rect x="12.4" y="2.6" width="1" height="3" transform="rotate(45 12.9 4.1)" fill="#000000" />
      <rect x="2.6" y="10.4" width="1" height="3" transform="rotate(45 3.1 11.9)" fill="#000000" />
      <rect x="12.4" y="10.4" width="1" height="3" transform="rotate(-45 12.9 11.9)" fill="#000000" />
      <circle cx="6.2" cy="6.2" r="1" fill="#ffffff" />
    </svg>
  `;
}

function handleBoardPointerDown(event) {
  if (event.button !== 0 || state.gameOver) {
    return;
  }

  const cellEl = event.target.closest(".cell");
  if (!cellEl || cellEl.classList.contains("is-void")) {
    return;
  }

  setFace("surprised");
}

function handleBoardPointerUp(event) {
  const cellEl = event.target.closest(".cell");

  if (!cellEl || cellEl.classList.contains("is-void")) {
    if (!state.gameOver) {
      setFace("smile");
    }
    return;
  }

  const row = Number(cellEl.dataset.row);
  const col = Number(cellEl.dataset.col);

  if (event.button === 0) {
    const cell = getCell(row, col);

    if (cell?.revealed) {
      chordCell(row, col);
    } else {
      revealCell(row, col);
    }
  }

  if (event.button === 2) {
    cycleMark(row, col);
  }

  if (!state.gameOver) {
    setFace("smile");
  }
}

function closeMenus() {
  state.openMenu = null;
  gameMenuEl.classList.remove("is-open");
  helpMenuEl.classList.remove("is-open");
  gameMenuEl.setAttribute("aria-expanded", "false");
  helpMenuEl.setAttribute("aria-expanded", "false");
  gameMenuPopupEl.hidden = true;
  helpMenuPopupEl.hidden = true;
}

function openMenu(menuName) {
  closeMenus();
  state.openMenu = menuName;

  if (menuName === "game") {
    gameMenuEl.classList.add("is-open");
    gameMenuEl.setAttribute("aria-expanded", "true");
    gameMenuPopupEl.hidden = false;
    return;
  }

  helpMenuEl.classList.add("is-open");
  helpMenuEl.setAttribute("aria-expanded", "true");
  helpMenuPopupEl.hidden = false;
}

function toggleMenu(menuName) {
  if (state.openMenu === menuName) {
    closeMenus();
    return;
  }

  openMenu(menuName);
}

function syncWindowControls() {
  maximizeWindowEl.textContent = windowEl.classList.contains("is-maximized") ? "]["
    : "[]";
  maximizeWindowEl.setAttribute(
    "aria-label",
    windowEl.classList.contains("is-maximized") ? "Restore" : "Maximize",
  );
}

function restoreWindow() {
  windowEl.hidden = false;
  windowEl.classList.remove("is-minimized");
  desktopShortcutEl.hidden = true;
  syncWindowControls();
}

function minimizeWindow() {
  closeMenus();
  if (helpDialogEl.open) {
    helpDialogEl.close();
  }

  windowEl.hidden = false;
  windowEl.classList.toggle("is-minimized");
}

function toggleMaximizeWindow() {
  closeMenus();
  restoreWindow();
  windowEl.classList.toggle("is-maximized");
  syncWindowControls();
}

function closeWindow() {
  closeMenus();
  if (helpDialogEl.open) {
    helpDialogEl.close();
  }

  windowEl.hidden = true;
  windowEl.classList.remove("is-minimized");
  desktopShortcutEl.hidden = false;
  desktopShortcutEl.focus();
}

boardEl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

boardEl.addEventListener("pointerdown", handleBoardPointerDown);
boardEl.addEventListener("pointerup", handleBoardPointerUp);

window.addEventListener("pointerup", () => {
  if (!state.gameOver && state.face === "surprised") {
    setFace("smile");
  }
});

resetButtonEl.addEventListener("click", resetGame);
minimizeWindowEl.addEventListener("click", minimizeWindow);
maximizeWindowEl.addEventListener("click", toggleMaximizeWindow);
closeWindowEl.addEventListener("click", closeWindow);
desktopShortcutEl.addEventListener("click", restoreWindow);

gameMenuEl.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu("game");
});

helpMenuEl.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu("help");
});

newGameMenuItemEl.addEventListener("click", () => {
  closeMenus();
  resetGame();
});

helpHowMenuItemEl.addEventListener("click", () => {
  closeMenus();
  helpDialogEl.showModal();
});

window.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".menu-bar")) {
    return;
  }

  closeMenus();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
  }
});

helpDialogEl.addEventListener("close", closeMenus);

syncWindowControls();
resetGame();
