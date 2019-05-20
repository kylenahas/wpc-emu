'use strict';

import { replaceNode } from './htmlselector';
import { createDrawLib } from './ui/lib';

export { initialise, updateCanvas, populateInitialCanvas, errorFeedback, loadFeedback };

// https://gmunk.com/OBLIVION-GFX
// https://www.reddit.com/r/OblivionMovie/comments/6pchsr/i_have_cloned_the_dc_tet_font_as_best_as_i_can/
// https://ilikeinterfaces.com/2015/04/21/ui-review-oblivion/
// FONT: https://www.whatfontis.com/Blender-Bold.similar

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 768;

let canvas, canvasDrawLib;
let canvasOverlay, canvasOverlayDrawLib;
let canvasDmd, canvaDmdDrawLib;
let canvasDmdMem, canvaDmdMemDrawLib;
let canvasMem, canvaMemDrawLib;

let playfieldData;
let playfieldImage;
let frame = 0;
let initialized = false;
let gameEntry;

const THEME = {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,

  DMD_COLOR_BLACK: 'rgb(0,0,0)',
  DMD_COLOR_DARK: 'rgb(43,62,67)',
  DMD_COLOR_LOW: 'rgb(65,101,105)',
  DMD_COLOR_MIDDLE: 'rgb(182,155,93)',
  DMD_COLOR_HIGH: 'rgb(254, 255, 211)',

  GRID_POINTS_COLOR: 'rgb(44, 63, 67)',
  GRID_STEP_X: 12,
  GRID_STEP_Y: 12,
  GRID_SIZE: 1.2,

  HEADER_LINE_LOW_COLOR: 'rgb(52, 71, 75)',
  HEADER_LINE_HIGH_COLOR: 'rgb(150, 154, 147)',

  FONT_NAME: 'Space Mono',
  FONT_HEADER: '14px "Space Mono"',
  FONT_TEXT: '10px "Space Mono"',
  FONT_HUGE: '22px "Space Mono"',

  TEXT_COLOR_HEADER: 'rgb(127, 179, 171)',
  RIBBON_COLOR_HEADER: 'rgb(32, 45, 50)',

  TEXT_COLOR_LABEL: 'rgb(96, 110, 112)',
  TEXT_COLOR: 'rgb(237, 246, 206)',

  COLOR_BLUE: 'rgb(81, 115, 117)',
  COLOR_BLUE_INTENSE: 'rgb(106, 198, 213)',
  COLOR_RED: 'rgb(255, 108, 74)',
  COLOR_YELLOW: 'rgb(254, 255, 211)',

  POS_HEADER_X: 1,
  POS_HEADER_Y: 6,

  POS_CPU_X: 1,
  POS_CPU_Y: 12,

  POS_DMD_X: 20,
  POS_DMD_Y: 8,

  POS_PLAYFIELD_X: 89,
  POS_PLAYFIELD_Y: 9,

  POS_DMDMEM_X: 37,
  POS_DMDMEM_Y: 28,

  POS_ASIC_X: 1,
  POS_ASIC_Y: 38,

  POS_MEM_X: 19,
  POS_MEM_Y: 28,

  POS_SND_X: 1,
  POS_SND_Y: 51,

  POS_DMDSTAT_X: 19,
  POS_DMDSTAT_Y: 1,

  POS_MATRIX_X: 19,
  POS_MATRIX_Y: 38,

  POS_RAMDIAG_X: 38,
  POS_RAMDIAG_Y: 53,
};

let videoRam;
let videoRamDraw = 0;

const lampColorLut = new Map();
lampColorLut.set('YELLOW', 'rgba(255,255,0,');
lampColorLut.set('ORANGE', 'rgba(255,165,0,');
lampColorLut.set('RED', 'rgba(255,0,0,');
lampColorLut.set('LBLUE', 'rgba(173,216,230,');
lampColorLut.set('LPURPLE', 'rgba(218,112,214,');
lampColorLut.set('WHITE', 'rgba(255,255,255,');
lampColorLut.set('GREEN', 'rgba(0,255,0,');
lampColorLut.set('BLACK', 'rgba(0,0,0,0)');

