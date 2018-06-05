'use strict';
/*jshint bitwise: false*/

const debug = require('debug')('wpcemu:boards:sound-board');
const Cpu6809 = require('./up/cpu6809');
const YM2151 = require('./up/ym2151');
const soundMapper = require('./mapper/sound.js');

const OP = {
  WPC_PARALLEL_STROBE_PORT: 0x3FC2,
  WPC_TICKET_DISPENSE: 0x3FC6,
  WPC_SOUND_CONTROL_STATUS: 0x3FDD,
  WPC_SOUND_DATA: 0x3FDC,
};
const REVERSEOP = [];
Object.keys(OP).forEach((key) => {
  REVERSEOP[OP[key]] = key;
});

const YM2151_CLOCK_HZ = 3579545;
const YM2151_SAMPLERATE = 11000;
// If no data is ready, returns 0xFF.
const NO_SOUND_DATA_READY = 0xFF;

/*
  sound data 0x79: soundboard ready?

  when changing sound track in test menu
    write sound data 125 (0x7d)
    write sound data 127 (0x7f)
    write sound data 126 (0x7e)
    write sound data 125 (0x7d)
    write sound data 127 (0x7f)

  when booting a rom, those commands are sent
    write sound data 0
    write sound data 121
    write sound data 12
    write sound data 243
    write sound data 84
    write sound data 84
    write sound data 84
    write sound data 84
    write sound data 84

TODO what should i do with this.soundData???
*/

const MEMORY_SIZE = 0x2000;

// source: http://www.cx5m.net/fmunit.htm
const YM2151_REGISTER = [];
YM2151_REGISTER[0x01] = 'TEST & LFO RESET';
YM2151_REGISTER[0x08] = 'KEY ON';
YM2151_REGISTER[0x0F] = 'NOISE ENABLE, NOISE FREQUENCY';
YM2151_REGISTER[0x11] = 'CLOCK A1';
YM2151_REGISTER[0x12] = 'CLOCK A2';
YM2151_REGISTER[0x13] = 'CLOCK B';
YM2151_REGISTER[0x14] = 'CLOCK FUNCTIONS';
YM2151_REGISTER[0x18] = 'LOW FREQUENCY';
YM2151_REGISTER[0x19] = 'PHASE AND AMPLITUDE MODULATION';
YM2151_REGISTER[0x1B] = 'CONTROL OUTPUT & WAVE FORM SELECT';
YM2151_REGISTER[0x20] = 'CHANNEL CONTROL';
/*
REGISTER #28-2F (KEY CODE)
REGISTER #30-37 (KEY FRACTION)
REGISTER #38-3F (PHASE & AMPLITUDE MODULATION SENSITIVITY)
REGISTER #40-5F (DETUNE & PHASE MULTIPLY)
REGISTER #60-7F (TOTAL LEVEL)
REGISTER #80-9F (EG ATTACK)
REGISTER #A0-BF (EG DECAY 1)
REGISTER #C0-DF (EG DECAY 2)
REGISTER #E0-FF (EG DECAY LEVEL, RELEASE RATE)
*/

// should be called 2400 times per second
// each 0.42ms, 0.42ms * 2000 ticks per ms = 833
const CALL_YM2151_FIRQ_HACK_AFTER_TICKS = 833;

module.exports = {
  getInstance,
};

function getInstance(romObject) {
  return new SoundBoard(romObject);
}

class SoundBoard {

