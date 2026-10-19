import { describe, it, expect } from 'vitest';
import { ModbusMaster, ModbusFunctionCode } from '../mbmaster.js';
import { verifyCRC16 } from '../protocol/crc16.js';

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

    it('should correctly generate read Coils request', () => {
        // Standard Modbus Request: Slave 1, Read Coils (0x01), address 19 (0x0013), quantity 19 (0x0013)
        const expectedRequest = new Uint8Array([0x01, 0x01, 0x00, 0x13, 0x00, 0x13, 0x8C, 0x02]);
        const request = ModbusMaster.buildReadRequest(1, 'coil', 19, 19);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });

    it('should correctly generate read Discrete Inputs request', () => {
        // Standard Modbus Request: Slave 1, Read Discrete Inputs (0x02), address 196 (0x00C4), quantity 22 (0x0016)
        const expectedRequest = new Uint8Array([0x01, 0x02, 0x00, 0xC4, 0x00, 0x16, 0xB8, 0x39]);
        const request = ModbusMaster.buildReadRequest(1, 'discrete', 196, 22);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });

    it('should correctly generate read Input Registers request', () => {
        // Standard Modbus Request: Slave 1, Read Input Registers (0x04), address 8 (0x0008), quantity 1 (0x0001)
        const expectedRequest = new Uint8Array([0x01, 0x04, 0x00, 0x08, 0x00, 0x01, 0xB0, 0x08]);
        const request = ModbusMaster.buildReadRequest(1, 'input', 8, 1);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });

    it('should throw RangeError when read length is less than 1', () => {
        expect(() => ModbusMaster.buildReadRequest(1, 'holding', 0, 0))
            .toThrow("Modbus request length must be greater than 0.");
        expect(() => ModbusMaster.buildReadRequest(1, 'coil', 0, -1))
            .toThrow("Modbus request length must be greater than 0.");
    });

    it('should throw RangeError when register read length exceeds 125', () => {
        expect(() => ModbusMaster.buildReadRequest(1, 'holding', 0, 126))
            .toThrow("Maximum length exceeded for type 'holding'. Maximum allowed: 125.");
        expect(() => ModbusMaster.buildReadRequest(1, 'input', 0, 126))
            .toThrow("Maximum length exceeded for type 'input'. Maximum allowed: 125.");
    });

    it('should throw RangeError when coil or discrete read length exceeds 2000', () => {
        expect(() => ModbusMaster.buildReadRequest(1, 'coil', 0, 2001))
            .toThrow("Maximum length exceeded for type 'coil'. Maximum allowed: 2000.");
        expect(() => ModbusMaster.buildReadRequest(1, 'discrete', 0, 2001))
            .toThrow("Maximum length exceeded for type 'discrete'. Maximum allowed: 2000.");
    });

    it('should correctly generate read requests at maximum allowed boundaries', () => {
        const holdingMax = ModbusMaster.buildReadRequest(1, 'holding', 0, 125);
        expect(holdingMax.length).toBe(8);
        expect(holdingMax[4]).toBe(0x00);
        expect(holdingMax[5]).toBe(0x7D); // 125 in hex
        expect(verifyCRC16(holdingMax)).toBe(true);

        const coilMax = ModbusMaster.buildReadRequest(1, 'coil', 0, 2000);
        expect(coilMax.length).toBe(8);
        expect(coilMax[4]).toBe(0x07);
        expect(coilMax[5]).toBe(0xD0); // 2000 in hex
        expect(verifyCRC16(coilMax)).toBe(true);
    });

    it('should correctly generate write single register request', () => {
        // Slave 2, Write Multiple Registers (0x10), start address 1, value 0x1234
        const expectedRequest = new Uint8Array([0x02, 0x10, 0x00, 0x01, 0x00, 0x01, 0x02, 0x12, 0x34, 0xBE, 0x06]);
        const dataToWrite = new Uint16Array([0x1234]);
        const request = ModbusMaster.buildWriteRegisterRequest(2, 1, dataToWrite);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });

    it('should correctly generate write single coil request (true)', () => {
        const expectedRequest = new Uint8Array([0x01, 0x0F, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0xEF, 0x57]);
        const request = ModbusMaster.buildWriteCoilsRequest(1, 0, [true]);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });

    it('should correctly generate write single coil request (false)', () => {
        const expectedRequest = new Uint8Array([0x01, 0x0F, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x2E, 0x97]);
        const request = ModbusMaster.buildWriteCoilsRequest(1, 0, [false]);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });

    it('should correctly generate write 8 coils request (exact 1-byte boundary)', () => {
        const expectedRequest = new Uint8Array([0x01, 0x0F, 0x00, 0x00, 0x00, 0x08, 0x01, 0x85, 0x3F, 0x36]);
        const dataToWrite = [true, false, true, false, false, false, false, true];
        const request = ModbusMaster.buildWriteCoilsRequest(1, 0, dataToWrite);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });

    it('should correctly generate write 10 coils request matching Modbus standard specification', () => {
        // Standard Modbus specification example: Slave 1, address 0x0013, 10 coils with byte values CD 01
        // CD = 0b11001101 (bits 0,2,3,6,7), 01 = 0b00000001 (bit 8)
        const expectedRequest = new Uint8Array([0x01, 0x0F, 0x00, 0x13, 0x00, 0x0A, 0x02, 0xCD, 0x01, 0x72, 0xCB]);
        const dataToWrite = [true, false, true, true, false, false, true, true, true, false];
        const request = ModbusMaster.buildWriteCoilsRequest(1, 0x0013, dataToWrite);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });

    it('should correctly generate write 16 coils request with all true', () => {
        const expectedRequest = new Uint8Array([0x01, 0x0F, 0x00, 0x00, 0x00, 0x10, 0x02, 0xFF, 0xFF, 0xE3, 0x90]);
        const dataToWrite = new Array(16).fill(true);
        const request = ModbusMaster.buildWriteCoilsRequest(1, 0, dataToWrite);
        expect(request).toEqual(expectedRequest);
        expect(verifyCRC16(request)).toBe(true);
    });
});