function updateCanvas(emuState, cpuRunningState, audioState) {
  if (!emuState) {
    return;
  }
  frame++;
  canvasOverlayDrawLib.clear();

  // HEADER
  canvasOverlayDrawLib.writeHeader(THEME.POS_HEADER_X + 5, THEME.POS_HEADER_Y + 2, emuState.romFileName);
  canvasOverlayDrawLib.writeRibbonHeader(THEME.POS_DMD_X + 60, THEME.POS_DMD_Y - 3.5, emuState.asic.wpc.time, THEME.FONT_TEXT);

  // CPU
  canvasOverlayDrawLib.writeHeader(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 2, emuState.cpuState.tickCount);
  canvasOverlayDrawLib.fillRect(THEME.POS_CPU_X + 13, THEME.POS_CPU_Y + 1.5, 1, 1, emuState.asic.wpc.irqEnabled ? THEME.COLOR_RED : THEME.DMD_COLOR_DARK);
  canvasOverlayDrawLib.drawVerticalRandomBlip(THEME.POS_CPU_X + 14.5, THEME.POS_CPU_Y + 1, 3);

  canvasOverlayDrawLib.writeHeader(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 5, emuState.opsMs);
  if (cpuRunningState === 'running') {
    canvasOverlayDrawLib.writeHeader(THEME.POS_CPU_X + 9, THEME.POS_CPU_Y + 5, cpuRunningState, THEME.COLOR_BLUE_INTENSE);
  } else {
    canvasOverlayDrawLib.writeHeader(THEME.POS_CPU_X + 9, THEME.POS_CPU_Y + 5, cpuRunningState, THEME.COLOR_RED);
  }
  canvasOverlayDrawLib.drawDiagram(THEME.POS_CPU_X + 4.5, THEME.POS_CPU_Y + 5.5, 'OPS-DIAG', emuState.opsMs, 12);

  canvasOverlayDrawLib.writeHeader(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 8, emuState.cpuState.irqCount);
  canvasOverlayDrawLib.writeHeader(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 9, emuState.cpuState.missedIRQ);
  canvasOverlayDrawLib.writeHeader(THEME.POS_CPU_X + 9, THEME.POS_CPU_Y + 8, emuState.cpuState.firqCount);
  canvasOverlayDrawLib.writeHeader(THEME.POS_CPU_X + 9, THEME.POS_CPU_Y + 9, emuState.cpuState.missedFIRQ);

  canvasOverlayDrawLib.drawDiagram(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 12, 'REGPC', emuState.cpuState.regPC);

  canvasOverlayDrawLib.drawHorizontalBitDiagram(THEME.POS_CPU_X + 1.75, THEME.POS_CPU_Y + 18.625, emuState.cpuState.regCC);

  /*
  regA: 0
regB: 0
regDP: 0
regS: 5918
regU: 2817
regX: 887
regY: 36587
*/
  // DMD SHADED
  if (emuState.asic.dmd.dmdShadedBuffer) {
    canvaDmdDrawLib.clear(
      THEME.GRID_STEP_X * THEME.POS_DMD_X,
      THEME.GRID_STEP_Y * THEME.POS_DMD_Y,
      THEME.GRID_STEP_X * 128 / 2,
      THEME.GRID_STEP_Y * 32 / 2
    );
    canvaDmdDrawLib.drawDmdShaded(THEME.POS_DMD_X, THEME.POS_DMD_Y, emuState.asic.dmd.dmdShadedBuffer);
  }
  canvasOverlayDrawLib.drawHorizontalRandomBlip(THEME.POS_DMD_X + 60, THEME.POS_DMD_Y - 5, 8, emuState.asic.wpc.diagnosticLedToggleCount);
  canvasOverlayDrawLib.fillRect(THEME.POS_DMD_X - 1, THEME.POS_DMD_Y + 17.5, 1, 0.5, emuState.asic.dmd.requestFIRQ ? THEME.COLOR_RED : THEME.DMD_COLOR_DARK);
  canvasOverlayDrawLib.fillRect(THEME.POS_DMD_X + 24, THEME.POS_DMD_Y + 17.5, 1, 0.5, emuState.asic.wpc.zeroCrossFlag ? THEME.COLOR_RED : THEME.DMD_COLOR_DARK);

  // ASIC
  canvasOverlayDrawLib.drawDiagram(THEME.POS_ASIC_X + 1, THEME.POS_ASIC_Y + 3, 'WATCHDOG', emuState.asic.wpc.watchdogTicks);
  canvasOverlayDrawLib.writeLabel(THEME.POS_ASIC_X + 11.5, THEME.POS_ASIC_Y + 1, emuState.asic.wpc.watchdogExpiredCounter, THEME.COLOR_RED);

  canvasOverlayDrawLib.fillRect(THEME.POS_ASIC_X + 1, THEME.POS_ASIC_Y + 5.5, 1, 1, emuState.asic.wpc.blankSignalHigh ? THEME.COLOR_RED : THEME.DMD_COLOR_DARK);
  canvasOverlayDrawLib.fillRect(THEME.POS_ASIC_X + 3, THEME.POS_ASIC_Y + 5.5, 1, 1, THEME.COLOR_RED);
  canvasOverlayDrawLib.fillRect(THEME.POS_ASIC_X + 5, THEME.POS_ASIC_Y + 5.5, 1, 1, emuState.asic.wpc.diagnosticLed ? THEME.COLOR_RED : THEME.DMD_COLOR_DARK);
  canvasOverlayDrawLib.writeHeader(THEME.POS_ASIC_X + 8, THEME.POS_ASIC_Y + 6.5, emuState.asic.wpc.diagnosticLedToggleCount);

  canvasOverlayDrawLib.drawDiagram(THEME.POS_ASIC_X + 1, THEME.POS_ASIC_Y + 9.5, 'ASIC_ROM_BANK', emuState.asic.wpc.activeRomBank, 22);
  canvasOverlayDrawLib.writeHeader(THEME.POS_ASIC_X + 8, THEME.POS_ASIC_Y + 9, emuState.protectedMemoryWriteAttempts);

  // MEMORY
  if (emuState.asic.ram) {
    canvaMemDrawLib.drawMemRegion(THEME.POS_MEM_X + 1, THEME.POS_MEM_Y + 2, emuState.asic.ram);

    canvaDmdDrawLib.clear(
      (THEME.POS_RAMDIAG_X - 1) * THEME.GRID_STEP_X,
      (THEME.POS_RAMDIAG_Y - 2) * THEME.GRID_STEP_Y,
      THEME.GRID_STEP_X * 50,
      THEME.GRID_STEP_Y * 10
    );
    const memory1k = Array.from(emuState.asic.ram.slice(0, 1024));
    canvaDmdDrawLib.drawDiagramCluster(THEME.POS_RAMDIAG_X + 0.5, THEME.POS_RAMDIAG_Y + 1, memory1k, 24);
  }

  // DMD MEM - draw only 4 dmd video fragment per loop
  if (emuState.asic.dmd.videoRam) {
    videoRam = emuState.asic.dmd.videoRam;
    videoRamDraw = 0;
  }
  if (videoRam) {
    canvaDmdMemDrawLib.drawVideoRam(THEME.POS_DMDMEM_X + 0.5, THEME.POS_DMDMEM_Y + 2.75, frame, videoRam);
    canvaDmdMemDrawLib.drawHorizontalRandomBlip(THEME.POS_DMDMEM_X + 13, THEME.POS_DMDMEM_Y + 11, 2);
    canvaDmdMemDrawLib.drawHorizontalRandomBlip(THEME.POS_DMDMEM_X + 25, THEME.POS_DMDMEM_Y + 11, 1);
    canvaDmdMemDrawLib.drawHorizontalRandomBlip(THEME.POS_DMDMEM_X + 25, THEME.POS_DMDMEM_Y + 1.5, 3);
    canvaDmdMemDrawLib.drawVerticalRandomBlip(THEME.POS_DMDMEM_X + 0.5, THEME.POS_DMDMEM_Y + 16.5, 2, (Date.now() / 0xCAFFE) << 2);
    if (videoRamDraw++ > 4) {
      videoRam = null;
    };
  }

  // SOUND
  canvasOverlayDrawLib.drawRedTriangle(THEME.POS_SND_X + 1, THEME.POS_SND_Y + 2.5, 13, emuState.asic.sound.volume / 31);
  canvasOverlayDrawLib.writeLabel(THEME.POS_SND_X + 8, THEME.POS_SND_Y + 1, audioState);

  canvasOverlayDrawLib.writeHeader(THEME.POS_SND_X + 1, THEME.POS_SND_Y + 6, emuState.asic.sound.readControlBytes);
  canvasOverlayDrawLib.writeHeader(THEME.POS_SND_X + 1, THEME.POS_SND_Y + 7, emuState.asic.sound.writeControlBytes);
  canvasOverlayDrawLib.writeHeader(THEME.POS_SND_X + 8, THEME.POS_SND_Y + 6, emuState.asic.sound.readDataBytes);
  canvasOverlayDrawLib.writeHeader(THEME.POS_SND_X + 8, THEME.POS_SND_Y + 7, emuState.asic.sound.writeDataBytes);

  // DMD STAT
  canvasOverlayDrawLib.drawDiagram(THEME.POS_DMDSTAT_X + 1.5, THEME.POS_DMDSTAT_Y + 4.5, 'DMD_ACTIVE_PAGE', emuState.asic.dmd.activepage);
  canvasOverlayDrawLib.drawDiagram(THEME.POS_DMDSTAT_X + 17, THEME.POS_DMDSTAT_Y + 4.5, 'DMD_SCANLINE', emuState.asic.dmd.scanline);
  canvasOverlayDrawLib.writeHeader(THEME.POS_DMDSTAT_X + 32.5, THEME.POS_DMDSTAT_Y + 4.5, emuState.asic.dmd.dmdPageMapping);

  // MATRIX / INPUT
  if (emuState.asic.wpc.inputState) {
    const inputState = canvasOverlayDrawLib.unpackBits(emuState.asic.wpc.inputState);
    canvaDmdDrawLib.drawMatrix8x8(THEME.POS_MATRIX_X + 1, THEME.POS_MATRIX_Y + 2, inputState);

    canvaDmdDrawLib.clear(
      (THEME.POS_PLAYFIELD_X - 1) * THEME.GRID_STEP_X,
      (THEME.POS_PLAYFIELD_Y + 44) * THEME.GRID_STEP_Y,
      THEME.GRID_STEP_X * 18,
      THEME.GRID_STEP_Y * 4
    );
    canvaDmdDrawLib.drawHorizontalByteDiagram(THEME.POS_PLAYFIELD_X + 0.25, THEME.POS_PLAYFIELD_Y + 47, inputState.slice(0, 64));
  }
  canvasOverlayDrawLib.drawVerticalRandomBlip(THEME.POS_MATRIX_X + 0.5, THEME.POS_MATRIX_Y + 9, 5, emuState.cpuState.irqCount << 4);

  // LAMP
  if (emuState.asic.wpc.lampState) {
    canvaDmdDrawLib.drawMatrix8x8(THEME.POS_MATRIX_X + 1, THEME.POS_MATRIX_Y + 13, emuState.asic.wpc.lampState);
    drawLampPositions(emuState.asic.wpc.lampState);

    canvaDmdDrawLib.clear(
      (THEME.POS_PLAYFIELD_X - 1) * THEME.GRID_STEP_X,
      (THEME.POS_PLAYFIELD_Y + 36) * THEME.GRID_STEP_Y,
      THEME.GRID_STEP_X * 18,
      THEME.GRID_STEP_Y * 4
    );
    canvaDmdDrawLib.drawHorizontalByteDiagram(THEME.POS_PLAYFIELD_X + 0.25, THEME.POS_PLAYFIELD_Y + 39, emuState.asic.wpc.lampState);
  }

  // SOLENOID
  if (emuState.asic.wpc.solenoidState) {
    canvaDmdDrawLib.drawMatrix8x8(THEME.POS_MATRIX_X + 8, THEME.POS_MATRIX_Y + 2, emuState.asic.wpc.solenoidState);
    drawFlashlamps(emuState.asic.wpc.solenoidState);

    canvaDmdDrawLib.clear(
      (THEME.POS_PLAYFIELD_X - 1) * THEME.GRID_STEP_X,
      (THEME.POS_PLAYFIELD_Y + 40) * THEME.GRID_STEP_Y,
      THEME.GRID_STEP_X * 18,
      THEME.GRID_STEP_Y * 4
    );
    canvaDmdDrawLib.drawHorizontalByteDiagram(THEME.POS_PLAYFIELD_X + 0.25, THEME.POS_PLAYFIELD_Y + 43, emuState.asic.wpc.solenoidState);
  }

  // GI
  canvaDmdDrawLib.drawMatrix8x8(THEME.POS_MATRIX_X + 8, THEME.POS_MATRIX_Y + 8.75, emuState.asic.wpc.generalIlluminationState);

  canvasOverlayDrawLib.drawDiagram(THEME.POS_MATRIX_X + 8, THEME.POS_MATRIX_Y + 15.5, 'lampRom', emuState.asic.wpc.lampRow, 26);
  canvasOverlayDrawLib.drawDiagram(THEME.POS_MATRIX_X + 8, THEME.POS_MATRIX_Y + 18.5, 'lampColumn', emuState.asic.wpc.lampColumn, 26);
}