  constructor(initObject) {
    this.interruptCallback = initObject.interruptCallback;
    this.ram = new Uint8Array(MEMORY_SIZE).fill(0);

    const readMemory = this._cpuRead8.bind(this);
    const writeMemory = this._cpuWrite8.bind(this);
    this.cpu = Cpu6809.getInstance(writeMemory, readMemory);

    this.ym2151 = YM2151.create(YM2151_CLOCK_HZ, YM2151_SAMPLERATE);
    this.ym2151.TimerA = () => {
      //console.log('TIMER A STRIKE');
    };
    this.ym2151.Intr = () => {
      //console.log('IRQ HANDLER!');
      //this.cpu.firq();
/*
static void wpcs_ym2151IRQ(int state) {
  cpu_set_irq_line(locals.brdData.cpuNo, M6809_FIRQ_LINE, state ? ASSERT_LINE : CLEAR_LINE);
}
*/
    };

    this.volume = 0;
    this.ym2151Register0 = 0;
    this.soundData = NO_SOUND_DATA_READY;
    this.firqHackTicks = 0;

    this.romBankOffset = 0;
    this.systemROM = initObject.romObject.soundSystemRom;
    this.concatinatedSoundRom = initObject.romObject.concatinatedSoundRom;

    this.dacCallback = () => {};
  }

  getUiState() {
    const cpuStatus = this.cpu.status();
    const state = {
      ram: this.ram,
      ticks: this.cpu.tickCount,
      missedIrqCall: cpuStatus.missedIRQ,
      missedFirqCall: cpuStatus.missedFIRQ,
      irqCount: cpuStatus.irqCount,
      firqCount: cpuStatus.firqCount,
    };
    return state;
  }

  executeCycle(ticksToRun = 500, tickSteps = 4) {
    let ticksExecuted = 0;
    while (ticksExecuted < ticksToRun) {
      const singleTicks = this.cpu.steps(tickSteps);

      const ymCycles = parseInt(singleTicks * 1.7897725, 10);
      this.ym2151.GetNextEvent();
      this.ym2151.Count(ymCycles);

//      console.log('this.ym2151.GetNextEvent()',this.ym2151.GetNextEvent());
  //    console.log('this.ym2151.Count(1024)',this.ym2151.Count(ymCycles));

      ticksExecuted += singleTicks;
      this.firqHackTicks += singleTicks;
      if (this.firqHackTicks >= CALL_YM2151_FIRQ_HACK_AFTER_TICKS) {
        this.firqHackTicks -= CALL_YM2151_FIRQ_HACK_AFTER_TICKS;
        //TODO only set firq when ym5121 does not output sound
        this.cpu.firq();
      }
    }

/*    console.log('timera',this.ym2151.timera);
    console.log('timera_count',this.ym2151.timera_count);
    console.log('timerb',this.ym2151.timerb);
    console.log('timerb_count',this.ym2151.timerb_count);

const a = this.ym2151.GetNextEvent();
console.log('aa',this.ym2151.Count());
*/
    return ticksExecuted;
  }

  _getBankRomOffset(value) {
    const bankBase = value & 0x0F;
    switch ((~value) & 0xE0) {
      case 0x80: /* U18 */
        return bankBase | 0x00;
      case 0x40: /* U15 */
        return bankBase | 0x10;
      case 0x20: /* U14 */
        return bankBase | 0x20;
      default:
        throw new Error('INVALID_BANK_VALUE!');
    }
  }

