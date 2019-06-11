'use strict';

import '../node_modules/milligram/dist/milligram.css';
import '../styles/client.css';

import { downloadFileFromUrlAsUInt8Array } from './lib/fetcher';
import { initialiseActions } from './lib/initialise';
import { loadRam, saveRam, } from './lib/ramState';
import { initialise as initDmdExport, save as saveFile } from './lib/pin2DmdExport';
import { AudioOutput } from './lib/sound';
import * as gamelist from './db/gamelist';
import { populateControlUiView, updateUiSwitchState } from './ui/control-ui';
import * as emuDebugUi from './ui/oblivion-ui';

// start the emu as web worker TODO rename me
const Webclient = require('../../lib/webclient');
let webclient;

const MAXIMAL_DMD_FRAMES_TO_RIP = 8000;
const INITIAL_GAME = 'WPC-DMD: Hurricane';

let soundInstance = AudioOutput();
let dmdDump;
let intervalId;

function initialiseEmu(gameEntry) {
  window.wpcInterface = {
    romSelection,
  };

  return document.fonts.load('24pt "Space Mono"')
    .catch((error) => {
      console.error('FONT_LOAD_FAILED', error);
    })
    .then(() => {
      emuDebugUi.initialise();
      emuDebugUi.loadFeedback(gameEntry.name);
      return downloadFileFromUrlAsUInt8Array(gameEntry.rom.u06);
    })
    .then((u06Rom) => {
      console.log('Successfully loaded ROM', u06Rom.length);
      const romData = {
        u06: u06Rom,
      };
      return webclient.initialiseEmulator(romData, gameEntry);
    })
    .then(() => {
      console.log('Successfully initialized emulator');
      return webclient.getVersion();
    })
    .then((emuVersion) => {
      const selectElementRoot = document.getElementById('wpc-release-info');
      selectElementRoot.innerHTML = 'WPC-Emu v' + emuVersion;
      soundInstance = AudioOutput(gameEntry.audio);
      //NOTE: IIKS we pollute globals here
      window.wpcInterface = {
        webclient,
        resetEmu,
        pauseEmu,
        resumeEmu,
        romSelection,
        saveState,
        loadState,
        toggleDmdDump
      };

//      wpcSystem.registerAudioConsumer((message) => soundInstance.callback(message));
      return emuDebugUi.populateInitialCanvas(gameEntry);
    })
    .then(() => {
      soundInstance.playBootSound();
    });

}

function saveState() {
  return pauseEmu()
    .then(() => {
      return Promise.all([ webclient.getEmulatorRomName(),  webclient.getEmulatorState() ]);
    })
    .then((data) => {
      const romName = data[0];
      const emuState = data[1];
      saveRam(romName, emuState);
      return resumeEmu();
    });
}

function loadState() {
  return pauseEmu()
    .then(() => { return webclient.getEmulatorRomName(); })
    .then((romName) => {
      const emuState = loadRam(romName);
      return webclient.setEmulatorState(emuState);
    })
    .then(() => { return resumeEmu(); });
}

function toggleDmdDump() {
  const element = document.getElementById('dmd-dump-text');
  if (dmdDump) {
    saveFile(dmdDump.buildExportFile(), 'wpc-emu-dump.raw');
    element.textContent = 'DMD DUMP';
    element.classList.remove('blinkText');
    dmdDump = null;
  } else {
    dmdDump = initDmdExport();
    element.classList.add('blinkText');
  }
}

function romSelection(romName) {
  pauseEmu();
  initEmuWithGameName(romName);
}

function initEmuWithGameName(name) {
  soundInstance.stop();
  const gameEntry = gamelist.getByName(name);
  populateControlUiView(gameEntry, gamelist, name);
  return initialiseEmu(gameEntry)
    .then(resumeEmu)
    .then(() => initialiseActions(gameEntry.initialise, webclient))
    .catch((error) => {
      console.error('FAILED to load ROM:', error.message);
      emuDebugUi.errorFeedback(error);
    });
}

//called at 60hz -> 16.6ms
function step() {
  //TODO handle promise properly here:
  /*
    function requestAnimationFramePromise() {
      return new Promise(resolve => requestAnimationFrame(resolve));
    }
  */
  webclient.getNextFrame()
    .then((emuUiState) => {
      const { emuState } = emuUiState;
      if (!emuState) {
        webclient.executeCycles();
        return;
      }
      emuDebugUi.updateCanvas(emuState, intervalId ? 'running' : 'paused');//, cpuRunningState, audioState);
      emuDebugUi.drawMetaData(webclient.getAverageRttTimeMs(), webclient.getMessagesSend());
      if (emuState.asic.wpc.inputState) {
        updateUiSwitchState(emuState.asic.wpc.inputState);
      }

      if (dmdDump) {
        dmdDump.addFrames(emuState.asic.dmd.videoOutputBuffer, emuState.cpuState.tickCount);

        const capturedFrames = dmdDump.getCapturedFrames();
        if (capturedFrames > MAXIMAL_DMD_FRAMES_TO_RIP) {
          const filename = 'wpc-emu-dump-' + Date.now() + '.raw';
          saveFile(dmdDump.buildExportFile(), filename);
          dmdDump = initDmdExport();
        }

        const element = document.getElementById('dmd-dump-text');
        element.textContent = 'DUMPING: ' + dmdDump.getCapturedFrames();
      }

      // signal to worker that next emu cycles should be calculated, but run it async
      webclient.executeCycles();
    }).catch(() => {
      // next frame was not ready, request update
      webclient.executeCycles();
    })

/*   const audioState = soundInstance.getState();
*/

  intervalId = requestAnimationFrame(step);
}

function resumeEmu() {
  intervalId = requestAnimationFrame(step);
}

function pauseEmu() {
  cancelAnimationFrame(intervalId);
  intervalId = false;
}

function resetEmu() {
  return webclient.resetEmulator();
  //soundInstance.playBootSound();
}

function registerKeyboardListener() {
  console.log(
    '## KEYBOARD MAPPING:\n' +
    '  "1": Coin#1\n' +
    '  "2": Coin#2\n' +
    '  "3": Coin#3\n' +
    '  "4": Coin#4\n' +
    '  "5": Start\n' +
    '  "P": pause\n' +
    '  "R": resume\n' +
    '  "S": save\n' +
    '  "L": load\n' +
    '  "7": Escape\n' +
    '  "8": -\n' +
    '  "9": +\n' +
    '  "0": Enter'
  );

  window.addEventListener('keydown', (e) => {
    switch (e.keyCode) {
      case 49: //1
        return webclient.setCabinetInput(1);

      case 50: //2
        return webclient.setCabinetInput(2);

      case 51: //3
        return webclient.setCabinetInput(4);

      case 52: //4
        return webclient.setCabinetInput(8);

      case 53: //5
        return webclient.setInput(13);

      case 80: //P
        return pauseEmu();

      case 82: //R
        return resumeEmu();

      case 83: //S
        return saveState();

      case 76: //L
        return loadState();

      case 55: //7
        return webclient.setCabinetInput(16);

      case 56: //8
        return webclient.setCabinetInput(32);

      case 57: //9
        return webclient.setCabinetInput(64);

      case 48: //0
        return webclient.setCabinetInput(128);

      default:

    }
  }, false);

}

if ('serviceWorker' in navigator) {
  // Use the window load event to keep the page load performant
  // NOTE: works only via SSL!
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then((registration) => {
        console.log('SW registered:', registration);
      }).catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}

webclient = Webclient.initialiseWebworkerAPI();

initEmuWithGameName(INITIAL_GAME)
  .catch((error) => console.error);

registerKeyboardListener();
