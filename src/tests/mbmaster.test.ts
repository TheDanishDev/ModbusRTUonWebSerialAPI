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
                mergeRequest: true,
                maxMergeGap: 2,
            });
        });

        it('should configure property using string option swapBytes', () => {
            const master = new ModbusMaster();
            const res = master.setDeviceProperty(1, 'swapBytes', 25);
            expect(res.swapBytes).toBe(true);
            expect(res.swapWords).toBe(false);
            expect(res.mergeRequest).toBe(true);
            expect(res.delayIfEmptyQueue).toBe(25);

            expect(master.getDeviceProperty(1)).toEqual({
                id: 1,
                swapBytes: true,
                swapWords: false,
                delayIfEmptyQueue: 25,
                mergeRequest: true,
                maxMergeGap: 2,
            });
        });

        it('should configure property using string option swapWords', () => {
            const master = new ModbusMaster();
            const res = master.setDeviceProperty(2, 'swapWords', 15);
            expect(res.swapWords).toBe(true);
            expect(res.swapBytes).toBe(false);
            expect(res.mergeRequest).toBe(true);
            expect(res.delayIfEmptyQueue).toBe(15);
        });

        it('should configure property using options object', () => {
            const master = new ModbusMaster();
            master.setDeviceProperty(3, { swapBytes: true, swapWords: true, mergeRequest: false }, 50);
            expect(master.getDeviceProperty(3)).toEqual({
                id: 3,
                swapBytes: true,
                swapWords: true,
                delayIfEmptyQueue: 50,
                mergeRequest: false,
                maxMergeGap: 2,
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

    describe('Request merging and batching (mergeRequest)', () => {
        it('should merge two adjacent read requests for the same device ID into a single Modbus frame', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            const writtenFrames: Uint8Array[] = [];
            mockPort.onWrite = (chunk) => {
                writtenFrames.push(chunk);
                // Expected request: Slave 1, FC 3, start 0, length 2
                // Return registers: [0x000A (10), 0x0014 (20)]
                const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x04, 0x00, 0x0A, 0x00, 0x14]));
                mockPort.emitData(resp);
            };

            const tag1: ModbusTag = { id: 1, register: 'holding', address: 0, type: 'uint16' };
            const tag2: ModbusTag = { id: 1, register: 'holding', address: 1, type: 'uint16' };

            const [val1, val2] = await Promise.all([master.read(tag1), master.read(tag2)]);

            expect(writtenFrames).toHaveLength(1);
            // Verify single merged frame parameters
            const frame = writtenFrames[0];
            expect(frame[0]).toBe(1);    // Slave ID 1
            expect(frame[1]).toBe(3);    // FC 0x03
            expect(frame[2]).toBe(0x00); // Start address high
            expect(frame[3]).toBe(0x00); // Start address low (0)
            expect(frame[4]).toBe(0x00); // Quantity high
            expect(frame[5]).toBe(0x02); // Quantity low (2 registers)

            expect(val1).toBe(10);
            expect(val2).toBe(20);
            expect(tag1.value).toBe(10);
            expect(tag2.value).toBe(20);
            expect(tag1.timestamp).toBeInstanceOf(Date);
            expect(tag2.timestamp).toBeInstanceOf(Date);

            await mockPort.close();
        });

        it('should merge read requests with a gap within maxMergeGap', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            const writtenFrames: Uint8Array[] = [];
            mockPort.onWrite = (chunk) => {
                writtenFrames.push(chunk);
                // Merged span: start address 10, length 3 (covers 10, 11, 12)
                // Values: [100, 999, 200]
                const resp = appendCRC16(new Uint8Array([
                    0x01, 0x03, 0x06,
                    0x00, 0x64, // reg 10 = 100
                    0x03, 0xE7, // reg 11 = 999 (gap register)
                    0x00, 0xC8  // reg 12 = 200
                ]));
                mockPort.emitData(resp);
            };

            const tag1: ModbusTag = { id: 1, register: 'holding', address: 10, type: 'uint16' };
            const tag2: ModbusTag = { id: 1, register: 'holding', address: 12, type: 'uint16' };

            const [v1, v2] = await Promise.all([master.read(tag1), master.read(tag2)]);

            expect(writtenFrames).toHaveLength(1);
            const frame = writtenFrames[0];
            expect(frame[2]).toBe(0x00);
            expect(frame[3]).toBe(0x0A); // Start address 10
            expect(frame[4]).toBe(0x00);
            expect(frame[5]).toBe(0x03); // Quantity 3

            expect(v1).toBe(100);
            expect(v2).toBe(200);

            await mockPort.close();
        });

        it('should NOT merge read requests when gap exceeds maxMergeGap', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            const writtenFrames: Uint8Array[] = [];
            mockPort.onWrite = (chunk) => {
                writtenFrames.push(chunk);
                const addr = (chunk[2] << 8) | chunk[3];
                if (addr === 0) {
                    const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x05]));
                    mockPort.emitData(resp);
                } else if (addr === 10) {
                    const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x32]));
                    mockPort.emitData(resp);
                }
            };

            const tag1: ModbusTag = { id: 1, register: 'holding', address: 0, type: 'uint16' };
            const tag2: ModbusTag = { id: 1, register: 'holding', address: 10, type: 'uint16' }; // gap = 9 > 2

            const [v1, v2] = await Promise.all([master.read(tag1), master.read(tag2)]);

            expect(writtenFrames).toHaveLength(2);
            expect(v1).toBe(5);
            expect(v2).toBe(50);

            await mockPort.close();
        });

        it('should NOT merge read requests for DIFFERENT device IDs', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            const writtenFrames: Uint8Array[] = [];
            mockPort.onWrite = (chunk) => {
                writtenFrames.push(chunk);
                const slaveId = chunk[0];
                if (slaveId === 1) {
                    const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x6F])); // 111
                    mockPort.emitData(resp);
                } else if (slaveId === 2) {
                    const resp = appendCRC16(new Uint8Array([0x02, 0x03, 0x02, 0x00, 0xDE])); // 222
                    mockPort.emitData(resp);
                }
            };

            const tagSlave1: ModbusTag = { id: 1, register: 'holding', address: 0, type: 'uint16' };
            const tagSlave2: ModbusTag = { id: 2, register: 'holding', address: 1, type: 'uint16' };

            const [v1, v2] = await Promise.all([master.read(tagSlave1), master.read(tagSlave2)]);

            expect(writtenFrames).toHaveLength(2);
            expect(writtenFrames[0][0]).toBe(1); // First frame is for slave 1
            expect(writtenFrames[1][0]).toBe(2); // Second frame is for slave 2
            expect(v1).toBe(111);
            expect(v2).toBe(222);

            await mockPort.close();
        });

        it('should NOT merge read requests when mergeRequest is set to false', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            // Explicitly disable mergeRequest for device 1
            master.setDeviceProperty(1, { mergeRequest: false });

            const writtenFrames: Uint8Array[] = [];
            mockPort.onWrite = (chunk) => {
                writtenFrames.push(chunk);
                const addr = (chunk[2] << 8) | chunk[3];
                if (addr === 0) {
                    const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x0A]));
                    mockPort.emitData(resp);
                } else if (addr === 1) {
                    const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x14]));
                    mockPort.emitData(resp);
                }
            };

            const tag1: ModbusTag = { id: 1, register: 'holding', address: 0, type: 'uint16' };
            const tag2: ModbusTag = { id: 1, register: 'holding', address: 1, type: 'uint16' };

            const [v1, v2] = await Promise.all([master.read(tag1), master.read(tag2)]);

            expect(writtenFrames).toHaveLength(2);
            expect(v1).toBe(10);
            expect(v2).toBe(20);

            await mockPort.close();
        });

        it('should merge coil read requests for the same device ID', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            const writtenFrames: Uint8Array[] = [];
            mockPort.onWrite = (chunk) => {
                writtenFrames.push(chunk);
                // FC 1 read coils response: 1 data byte with coils:
                // coil 0: true (bit 0 = 1), coil 1: false (bit 1 = 0), coil 2: true (bit 2 = 1) -> 0b00000101 = 0x05
                const resp = appendCRC16(new Uint8Array([0x01, 0x01, 0x01, 0x05]));
                mockPort.emitData(resp);
            };

            const tag1: ModbusTag = { id: 1, register: 'coil', address: 0, type: 'bool' };
            const tag2: ModbusTag = { id: 1, register: 'coil', address: 1, type: 'bool' };
            const tag3: ModbusTag = { id: 1, register: 'coil', address: 2, type: 'bool' };

            const [b1, b2, b3] = await Promise.all([
                master.read(tag1),
                master.read(tag2),
                master.read(tag3)
            ]);

            expect(writtenFrames).toHaveLength(1);
            expect(writtenFrames[0][1]).toBe(1); // FC 0x01
            expect(writtenFrames[0][5]).toBe(3); // Quantity 3 coils

            expect(b1).toBe(true);
            expect(b2).toBe(false);
            expect(b3).toBe(true);

            await mockPort.close();
        });

        it('should reject all batched tasks if the merged Modbus request fails', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            mockPort.onWrite = () => {
                // Return Modbus Exception Code 2 (Illegal Data Address)
                const exceptionResp = appendCRC16(new Uint8Array([0x01, 0x83, 0x02]));
                mockPort.emitData(exceptionResp);
            };

            const tag1: ModbusTag = { id: 1, register: 'holding', address: 0, type: 'uint16' };
            const tag2: ModbusTag = { id: 1, register: 'holding', address: 1, type: 'uint16' };

            const p1 = master.read(tag1);
            const p2 = master.read(tag2);

            await expect(p1).rejects.toThrow("Modbus exception response: code 2");
            await expect(p2).rejects.toThrow("Modbus exception response: code 2");

            await mockPort.close();
        });

        it('should NOT merge write requests with read requests', async () => {
            const mockPort = new MockPort();
            await mockPort.open({ baudRate: 9600 });
            const master = new ModbusMaster(mockPort);

            const writtenFrames: Uint8Array[] = [];
            mockPort.onWrite = (chunk) => {
                writtenFrames.push(chunk);
                const fc = chunk[1];
                if (fc === 0x03) {
                    const resp = appendCRC16(new Uint8Array([0x01, 0x03, 0x02, 0x00, 0x11]));
                    mockPort.emitData(resp);
                } else if (fc === 0x10) {
                    const resp = appendCRC16(new Uint8Array([0x01, 0x10, 0x00, 0x01, 0x00, 0x01]));
                    mockPort.emitData(resp);
                }
            };

            const readTag: ModbusTag = { id: 1, register: 'holding', address: 0, type: 'uint16' };
            const writeTag: ModbusTag = { id: 1, register: 'holding', address: 1, type: 'uint16', value: 99 };

            const [r, w] = await Promise.all([
                master.read(readTag),
                master.write(writeTag)
            ]);

            expect(writtenFrames).toHaveLength(2);
            expect(r).toBe(0x11);
            expect(w).toBeDefined();

            await mockPort.close();
        });
    });
});