  _hardwareWrite(offset, value) {
    switch (offset) {
      case soundMapper.ADDRESS_WPC_ROMBANK_W:
        this.romBankOffset = this._getBankRomOffset(value) << 15;
        debug('WRITE ADDRESS_WPC_ROMBANK_W', value, this.romBankOffset);
        break;

      case soundMapper.ADDRESS_YM2151_REGISTER:
        this.ym2151Register0 = value;
        debug('W SELECT_YM2151_REGISTER', value, YM2151_REGISTER[value]);
        break;

      case soundMapper.ADDRESS_YM2151_DATA:
        this.ym2151.SetReg(this.ym2151Register0, value);
        debug('WRITE ADDRESS_YM2151_DATA', this.ym2151Register0, value);
        //console.log('WRITE ADDRESS_YM2151_DATA', this.ym2151Register0, value);
        break;

      case soundMapper.ADDRESS_DAC_WRITE:
        //TODO convert
        const analogValue = value / 255;

//        console.log('WRITE ADDRESS_DAC_WRITE', analogValue);
        this.dacCallback(analogValue);
        //debug('WRITE ADDRESS_DAC_WRITE', value);
        break;

      case soundMapper.ADDRESS_HC55516_CLOCK_SET_WRITE:
        debug('WRITE ADDRESS_HC55516_CLOCK_SET_WRITE', value);
        break;

      case soundMapper.ADDRESS_HC55516_DIGIT_CLOCK_CLEAR_WRITE:
        debug('WRITE ADDRESS_HC55516_DIGIT_CLOCK_CLEAR_WRITE', value);
        break;

      case soundMapper.ADDRESS_WPC_VOLUME_WRITE:
        //this.ym2151.SetVolume();
        if (value & 0x01) {
          if ((this.volume > 0) && (value & 0x02)) {
            this.volume -= 1;
          } else if ((this.volume < 0xFF) && ((value & 0x02) === 0)) {
            this.volume += 1;
          }

          /*          {
            int ch;
            for (ch = 0; ch < MIXER_MAX_CHANNELS; ch++) {
              if (mixer_get_name(ch) != NULL)
                mixer_set_volume(ch, locals.volume * 100 / 127);
            }
          }*/
        }
        debug('WRITE ADDRESS_WPC_VOLUME_WRITE %o', { value, volume: this.volume });
        break;

      case soundMapper.ADDRESS_WPC_LATCH_WRITE:
        debug('WRITE ADDRESS_WPC_LATCH_WRITE', value);
        this.soundData = value;
        //console.log('latch_irq', value);
        this.cpu.irq();
        //fire FIRQ line on CPU Board, ACK
        this.interruptCallback.firq();
        break;

      default:
        console.log('INVALID_HW_WRITE_0x', '0x' + offset.toString(16), value);
        debug('INVALID_HW_WRITE', '0x' + offset.toString(16), value);
        break;
    }
  }

  _cpuWrite8(offset, value) {
    if (isNaN(offset)) {
      throw new TypeError('SOUND_MEMORY_WRITE_BUG_DETECTED!');
    }
    if (value === undefined) {
      debug('MEMORY WRITE VALUE BUG DETECTED!');
      return;
    }

    value &= 0xFF;
    const address = soundMapper.getAddress(offset);
    //debug('write to adr %o', { address, offset: offset.toString(16), value });
    switch (address.subsystem) {

      case soundMapper.SUBSYSTEM_RAM:
        //debug('WRITE RAM', value, address.offset);
        this.ram[address.offset] = value;
        break;

      case soundMapper.SUBSYSTEM_HARDWARE:
        this._hardwareWrite(address.offset, value);
        break;

      case soundMapper.SUBSYSTEM_BANKSWITCHED:
        console.log('SUBSYSTEM_BANKSWITCHED__SND_INVALID_WRITE_SUBSYSTEM_0x', offset.toString(16), value);
        break;

      case soundMapper.SUBSYSTEM_ROM:
        //console.log('SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM', '0x' + offset.toString(16), value);
        // TODO this is clearly wrong, but i try to find out what this data is
        //this.dacCallback(value / 256);

        /*
          sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb56 81
          23:04:24.318 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb57 188
          23:04:24.319 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb54 81
          23:04:24.320 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb55 188
          23:04:24.320 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb52 81
          23:04:24.321 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb53 188
          23:04:24.322 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb52 90
          23:04:24.322 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb53 220
          23:04:24.323 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb50 81
          23:04:24.324 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb51 188
          23:04:24.324 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb50 89
          23:04:24.325 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb51 225
          23:04:24.331 sound-board.js:391 SND READ WPC_SOUND_DATA
          23:04:24.332 sound-board.js:278 ADDRESS_WPC_LATCH_READ 0
          23:04:24.333 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb4c 81
          23:04:24.334 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb4d 203
          23:04:24.334 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb4c 85
          23:04:24.335 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb4d 45
                       sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb56 81
          23:04:24.318 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb57 188
          23:04:24.319 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb54 81
          23:04:24.320 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb55 188
          23:04:24.320 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb52 81
          23:04:24.321 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb53 188
          23:04:24.322 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb52 90
          23:04:24.322 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb53 220
          23:04:24.323 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb50 81
          23:04:24.324 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb51 188
          23:04:24.324 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb50 89
          23:04:24.325 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb51 225
          23:04:24.331 sound-board.js:391 SND READ WPC_SOUND_DATA
          23:04:24.332 sound-board.js:278 ADDRESS_WPC_LATCH_READ 0
          23:04:24.333 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb4c 81
          23:04:24.334 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb4d 203
          23:04:24.334 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb4c 85
          23:04:24.335 sound-board.js:254 SUBSYSTEM_ROM__SND_INVALID_WRITE_SUBSYSTEM_0x fb4d 45
        */
        break;

      default:
        throw new Error('SND_INVALID_WRITE_SUBSYSTEM_0x' + address.offset.toString(16));
    }
  }