function createCanvas() {
  const canvasElement = document.createElement('canvas');
  canvasElement.width = CANVAS_WIDTH;
  canvasElement.height = CANVAS_HEIGHT;
  return canvasElement;
}

function initiateCanvasElements() {
  if (initialized) {
    console.log('ALREADY_INITIALIZED!');
    return;
  }
  initialized = true;
  console.log('initialise');

  const canvasRootElement = createCanvas();
  canvas = canvasRootElement.getContext('2d', { alpha: false });

  /*canvas = canvasRootElement.getContext('2d', { alpha: true });
  canvas.fillStyle = '#000000';
  canvas.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.shadowBlur = 2;
  canvas.shadowColor = THEME.COLOR_BLUE;*/
  replaceNode('canvasNode', canvasRootElement);

  const canvasOverlayElement = createCanvas();
  canvasOverlay = canvasOverlayElement.getContext('2d', { alpha: true });
  //canvasOverlay.shadowBlur = 2;
  //canvasOverlay.shadowColor = THEME.COLOR_BLUE;
  replaceNode('canvasOverlayNode', canvasOverlayElement);

  const canvasDmdElement = createCanvas();
  canvasDmd = canvasDmdElement.getContext('2d', { alpha: true });
  replaceNode('canvasDmdNode', canvasDmdElement);

  const canvasDmdMemElement = createCanvas();
  canvasDmdMem = canvasDmdMemElement.getContext('2d', { alpha: true });
  replaceNode('canvasDmdMemNode', canvasDmdMemElement);

  const canvasMemElement = createCanvas();
  canvasMem = canvasMemElement.getContext('2d', { alpha: true });
  replaceNode('canvasMemNode', canvasMemElement);

  canvasDrawLib = createDrawLib(canvas, THEME);
  canvasOverlayDrawLib = createDrawLib(canvasOverlay, THEME);
  canvaDmdDrawLib = createDrawLib(canvasDmd, THEME);
  canvaMemDrawLib = createDrawLib(canvasMem, THEME);
  canvaDmdMemDrawLib = createDrawLib(canvasDmdMem, THEME);
}

