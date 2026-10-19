import { describe, it, expect } from 'vitest';
import { ModbusMaster, ModbusFunctionCode } from '../mbmaster.js';
import { appendCRC16, verifyCRC16 } from '../protocol/crc16.js';
import { MockPort } from '../connection/mockPort.js';
import { ModbusTag } from '../type.js';

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

describe('ModbusMaster instance and queue methods', () => {
    it('should initialize with optional port and empty queue', () => {
        const masterNoPort = new ModbusMaster();
        expect(masterNoPort.port).toBeUndefined();
        expect(masterNoPort.queue).toEqual([]);

        const mockPort = new MockPort();
        const masterWithPort = new ModbusMaster(mockPort);
        expect(masterWithPort.port).toBe(mockPort);
        expect(masterWithPort.queue).toEqual([]);
    });

    describe('setDeviceProperty and getDeviceProperty', () => {
        it('should return default property for unconfigured device', () => {
            const master = new ModbusMaster();
            const prop = master.getDeviceProperty(1);
            expect(prop).toEqual({
                id: 1,
                swapBytes: false,
                swapWords: false,
                delayIfEmptyQueue: 10,
            });
        });

        it('should configure property using string option swapBytes', () => {
            const master = new ModbusMaster();
            const res = master.setDeviceProperty(1, 'swapBytes', 25);
            expect(res.swapBytes).toBe(true);
            expect(res.swapWords).toBe(false);
            expect(res.delayIfEmptyQueue).toBe(25);

            expect(master.getDeviceProperty(1)).toEqual({
                id: 1,
                swapBytes: true,
                swapWords: false,
                delayIfEmptyQueue: 25,
            });
        });

        it('should configure property using string option swapWords', () => {
            const master = new ModbusMaster();
            const res = master.setDeviceProperty(2, 'swapWords', 15);
            expect(res.swapWords).toBe(true);
            expect(res.swapBytes).toBe(false);
            expect(res.delayIfEmptyQueue).toBe(15);
        });

        it('should configure property using options object', () => {
            const master = new ModbusMaster();
            master.setDeviceProperty(3, { swapBytes: true, swapWords: true }, 50);
            expect(master.getDeviceProperty(3)).toEqual({
                id: 3,
                swapBytes: true,
                swapWords: true,
                delayIfEmptyQueue: 50,
            });
        });
    });

    describe('Data parsing and preparation with endianness swapping', () => {
        const master = new ModbusMaster();

        it('should parse and prepare 16-bit integers with swapBytes', () => {
            // Standard: 0x1234
            expect(master.parseReadData([0x1234], 'uint16')).toBe(0x1234);
            // With swapBytes: 0x3412 -> 0x1234
            expect(master.parseReadData([0x3412], 'uint16', { swapBytes: true })).toBe(0x1234);

            expect(master.prepareWriteData(0x1234, 'uint16')).toEqual([0x1234]);
            expect(master.prepareWriteData(0x1234, 'uint16', { swapBytes: true })).toEqual([0x3412]);
        });

        it('should parse and prepare 32-bit integers with swapWords and swapBytes', () => {
            // 0x12345678 -> Standard Modbus: [0x1234, 0x5678]
            expect(master.parseReadData([0x1234, 0x5678], 'uint32')).toBe(0x12345678);

            // With swapWords: [0x5678, 0x1234] -> 0x12345678
            expect(master.parseReadData([0x5678, 0x1234], 'uint32', { swapWords: true })).toBe(0x12345678);

            // With swapBytes: [0x3412, 0x7856] -> 0x12345678
            expect(master.parseReadData([0x3412, 0x7856], 'uint32', { swapBytes: true })).toBe(0x12345678);

            // With both: [0x7856, 0x3412] -> 0x12345678
            expect(master.parseReadData([0x7856, 0x3412], 'uint32', { swapWords: true, swapBytes: true })).toBe(0x12345678);

            // Write preparation
            expect(master.prepareWriteData(0x12345678, 'uint32')).toEqual([0x1234, 0x5678]);
            expect(master.prepareWriteData(0x12345678, 'uint32', { swapWords: true })).toEqual([0x5678, 0x1234]);
            expect(master.prepareWriteData(0x12345678, 'uint32', { swapBytes: true })).toEqual([0x3412, 0x7856]);
            expect(master.prepareWriteData(0x12345678, 'uint32', { swapWords: true, swapBytes: true })).toEqual([0x7856, 0x3412]);
        });

        it('should parse and prepare float32', () => {
            // Write 123.456 to registers
            const regs = master.prepareWriteData(123.456, 'float32');
            expect(regs).toHaveLength(2);

            const parsed = master.parseReadData(regs, 'float32');
            expect(parsed).toBeCloseTo(123.456, 4);

            // With swapWords
            const swappedRegs = master.prepareWriteData(123.456, 'float32', { swapWords: true });
            expect(swappedRegs[0]).toBe(regs[1]);
            expect(swappedRegs[1]).toBe(regs[0]);
            expect(master.parseReadData(swappedRegs, 'float32', { swapWords: true })).toBeCloseTo(123.456, 4);
        });

        it('should parse and prepare char strings', () => {
            const regs = master.prepareWriteData('ABCD', 'char[4]');
            expect(regs).toHaveLength(2);
            // 'A' = 0x41, 'B' = 0x42 -> 0x4142
            expect(regs[0]).toBe(0x4142);
            // 'C' = 0x43, 'D' = 0x44 -> 0x4344
            expect(regs[1]).toBe(0x4344);

            const str = master.parseReadData(regs, 'char[4]');
            expect(str).toBe('ABCD');
        });

        it('should parse and prepare sized arrays', () => {
            const values = [100, 200, 300];
            const regs = master.prepareWriteData(values, 'uint16[3]');
            expect(regs).toEqual([100, 200, 300]);

            const parsed = master.parseReadData(regs, 'uint16[3]');
            expect(parsed).toEqual([100, 200, 300]);
        });
    });

    describe('addRequest and queue processing', () => {
        it('should deduplicate simultaneous pending read requests', async () => {
            const mockPort = new MockPort();
            const master = new ModbusMaster(mockPort);

            const tag: ModbusTag = {
                id: 1,
                register: 'holding',
                address: 10,
                type: 'uint16',
            };

            // Call addRequest twice for the same tag without port open
            const promise1 = master.addRequest('read', tag);
            const promise2 = master.addRequest('read', tag);

            // Only 1 item should be in queue because the second was deduplicated
            expect(master.queue).toHaveLength(1);

            // Open port and setup response
            await mockPort.open({ baudRate: 9600 });

            mockPort.onWrite = () => {
                // Return Slave 1, FC 3, byte count 2, value 777 (0x0309)
                const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x02, 0x03, 0x09]));
                mockPort.emitData(resp);
            };

            // Trigger queue processing
            master.processQueue();

            const [val1, val2] = await Promise.all([promise1, promise2]);
            expect(val1).toBe(777);
            expect(val2).toBe(777);
            expect(tag.value).toBe(777);
            expect(tag.timestamp).toBeInstanceOf(Date);

            await mockPort.close();
        });

        it('should execute end-to-end read and write requests through MockPort', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            // Configure device 1 with swapWords
            master.setDeviceProperty(1, 'swapWords', 5);

            // 1. READ uint32
            const readTag: ModbusTag = {
                id: 1,
                register: 'holding',
                address: 0,
                type: 'uint32',
            };

            mockPort.onWrite = (requestChunk) => {
                const fc = requestChunk[1];
                if (fc === 0x03) {
                    // Read response: 0x12345678 with swapWords is [0x5678, 0x1234]
                    const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x04, 0x56, 0x78, 0x12, 0x34]));
                    mockPort.emitData(resp);
                } else if (fc === 0x10) {
                    // Write response echo
                    const resp = appendCRC16(new Uint8Array([0x01, 0x10, 0x00, 0x00, 0x00, 0x02]));
                    mockPort.emitData(resp);
                }
            };

            const readValue = await master.read(readTag);
            expect(readValue).toBe(0x12345678);
            expect(readTag.value).toBe(0x12345678);

            // 2. WRITE uint32
            const writeTag: ModbusTag = {
                id: 1,
                register: 'holding',
                address: 0,
                type: 'uint32',
                value: 0x12345678,
            };

            const writeResult = await master.write(writeTag);
            expect(writeResult).toBeDefined();

            await mockPort.close();
        });

        it('should execute coil read and write requests', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            mockPort.onWrite = (requestChunk) => {
                const fc = requestChunk[1];
                if (fc === 0x01) {
                    // Read coils response: coil 0 = true
                    const resp = appendCRC16(new Uint8Array([0x01, 0x01, 0x01, 0x01]));
                    mockPort.emitData(resp);
                } else if (fc === 0x0F) {
                    // Write coils response
                    const resp = appendCRC16(new Uint8Array([0x01, 0x0F, 0x00, 0x00, 0x00, 0x01]));
                    mockPort.emitData(resp);
                }
            };

            const coilTag: ModbusTag = {
                id: 1,
                register: 'coil',
                address: 0,
                type: 'bool',
            };

            const coilVal = await master.read(coilTag);
            expect(coilVal).toBe(true);

            const writeVal = await master.write(coilTag, false);
            expect(writeVal).toBeDefined();

            await mockPort.close();
        });

        it('should handle Modbus exception response', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            mockPort.onWrite = () => {
                // Exception response: Slave 1, FC 0x83 (Error on 0x03), Exception Code 0x02 (Illegal Data Address)
                const exceptionResp = appendCRC16(new Uint8Array([0x01, 0x83, 0x02]));
                mockPort.emitData(exceptionResp);
            };

            const tag: ModbusTag = {
                id: 1,
                register: 'holding',
                address: 9999,
                type: 'uint16',
            };

            await expect(master.read(tag)).rejects.toThrow("Modbus exception response: code 2");

            await mockPort.close();
        });
    });
});