  _hardwareRead(offset) {
    switch (offset) {
      case soundMapper.ADDRESS_YM2151_DATA:
        debug('READ ADDRESS_YM2151_DATA', this.ym2151.status);
        // bit 0: timer a, bit 1: timer b, bit 7 busy
        // after writing to the register, the cpu is busy for some time - a read must return 0 before
        // next write can happen
        return this.ym2151.status;

      case soundMapper.ADDRESS_YM2151_REGISTER:
        return 0xff;//this.ym2151Register0;

      case soundMapper.ADDRESS_WPC_LATCH_READ:
        debug('READ ADDRESS_WPC_LATCH_READ', this.soundData);
        console.log('ADDRESS_WPC_LATCH_READ', this.soundData);
        this.cpu.clearIrqMasking();
        //const value = this.soundData;
        //this.soundData = NO_SOUND_DATA_READY;
        //return value;
        return this.soundData;

      default:
        debug('INVALID_HW_READ', '0x' + offset.toString(16));
        console.log('INVALID_HW_READ', '0x' + offset.toString(16));
        break;
    }
  }

  _cpuRead8(offset) {
    if (isNaN(offset)) {
      throw new TypeError('SOUND_MEMORY_READ_BUG_DETECTED!');
    }

    const address = soundMapper.getAddress(offset);
    //debug('read from adr %o', { address, offset: offset.toString(16) });
    switch (address.subsystem) {

      case soundMapper.SUBSYSTEM_RAM:
        //debug('READ RAM', address.offset);
        return this.ram[address.offset];

      case soundMapper.SUBSYSTEM_HARDWARE:
        return this._hardwareRead(address.offset);

      case soundMapper.SUBSYSTEM_BANKSWITCHED:
        //debug('READ BANKSWITCHED', address.offset.toString(16));
        return this.concatinatedSoundRom[address.offset];

      case soundMapper.SUBSYSTEM_ROM:
        //debug('READ ROM', address.offset);
        return this.systemROM[address.offset];

      default:
        throw new Error('SND_INVALID_READ_SUBSYSTEM');
    }
  }

  start() {
    debug('start');
    this.reset();
  }

  reset() {
    this.ym2151.Reset();
    this.cpu.reset();
    this.cpu.steps(2000000);
    this.cpu.irq();
  }

  registerDacCallback(dacCallback) {
    this.dacCallback = dacCallback;
  }