function initialise() {
  initiateCanvasElements();

  canvasDrawLib.clear();
  canvasOverlayDrawLib.clear();
  canvaDmdDrawLib.clear();
  canvaMemDrawLib.clear();
  canvaDmdMemDrawLib.clear();

  canvasDrawLib.drawBackgroundPoints();

  // LOGO
  canvasDrawLib.drawWpcLogo(2.25, 2.75);
  canvasDrawLib.writeRibbonHeader(8.5, 4, 'WPC-EMU');
  canvasDrawLib.drawHorizontalLine(1, 1, 5, THEME.COLOR_BLUE_INTENSE);
  canvasDrawLib.drawHorizontalLine(1, 6, 5, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.drawVerticalLine(1, 1, 1, THEME.COLOR_BLUE_INTENSE);
  canvasDrawLib.drawVerticalLine(6, 1, 1, THEME.COLOR_BLUE_INTENSE);
  canvasDrawLib.drawVerticalLine(1, 5, 1, THEME.COLOR_BLUE_INTENSE);
  canvasDrawLib.drawVerticalLine(6, 5, 1, THEME.COLOR_BLUE_INTENSE);

  // DRAW TOP LINES
  canvasDrawLib.drawHorizontalLine(1, 1, 15);
  canvasDrawLib.drawHorizontalLine(THEME.POS_DMD_X - 1, 1, 66);
  canvasDrawLib.drawHorizontalLine(THEME.POS_DMD_X - 1, THEME.POS_DMD_Y - 2, 66);
  canvasDrawLib.drawHorizontalLine(THEME.POS_DMD_X + 59, THEME.POS_DMD_Y - 2, 6, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.drawVerticalLine(THEME.POS_DMD_X - 1, 1, 1, THEME.COLOR_BLUE_INTENSE);
  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X - 1, 1, 18);
  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X - 1, 6, 18);
  canvasDrawLib.drawVerticalLine(THEME.POS_PLAYFIELD_X - 1, 5, 1, THEME.COLOR_BLUE_INTENSE);

  // DRAW BOTTOM LINES
  const BOTTOM_Y = 62;
  canvasDrawLib.drawHorizontalLine(1, BOTTOM_Y, 15);
  canvasDrawLib.drawHorizontalLine(1, BOTTOM_Y + 0.5, 15);

  canvasDrawLib.drawHorizontalLine(THEME.POS_DMD_X - 1, BOTTOM_Y, 66);
  canvasDrawLib.drawHorizontalLine(THEME.POS_DMD_X - 1, BOTTOM_Y + 0.5, 66);

  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X - 1, BOTTOM_Y, 18);
  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X - 1, BOTTOM_Y + 0.5, 18);
  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X + 8, BOTTOM_Y, 9, THEME.COLOR_BLUE_INTENSE);
  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X + 8, BOTTOM_Y + 0.5, 9, THEME.COLOR_BLUE_INTENSE);

  // HEADER
  canvasDrawLib.drawHorizontalLine(THEME.POS_HEADER_X, THEME.POS_HEADER_Y, 15);
  canvasDrawLib.writeRibbonHeader(THEME.POS_HEADER_X + 1, THEME.POS_HEADER_Y + 2, 'FILE');
  canvasDrawLib.drawHorizontalLine(THEME.POS_HEADER_X, THEME.POS_HEADER_Y + 3, 15);
  canvasDrawLib.drawHorizontalLine(THEME.POS_HEADER_X + 5, THEME.POS_HEADER_Y + 3, 10, THEME.COLOR_BLUE_INTENSE);

  // CPU
  canvasDrawLib.drawVerticalLine(THEME.POS_CPU_X,      THEME.POS_CPU_Y, 23);
  canvasDrawLib.drawVerticalLine(THEME.POS_CPU_X + 15, THEME.POS_CPU_Y, 23);

  canvasDrawLib.writeRibbonHeader(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 1, 'CPU', THEME.FONT_TEXT);
  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 3, THEME.POS_CPU_Y + 1, 'TICKS');
  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 8.5, THEME.POS_CPU_Y + 1, 'IRQ ENABLED');

  canvasDrawLib.drawHorizontalLine(THEME.POS_CPU_X, THEME.POS_CPU_Y + 3, 15);
  canvasDrawLib.drawHorizontalLine(THEME.POS_CPU_X, THEME.POS_CPU_Y + 3, 8, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.drawHorizontalLine(THEME.POS_CPU_X, THEME.POS_CPU_Y + 6, 15);
  canvasDrawLib.drawHorizontalLine(THEME.POS_CPU_X + 8, THEME.POS_CPU_Y + 6, 7, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 4, 'OPS/MS');
  canvasDrawLib.drawVerticalLine(THEME.POS_CPU_X + 8, THEME.POS_CPU_Y + 3, 3);
  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 9, THEME.POS_CPU_Y + 4, 'STATUS');

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 7, 'IRQ/MISSED');
  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 9, THEME.POS_CPU_Y + 7, 'FIRQ/MISSED');

  // REG CC
  canvasDrawLib.drawHorizontalLine(THEME.POS_CPU_X, THEME.POS_CPU_Y + 9.5, 15);
  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 14, 'CONDITION CODE REGISTER');
  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 1, THEME.POS_CPU_Y + 10.5, 'PROGRAM COUNTER');
  canvasDrawLib.drawHorizontalLine(THEME.POS_CPU_X, THEME.POS_CPU_Y + 13, 15);

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 9, THEME.POS_CPU_Y + 20, 'ZERO');
  canvasDrawLib.drawSimpleVerticalLine(THEME.POS_CPU_X + 6.75, THEME.POS_CPU_Y + 19, 0.75);
  canvasDrawLib.drawSimpleHorizontalLine(THEME.POS_CPU_X + 6.75, THEME.POS_CPU_Y + 19.75, 1.5);

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 7, THEME.POS_CPU_Y + 21, 'IRQ');
  canvasDrawLib.drawSimpleVerticalLine(THEME.POS_CPU_X + 4.75, THEME.POS_CPU_Y + 19, 1.75);
  canvasDrawLib.drawSimpleHorizontalLine(THEME.POS_CPU_X + 4.75, THEME.POS_CPU_Y + 20.75, 1.5);

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 5, THEME.POS_CPU_Y + 22, 'FIRQ');
  canvasDrawLib.drawSimpleVerticalLine(THEME.POS_CPU_X + 2.75, THEME.POS_CPU_Y + 19, 2.75);
  canvasDrawLib.drawSimpleHorizontalLine(THEME.POS_CPU_X + 2.75, THEME.POS_CPU_Y + 21.75, 1.5);

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 11.5, THEME.POS_CPU_Y + 18.625, 'CARRY');
  canvasDrawLib.drawSimpleHorizontalLine(THEME.POS_CPU_X + 9.5, THEME.POS_CPU_Y + 18.375, 1.5);

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 7.5, THEME.POS_CPU_Y + 17.25, 'NEGATIVE');
  canvasDrawLib.drawSimpleVerticalLine(THEME.POS_CPU_X + 5.625, THEME.POS_CPU_Y + 17, 0.75);
  canvasDrawLib.drawSimpleHorizontalLine(THEME.POS_CPU_X + 5.625, THEME.POS_CPU_Y + 17, 1.5);

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 5.5, THEME.POS_CPU_Y + 16.25, 'HALF CARRY');
  canvasDrawLib.drawSimpleVerticalLine(THEME.POS_CPU_X + 3.625, THEME.POS_CPU_Y + 16, 1.75);
  canvasDrawLib.drawSimpleHorizontalLine(THEME.POS_CPU_X + 3.625, THEME.POS_CPU_Y + 16, 1.5);

  canvasDrawLib.writeLabel(THEME.POS_CPU_X + 3.5, THEME.POS_CPU_Y + 15.25, 'ENTIRE');
  canvasDrawLib.drawSimpleVerticalLine(THEME.POS_CPU_X + 1.625, THEME.POS_CPU_Y + 15, 2.75);
  canvasDrawLib.drawSimpleHorizontalLine(THEME.POS_CPU_X + 1.625, THEME.POS_CPU_Y + 15, 1.5);

  // ASIC
  canvasDrawLib.drawVerticalLine(THEME.POS_ASIC_X,      THEME.POS_ASIC_Y, 10);
  canvasDrawLib.drawVerticalLine(THEME.POS_ASIC_X + 15, THEME.POS_ASIC_Y, 10);
  canvasDrawLib.writeLabel(THEME.POS_ASIC_X + 1, THEME.POS_ASIC_Y + 1, 'WATCHDOG');
  canvasDrawLib.writeRibbonHeader(THEME.POS_ASIC_X + 7, THEME.POS_ASIC_Y + 1, 'EXPIRED', THEME.FONT_TEXT);
  canvasDrawLib.drawHorizontalLine(THEME.POS_ASIC_X, THEME.POS_ASIC_Y + 4, 15);
  canvasDrawLib.drawHorizontalLine(THEME.POS_ASIC_X + 7, THEME.POS_ASIC_Y + 4, 8, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.writeLabel(THEME.POS_ASIC_X + 1, THEME.POS_ASIC_Y + 5, 'D19');
  canvasDrawLib.writeLabel(THEME.POS_ASIC_X + 3, THEME.POS_ASIC_Y + 5, 'D21');
  canvasDrawLib.writeLabel(THEME.POS_ASIC_X + 5, THEME.POS_ASIC_Y + 5, 'D20');
  canvasDrawLib.writeRibbonHeader(THEME.POS_ASIC_X + 8, THEME.POS_ASIC_Y + 5, 'TGLE CNT', THEME.FONT_TEXT);
  canvasDrawLib.drawHorizontalLine(THEME.POS_ASIC_X, THEME.POS_ASIC_Y + 7, 15);
  canvasDrawLib.drawHorizontalLine(THEME.POS_ASIC_X, THEME.POS_ASIC_Y + 7, 7, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.writeLabel(THEME.POS_ASIC_X + 1, THEME.POS_ASIC_Y + 8, 'ROM BANK');
  canvasDrawLib.writeLabel(THEME.POS_ASIC_X + 8, THEME.POS_ASIC_Y + 8, 'LOCKED MEM W');
  canvasDrawLib.drawVerticalLine(THEME.POS_ASIC_X + 7, THEME.POS_ASIC_Y + 7, 3);

  // DMD MEM
  canvasDrawLib.drawVerticalLine(THEME.POS_DMDMEM_X,      THEME.POS_DMDMEM_Y, 20);
  canvasDrawLib.drawVerticalLine(THEME.POS_DMDMEM_X + 12, THEME.POS_DMDMEM_Y + 1.5, 18.5);
  canvasDrawLib.drawVerticalLine(THEME.POS_DMDMEM_X + 24, THEME.POS_DMDMEM_Y + 1.5, 18.5);
  canvasDrawLib.drawVerticalLine(THEME.POS_DMDMEM_X + 36, THEME.POS_DMDMEM_Y + 1.5, 18.5);
  canvasDrawLib.drawVerticalLine(THEME.POS_DMDMEM_X + 48, THEME.POS_DMDMEM_Y, 20);
  canvasDrawLib.writeRibbonHeader(THEME.POS_DMDMEM_X + 1, THEME.POS_DMDMEM_Y + 1, 'DMD', THEME.FONT_TEXT);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 3.5, THEME.POS_DMDMEM_Y + 1, 'VIDEO RANDOM ACCESS MEMORY');
  canvasDrawLib.drawHorizontalLine(THEME.POS_DMDMEM_X, THEME.POS_DMDMEM_Y + 6, 48);
  canvasDrawLib.drawHorizontalLine(THEME.POS_DMDMEM_X, THEME.POS_DMDMEM_Y + 10.5, 48);
  canvasDrawLib.drawHorizontalLine(THEME.POS_DMDMEM_X, THEME.POS_DMDMEM_Y + 15, 48);

  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 10, THEME.POS_DMDMEM_Y + 2.5, '#00', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 10, THEME.POS_DMDMEM_Y + 7, '#04', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 10, THEME.POS_DMDMEM_Y + 11.5, '#08', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 10, THEME.POS_DMDMEM_Y + 16, '#12', THEME.COLOR_YELLOW);
  canvasDrawLib.drawVerticalLine(THEME.POS_DMDMEM_X, THEME.POS_DMDMEM_Y + 6, 4.5, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 22, THEME.POS_DMDMEM_Y + 2.5, '#01', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 22, THEME.POS_DMDMEM_Y + 7, '#05', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 22, THEME.POS_DMDMEM_Y + 11.5, '#09', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 22, THEME.POS_DMDMEM_Y + 16, '#13', THEME.COLOR_YELLOW);

  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 34, THEME.POS_DMDMEM_Y + 2.5, '#02', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 34, THEME.POS_DMDMEM_Y + 7, '#06', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 34, THEME.POS_DMDMEM_Y + 11.5, '#10', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 34, THEME.POS_DMDMEM_Y + 16, '#14', THEME.COLOR_YELLOW);

  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 46, THEME.POS_DMDMEM_Y + 2.5, '#03', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 46, THEME.POS_DMDMEM_Y + 7, '#07', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 46, THEME.POS_DMDMEM_Y + 11.5, '#11', THEME.COLOR_YELLOW);
  canvasDrawLib.writeLabel(THEME.POS_DMDMEM_X + 46, THEME.POS_DMDMEM_Y + 16, '#15', THEME.COLOR_YELLOW);
  canvasDrawLib.drawVerticalLine(THEME.POS_DMDMEM_X + 48, THEME.POS_DMDMEM_Y + 10.5, 4.5, THEME.COLOR_BLUE_INTENSE);

  // MEM
  canvasDrawLib.drawVerticalLine(THEME.POS_MEM_X,      THEME.POS_MEM_Y, 7);
  canvasDrawLib.drawVerticalLine(THEME.POS_MEM_X + 15, THEME.POS_MEM_Y, 7);
  canvasDrawLib.writeLabel(THEME.POS_MEM_X + 1, THEME.POS_MEM_Y + 1, 'ASIC RANDOM ACCESS MEMORY');

  // DMD SHADED
  canvasDrawLib.drawRect(THEME.POS_DMD_X - 0.2, THEME.POS_DMD_Y - 0.2, 65 - 0.6, 17 - 0.6, THEME.DMD_COLOR_DARK);
  canvasDrawLib.drawRect(THEME.POS_DMD_X - 1, THEME.POS_DMD_Y - 1, 66, 18, THEME.TEXT_COLOR_HEADER);

  canvasDrawLib.writeLabel(THEME.POS_DMD_X + 60, THEME.POS_DMD_Y - 2.5, 'LIVE', THEME.TEXT_COLOR_HEADER);
  canvasDrawLib.writeLabel(THEME.POS_DMD_X + 62, THEME.POS_DMD_Y - 2.5, 'FEED');

  canvasDrawLib.fillRect(THEME.POS_DMD_X + 48.5,     THEME.POS_DMD_Y + 17.5, 0.8, 0.5, THEME.DMD_COLOR_DARK);
  canvasDrawLib.fillRect(THEME.POS_DMD_X + 49.5, THEME.POS_DMD_Y + 17.5, 0.8, 0.5, THEME.DMD_COLOR_MIDDLE);
  canvasDrawLib.fillRect(THEME.POS_DMD_X + 50.5, THEME.POS_DMD_Y + 17.5, 0.8, 0.5, THEME.DMD_COLOR_HIGH);
  canvasDrawLib.writeLabel(THEME.POS_DMD_X + 51.5, THEME.POS_DMD_Y + 18, 'DOT MATRIX DISPLAY PALETTE');
  canvasDrawLib.writeLabel(THEME.POS_DMD_X + 0.25, THEME.POS_DMD_Y + 18, 'FAST INTERRUPT REQUEST');
  canvasDrawLib.writeLabel(THEME.POS_DMD_X + 25.25, THEME.POS_DMD_Y + 18, 'AC ZERO CROSS DETECTED');

  // SND
  canvasDrawLib.drawVerticalLine(THEME.POS_SND_X,      THEME.POS_SND_Y, 8);
  canvasDrawLib.drawVerticalLine(THEME.POS_SND_X + 15, THEME.POS_SND_Y, 8);
  canvasDrawLib.writeLabel(THEME.POS_SND_X + 1, THEME.POS_SND_Y + 1, 'AUDIO');

  canvasDrawLib.writeRibbonHeader(THEME.POS_SND_X + 4.5, THEME.POS_SND_Y + 1, 'STATE', THEME.FONT_TEXT);
  canvasDrawLib.drawHorizontalScale(THEME.POS_SND_X + 1, THEME.POS_SND_Y + 2.5, 10, 3);
  canvasDrawLib.drawHorizontalLine(THEME.POS_SND_X, THEME.POS_SND_Y + 4, 15);

  canvasDrawLib.writeLabel(THEME.POS_SND_X + 1, THEME.POS_SND_Y + 5, 'CTRL R/W');
  canvasDrawLib.writeLabel(THEME.POS_SND_X + 8, THEME.POS_SND_Y + 5, 'DATA R/W');

  // PLAYFIELD
  canvasDrawLib.drawVerticalLine(THEME.POS_PLAYFIELD_X - 1,  THEME.POS_PLAYFIELD_Y, 48);
  canvasDrawLib.drawVerticalLine(THEME.POS_PLAYFIELD_X + 17, THEME.POS_PLAYFIELD_Y, 48);
  canvasDrawLib.writeRibbonHeader(THEME.POS_PLAYFIELD_X + 0.5, THEME.POS_PLAYFIELD_Y + 1, 'PLAYFIELD', THEME.FONT_TEXT);
  canvasDrawLib.writeLabel(THEME.POS_PLAYFIELD_X + 6, THEME.POS_PLAYFIELD_Y + 1, 'VISUALIZATION');

  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X - 1, THEME.POS_PLAYFIELD_Y + 36, 18);
  canvasDrawLib.writeLabel(THEME.POS_PLAYFIELD_X, THEME.POS_PLAYFIELD_Y + 37.25, 'LAMP');
  canvasDrawLib.writeRibbonHeader(THEME.POS_PLAYFIELD_X + 2.75, THEME.POS_PLAYFIELD_Y + 37.25, 'ENERGY', THEME.FONT_TEXT);
  canvasDrawLib.writeLabel(THEME.POS_PLAYFIELD_X + 6.5, THEME.POS_PLAYFIELD_Y + 37.25, 'USAGE');

  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X - 1, THEME.POS_PLAYFIELD_Y + 40, 18);
  canvasDrawLib.writeLabel(THEME.POS_PLAYFIELD_X, THEME.POS_PLAYFIELD_Y + 41.25, 'SOLENOID ENERGY USAGE');
  canvasDrawLib.drawVerticalLine(THEME.POS_PLAYFIELD_X - 1, THEME.POS_PLAYFIELD_Y + 40, 4, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.drawHorizontalLine(THEME.POS_PLAYFIELD_X - 1, THEME.POS_PLAYFIELD_Y + 44, 18);
  canvasDrawLib.writeLabel(THEME.POS_PLAYFIELD_X, THEME.POS_PLAYFIELD_Y + 45.25, 'INPUT FEEDBACK');

  // DMD STAT
  canvasDrawLib.writeRibbonHeader(THEME.POS_DMDSTAT_X + 1.5, THEME.POS_DMDSTAT_Y + 3, 'DMD', THEME.FONT_TEXT);
  canvasDrawLib.writeLabel(THEME.POS_DMDSTAT_X + 4, THEME.POS_DMDSTAT_Y + 3, 'ACTIVE PAGE');
  canvasDrawLib.writeLabel(THEME.POS_DMDSTAT_X + 17, THEME.POS_DMDSTAT_Y + 3, 'DMD SCANLINE');
  canvasDrawLib.writeLabel(THEME.POS_DMDSTAT_X + 32.5, THEME.POS_DMDSTAT_Y + 3, 'DMD PAGE MAP');

  // MATRIX
  canvasDrawLib.drawVerticalLine(THEME.POS_MATRIX_X,  THEME.POS_MATRIX_Y, 21);
  canvasDrawLib.drawVerticalLine(THEME.POS_MATRIX_X + 15, THEME.POS_MATRIX_Y, 21);
  canvasDrawLib.writeLabel(THEME.POS_MATRIX_X + 1, THEME.POS_MATRIX_Y + 1, 'MATRIX');
  canvasDrawLib.writeRibbonHeader(THEME.POS_MATRIX_X + 5, THEME.POS_MATRIX_Y + 1, 'I/O STATUS', THEME.FONT_TEXT);

  canvasDrawLib.writeLabel(THEME.POS_MATRIX_X + 1, THEME.POS_MATRIX_Y + 10.25, 'INPUT');
  canvasDrawLib.writeLabel(THEME.POS_MATRIX_X + 8, THEME.POS_MATRIX_Y + 7.25, 'SOLENOID');
  canvasDrawLib.writeLabel(THEME.POS_MATRIX_X + 8, THEME.POS_MATRIX_Y + 10.25, 'GI');

  canvasDrawLib.drawHorizontalLine(THEME.POS_MATRIX_X, THEME.POS_MATRIX_Y + 12, 15);
  canvasDrawLib.drawHorizontalLine(THEME.POS_MATRIX_X, THEME.POS_MATRIX_Y + 12, 7.25, THEME.COLOR_BLUE_INTENSE);

  canvasDrawLib.writeLabel(THEME.POS_MATRIX_X + 1, THEME.POS_MATRIX_Y + 20, 'LAMP');
  canvasDrawLib.writeLabel(THEME.POS_MATRIX_X + 8, THEME.POS_MATRIX_Y + 14, 'LAMP ROW');
  canvasDrawLib.writeLabel(THEME.POS_MATRIX_X + 8, THEME.POS_MATRIX_Y + 17, 'LAMP COLUMN');

  // RAMDIAG
  canvasDrawLib.drawVerticalLine(THEME.POS_RAMDIAG_X - 1,  THEME.POS_RAMDIAG_Y - 2, 8);
  canvasDrawLib.drawVerticalLine(THEME.POS_RAMDIAG_X + 47, THEME.POS_RAMDIAG_Y - 2, 8);
  canvasDrawLib.writeRibbonHeader(THEME.POS_RAMDIAG_X, THEME.POS_RAMDIAG_Y - 1, 'RANDOM ACCESS MEMORY', THEME.FONT_TEXT);
  canvasDrawLib.writeLabel(THEME.POS_RAMDIAG_X + 11.5, THEME.POS_RAMDIAG_Y - 1, 'REAL TIME ANALYTICS');
}

