import { describe, it, expect } from 'vitest';
import { ModbusMaster, ModbusFunctionCode } from '../mbmaster.js';

describe('Modbus requests test', () => {

    it('should correctly generate read HR request', () => {
        // Standard Modbus Request: Slave 1, Read Holding Registers (0x03), from address 0 to 2.
        const expectedRequest = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xC4, 0x0B]);
        const request = ModbusMaster.buildReadRequest(1, 'holding', 0, 2);
        expect(request).toEqual(expectedRequest);
    });

    it('should correctly generate write HR request', () => {
        // Standard Modbus Request: Slave 1, Write Holding Registers (0x03), from address 0, values [123, 456]
        const expectedRequest = new Uint8Array([0x01, 0x10, 0x00, 0x00, 0x00, 0x02, 0x04, 0x00, 0x7B, 0x01, 0xc8, 0X83, 0Xb0]);
        const dataToWrite = new Uint16Array([123, 456]);
        const request = ModbusMaster.buildWriteRegisterRequest(1, 0, dataToWrite);
        expect(request).toEqual(expectedRequest);
    });

    it('should correctly generate write COILS request', () => {
        // Standard Modbus Request: Slave 1, Write Coils (0x03), from address 0, values [1, 0,0,0,0,0,0,0,0]
        const expectedRequest = new Uint8Array([0x01, 0x0F, 0x00, 0x00, 0x00, 0x09, 0x02, 0x01, 0x00, 0xE4, 0xEC]);
        const dataToWrite : boolean[] = [true, false, false, false, false, false, false, false, false];
        const request = ModbusMaster.buildWriteCoilsRequest(1, 0, dataToWrite);
        expect(request).toEqual(expectedRequest);
    });
});