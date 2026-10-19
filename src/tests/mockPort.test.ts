import { describe, it, expect, vi } from 'vitest';
import { MockPort } from '../connection/mockPort.js';
import { MockSerial } from '../connection/mockSerial.js';
import { Port } from '../connection/port.js';
import { ModbusMaster } from '../mbmaster.js';
import { appendCRC16, verifyCRC16 } from '../protocol/crc16.js';

describe('MockPort class', () => {
    it('should be an instance of Port', () => {
        const mockPort = new MockPort();
        expect(mockPort).toBeInstanceOf(Port);
    });

    it('should initialize with correct default state', () => {
        const mockPort = new MockPort({ usbVendorId: 0x1234, usbProductId: 0x5678 });
        expect(mockPort.isOpen).toBe(false);
        expect(mockPort.connected).toBe(false);
        expect(mockPort.readable).toBeNull();
        expect(mockPort.writable).toBeNull();
        expect(mockPort.getInfo()).toEqual({ usbVendorId: 0x1234, usbProductId: 0x5678 });
        expect(mockPort.writtenData).toEqual([]);
        expect(mockPort.getLastWrittenChunk()).toBeUndefined();
    });

    it('should open and initialize readable and writable streams', async () => {
        const mockPort = new MockPort();
        await mockPort.open({ baudRate: 9600 });

        expect(mockPort.isOpen).toBe(true);
        expect(mockPort.connected).toBe(true);
        expect(mockPort.readable).toBeInstanceOf(ReadableStream);
        expect(mockPort.writable).toBeInstanceOf(WritableStream);
        expect(mockPort.options?.baudRate).toBe(9600);

        // Cannot open again
        await expect(mockPort.open({ baudRate: 9600 })).rejects.toThrow();

        await mockPort.close();
        expect(mockPort.isOpen).toBe(false);
        expect(mockPort.connected).toBe(false);
        expect(mockPort.readable).toBeNull();
        expect(mockPort.writable).toBeNull();
    });

    it('should capture written data and trigger onWrite callback', async () => {
        const mockPort = new MockPort();
        await mockPort.open({ baudRate: 9600 });

        const onWriteSpy = vi.fn();
        mockPort.onWrite = onWriteSpy;

        const writer = mockPort.writable!.getWriter();
        const chunk1 = new Uint8Array([1, 2, 3]);
        const chunk2 = new Uint8Array([4, 5, 6]);

        await writer.write(chunk1);
        await writer.write(chunk2);
        writer.releaseLock();

        expect(mockPort.writtenData).toHaveLength(2);
        expect(mockPort.writtenChunks).toHaveLength(2);
        expect(mockPort.writtenData[0]).toEqual(chunk1);
        expect(mockPort.writtenData[1]).toEqual(chunk2);
        expect(mockPort.getLastWrittenChunk()).toEqual(chunk2);
        expect(mockPort.getWrittenData()).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));

        expect(onWriteSpy).toHaveBeenCalledTimes(2);
        expect(onWriteSpy).toHaveBeenNthCalledWith(1, chunk1);
        expect(onWriteSpy).toHaveBeenNthCalledWith(2, chunk2);

        mockPort.clearWrittenData();
        expect(mockPort.writtenData).toHaveLength(0);

        await mockPort.close();
    });

    it('should emit incoming data into readable stream', async () => {
        const mockPort = new MockPort();
        await mockPort.open({ baudRate: 9600 });

        const reader = mockPort.readable!.getReader();

        // Push data as Uint8Array
        mockPort.emitData(new Uint8Array([0xAA, 0xBB]));
        const res1 = await reader.read();
        expect(res1.done).toBe(false);
        expect(res1.value).toEqual(new Uint8Array([0xAA, 0xBB]));

        // Push data as number[]
        mockPort.simulateRead([0xCC, 0xDD]);
        const res2 = await reader.read();
        expect(res2.done).toBe(false);
        expect(res2.value).toEqual(new Uint8Array([0xCC, 0xDD]));

        await reader.cancel();
        reader.releaseLock();
        await mockPort.close();
    });

    it('should throw when emitting data while closed', () => {
        const mockPort = new MockPort();
        expect(() => mockPort.emitData(new Uint8Array([1]))).toThrow();
    });

    it('should prevent closing while stream is locked, but close after release', async () => {
        const mockPort = new MockPort();
        await mockPort.open({ baudRate: 9600 });

        const reader = mockPort.readable!.getReader();
        // Trying to close while reader is locked should fail
        await expect(mockPort.close()).rejects.toThrow();

        // Release the lock
        reader.releaseLock();
        // Now closing should succeed
        await expect(mockPort.close()).resolves.toBeUndefined();
    });

    it('should support simulateReadError()', async () => {
        const mockPort = new MockPort();
        await mockPort.open({ baudRate: 9600 });

        const reader = mockPort.readable!.getReader();
        mockPort.simulateReadError(new Error("Simulated serial read timeout"));

        await expect(reader.read()).rejects.toThrow("Simulated serial read timeout");
        reader.releaseLock();
        await mockPort.close();
    });

    it('should handle signals inspection and modification', async () => {
        const mockPort = new MockPort();
        await mockPort.open({ baudRate: 9600 });

        const initialSignals = await mockPort.getSignals();
        expect(initialSignals.clearToSend).toBe(true);

        mockPort.setMockSignals({ clearToSend: false, ringIndicator: true });
        const updatedSignals = await mockPort.getSignals();
        expect(updatedSignals.clearToSend).toBe(false);
        expect(updatedSignals.ringIndicator).toBe(true);

        await mockPort.setSignals({ dataTerminalReady: true, break: false });
        expect(mockPort.outputSignals.dataTerminalReady).toBe(true);
        expect(mockPort.outputSignals.break).toBe(false);

        await mockPort.close();
    });

    it('should handle connect and disconnect simulation', async () => {
        const mockPort = new MockPort();
        const connectSpy = vi.fn();
        const disconnectSpy = vi.fn();

        mockPort.onconnect = connectSpy;
        mockPort.ondisconnect = disconnectSpy;

        mockPort.simulateConnect();
        expect(connectSpy).toHaveBeenCalledTimes(1);

        await mockPort.open({ baudRate: 9600 });
        expect(mockPort.isOpen).toBe(true);

        mockPort.simulateDisconnect();
        expect(disconnectSpy).toHaveBeenCalledTimes(1);
        expect(mockPort.isOpen).toBe(false);
        expect(mockPort.readable).toBeNull();
    });

    it('should support MockPort.createPair() for bidirectional communication', async () => {
        const [portA, portB] = MockPort.createPair();

        await portA.open({ baudRate: 9600 });
        await portB.open({ baudRate: 9600 });

        const readerA = portA.readable!.getReader();
        const readerB = portB.readable!.getReader();

        const writerA = portA.writable!.getWriter();
        const writerB = portB.writable!.getWriter();

        // Write from A -> B
        await writerA.write(new Uint8Array([0x10, 0x20]));
        const fromAtoB = await readerB.read();
        expect(fromAtoB.value).toEqual(new Uint8Array([0x10, 0x20]));

        // Write from B -> A
        await writerB.write(new Uint8Array([0x30, 0x40]));
        const fromBtoA = await readerA.read();
        expect(fromBtoA.value).toEqual(new Uint8Array([0x30, 0x40]));

        writerA.releaseLock();
        writerB.releaseLock();
        await readerA.cancel();
        readerA.releaseLock();
        await readerB.cancel();
        readerB.releaseLock();

        await portA.close();
        await portB.close();
    });

    it('should support MockPort.createLoopback()', async () => {
        const loopback = MockPort.createLoopback();
        await loopback.open({ baudRate: 115200 });

        const reader = loopback.readable!.getReader();
        const writer = loopback.writable!.getWriter();

        await writer.write(new Uint8Array([1, 2, 3]));
        const echoed = await reader.read();
        expect(echoed.value).toEqual(new Uint8Array([1, 2, 3]));

        writer.releaseLock();
        await reader.cancel();
        reader.releaseLock();
        await loopback.close();
    });

    it('should support MockSerial for managing mock ports and simulating navigator.serial', async () => {
        const port1 = new MockPort({ usbVendorId: 0x1111, usbProductId: 0x2222 });
        const port2 = new MockPort({ usbVendorId: 0x3333, usbProductId: 0x4444 });
        const mockSerial = new MockSerial([port1, port2]);

        const ports = await mockSerial.getPorts();
        expect(ports).toHaveLength(2);
        expect(ports[0]).toBe(port1);

        const requested = await mockSerial.requestPort({
            filters: [{ usbVendorId: 0x3333 }]
        });
        expect(requested).toBe(port2);

        mockSerial.removePort(port1);
        expect(await mockSerial.getPorts()).toHaveLength(1);
    });

    it('should simulate a full Modbus RTU request-response round-trip with MockPort', async () => {
        const mockPort = new MockPort();
        await mockPort.open({ baudRate: 9600 });

        // Build Modbus RTU read request: Slave 1, Holding Registers, address 0, count 2
        const readRequest = ModbusMaster.buildReadRequest(1, 'holding', 0, 2);

        // When request is written to port, mock slave calculates and returns response
        mockPort.onWrite = (requestChunk) => {
            expect(verifyCRC16(requestChunk)).toBe(true);
            expect(requestChunk).toEqual(readRequest);

            // Slave 1, FC 3, 4 bytes of data: register 0 = 0x007B (123), register 1 = 0x01C8 (456)
            const responseData = new Uint8Array([0x01, 0x03, 0x04, 0x00, 0x7B, 0x01, 0xC8]);
            const fullResponse = appendCRC16(responseData);
            mockPort.emitData(fullResponse);
        };

        // Modbus master writes request
        const writer = mockPort.writable!.getWriter();
        await writer.write(readRequest);
        writer.releaseLock();

        // Modbus master reads response
        const reader = mockPort.readable!.getReader();
        const { value: responseBytes } = await reader.read();
        reader.releaseLock();

        expect(responseBytes).toBeDefined();
        expect(verifyCRC16(responseBytes!)).toBe(true);

        const responseView = new DataView(responseBytes!.buffer, responseBytes!.byteOffset);
        expect(responseBytes![0]).toBe(1); // Slave ID
        expect(responseBytes![1]).toBe(3); // Function Code
        expect(responseBytes![2]).toBe(4); // Byte count
        expect(responseView.getUint16(3, false)).toBe(123); // Register 0
        expect(responseView.getUint16(5, false)).toBe(456); // Register 1

        await mockPort.close();
    });
});