// PLAYFIELD START

function drawFlashlamps(lampState) {
  //TODO FLICKERS!
  if (!playfieldData || !lampState || !Array.isArray(playfieldData.flashlamps)) {
    return;
  }

  const x = (THEME.POS_PLAYFIELD_X - 0.25) * THEME.GRID_STEP_X;
  const y = (THEME.POS_PLAYFIELD_Y + 1.75) * THEME.GRID_STEP_Y;

  playfieldData.flashlamps.forEach((lamp) => {
    const selectedLamp = lampState[lamp.id - 1];
    if (!selectedLamp) {
      return;
    }
    const alpha = (selectedLamp / 255).toFixed(2);
    canvasOverlayDrawLib.ctx.beginPath();
    canvasOverlayDrawLib.ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    canvasOverlayDrawLib.ctx.arc(x + lamp.x, y + lamp.y, 24, 0, 2 * Math.PI);
    canvasOverlayDrawLib.ctx.fill();
  });
}

function drawLampPositions(lampState) {
  if (!playfieldData || !lampState || !Array.isArray(playfieldData.lamps)) {
    return;
  }

  const x = (THEME.POS_PLAYFIELD_X - 0.25) * THEME.GRID_STEP_X;
  const y = (THEME.POS_PLAYFIELD_Y + 1.75) * THEME.GRID_STEP_Y;

  lampState.forEach((lamp, index) => {
    if (index >= playfieldData.lamps.length) {
      return;
    }
    const lampObjects = playfieldData.lamps[index];
    if (!lampObjects) {
      return;
    }

    const alpha = (lamp / 0xFF).toFixed(2);
    const isOn = lamp > 0;
    lampObjects.forEach((lampObject) => {
      if (isOn) {
        canvasOverlayDrawLib.ctx.fillStyle = lampColorLut.get(lampObject.color) + alpha + ')';
      } else {
        canvasOverlayDrawLib.ctx.fillStyle = 'black';
      }
      canvasOverlayDrawLib.ctx.fillRect(x + lampObject.x - 3, y + lampObject.y - 3, 6, 6);
    });
  });
}

