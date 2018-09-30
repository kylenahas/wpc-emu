'use strict';

import test from 'ava';
import SecurityPic from '../../../../lib/boards/elements/security-pic';

const MACHINE_SERIAL = 530;

test.beforeEach((t) => {
  t.context = SecurityPic.getInstance(MACHINE_SERIAL);
});

test('SecurityPic, foo', (t) => {
  const inputSwitchMatrix = t.context;
  const expectedSerial = [ 5, 3, 0, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 0, 0, 0 ];
  const expectedPicSerial = [ 58, 40, 0, 1, 110, 0, 126, 0, 37, 208, 0, 45, 150, 0, 100, 178 ];
  t.deepEqual(inputSwitchMatrix.serialNumber, new Uint8Array(expectedSerial));
  t.deepEqual(inputSwitchMatrix.picSerialNumber, new Uint8Array(expectedPicSerial));
});
