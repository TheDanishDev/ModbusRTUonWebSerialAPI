import { describe, it, expect } from 'vitest';
import { ModbusClient, ModbusFunctionCode} from '../mbclient.js';

describe('Modbus requests test', () => {

    it('should correctly generate read HR request', () => {
        // Standard Modbus Request: Slave 1, Read Holding Registers (0x03), from address 0 to 2.
        const expectedRequest = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xC4, 0x0B]);
        const request = ModbusClient.buildReadRequest(1, ModbusFunctionCode.ReadHoldingRegisters,0,2);
        expect(request).toEqual(expectedRequest);
    });
});