  // Interface from CPU board
  writeInterface(offset, value) {
    this.ram[offset] = value;

    switch (offset) {
      case OP.WPC_PARALLEL_STROBE_PORT:
      case OP.WPC_TICKET_DISPENSE:
        debug('IGNORED', REVERSEOP[offset], value);
        break;

      case OP.WPC_SOUND_CONTROL_STATUS:
        debug('WRITE_SND', REVERSEOP[offset], value);
        console.log('RESET_SOUND_CPU');
        this.reset();
        //sndbrd_0_ctrl_w(0,data);
        /*
        cpunum_set_reset_line(locals.brdData.cpuNo, PULSE_LINE);
        */
        break;

      case OP.WPC_SOUND_DATA:
        debug('WRITE_SND', REVERSEOP[offset], value);
        console.log('write sound data', value);
        this._hardwareWrite(soundMapper.ADDRESS_WPC_LATCH_WRITE, value);
        //TODO not sure here!
        //this._hardwareWrite(soundMapper.ADDRESS_WPC_LATCH_WRITE, value);
        //this.cpu.reset();
        // sndbrd_0_data_w(0,data);
        /*
        soundlatch_w(0, data);
        cpu_set_irq_line(locals.brdData.cpuNo, M6809_IRQ_LINE, ASSERT_LINE);
        */
        break;

      default:
        debug('W_NOT_IMPLEMENTED', '0x' + offset.toString(16), value);
        console.log('W_NOT_IMPLEMENTED', '0x' + offset.toString(16), value);
        break;
    }
  }

  readInterface(offset) {
    switch (offset) {
      case OP.WPC_SOUND_CONTROL_STATUS:
        //console.log('SND READ', REVERSEOP[offset]);
        // TODO return sndbrd_0_ctrl_r(0);
        // -> return sndbrd_ctrl_r(0);
        /*
        static READ_HANDLER(wpcs_ctrl_r) {
          return locals.replyAvail;
        }
        */
        return 0xff;//this._hardwareRead(soundMapper.ADDRESS_YM2151_REGISTER);

      case OP.WPC_SOUND_DATA:
        debug('READ', REVERSEOP[offset]);
        console.log('SND READ', REVERSEOP[offset], this.soundData);
        // TODO sndbrd_0_data_r(0);
        // -> return sndbrd_data_r(0);
        /*
        locals.replyAvail = FALSE;
        return soundlatch2_r(0);
        */
        return this._hardwareRead(soundMapper.ADDRESS_WPC_LATCH_READ);

      default:
        console.log('R_NOT_IMPLEMENTED', '0x' + offset.toString(16), this.ram[offset]);
        debug('R_NOT_IMPLEMENTED', '0x' + offset.toString(16), this.ram[offset]);
        return this.ram[offset];
    }
  }
}

/*

18:28:10.430 browser.js:133 wpcemu:boards:externalIO W_NOT_IMPLEMENTED +15s 0x3fdf 144
18:28:10.431 browser.js:133 wpcemu:boards:externalIO W_NOT_IMPLEMENTED +0ms 0x3fde 0
18:28:10.431 browser.js:133 wpcemu:boards:externalIO W_NOT_IMPLEMENTED +1ms 0x3fdc 1
18:28:10.432 browser.js:133 wpcemu:boards:externalIO W_NOT_IMPLEMENTED +0ms 0x3fdb 249

$2000-$37FF	Expansion (maybe security chip of WPC-S and WPC-95)
$3FC0-$3FDF	    External I/O control
                Address	  Format	 Description
                $3FC0     Byte     WPC_PARALLEL_STATUS_PORT
                $3FC1     Byte     WPC_PARALLEL_DATA_PORT
                $3FC2     Byte     WPC_PARALLEL_STROBE_PORT
                $3FC3     Byte     WPC_SERIAL_DATA_OUTPUT
                $3FC4     Byte     WPC_SERIAL_CONTROL_OUTPUT
                $3FC5     Byte     WPC_SERIAL_BAUD_SELECT
                $3FC6     Byte     WPC_TICKET_DISPENSE, Ticket dispenser board
                $3FD1     Byte     sound? only for GEN_WPCALPHA_1?
                $3FD4     Byte     WPC_FLIPTRONIC_PORT_A
                $3FD6     Byte     WPC_FLIPTRONIC_PORT_B (Ununsed)
                $3FDC     Byte     WPCS_DATA (7-0: R/W: Send/receive a byte of data to/from the sound board)
                                   WPC_SOUNDIF
                $3FDD     Byte     WPCS_CONTROL_STATUS aka WPC_SOUNDBACK
                                    7: R: WPC sound board read ready
                                    0: R: DCS sound board read ready
                                    or RW: R: Sound data availble, W: Reset soundboard ?

*/