//PLAYFIELD STOP

function populateInitialCanvas(_gameEntry) {
  gameEntry = _gameEntry;
  initialise();

  // preload data
  playfieldData = gameEntry.playfield;
  playfieldImage = null;
  if (playfieldData) {
    playfieldImage = new Image();
    playfieldImage.onload = function () {
      canvasDrawLib.drawImage(THEME.POS_PLAYFIELD_X - 0.25, THEME.POS_PLAYFIELD_Y + 1.75, playfieldImage);
    };
    playfieldImage.src = FETCHURL + playfieldData.image;
  } else {
    canvasDrawLib.fillRect(THEME.POS_PLAYFIELD_X, THEME.POS_PLAYFIELD_Y, 17, 35, THEME.DMD_COLOR_BLACK);
  }
}

function errorFeedback(error) {
  initialise();
  canvasDrawLib.writeText(THEME.POS_DMD_X + 1, THEME.POS_DMD_Y + 2, 'ERROR! Failed to load ROM!', THEME.FONT_HUGE);
  canvasDrawLib.writeText(THEME.POS_DMD_X + 1, THEME.POS_DMD_Y + 4, 'Details: ' + error.message, THEME.FONT_HUGE);
}

function loadFeedback(romName) {
  console.log('loadFeedback',romName)
  initialise();
  canvasDrawLib.writeText(THEME.POS_DMD_X + 1, THEME.POS_DMD_Y + 2, 'Load ROM ' + romName, THEME.FONT_HUGE);
}
