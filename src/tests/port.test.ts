import { describe, it, expect, vi } from 'vitest';
import { Port } from '../connection/port.js';
import { SerialPortLike } from '../connection/types.js';

describe('Port class', () => {
    describe('Standalone Port', () => {
        it('should initialize with closed state and null streams', () => {
            const port = new Port();
            expect(port.connected).toBe(false);
            expect(port.readable).toBeNull();
            expect(port.writable).toBeNull();
            expect(port.underlyingPort).toBeUndefined();
        });

        it('should require valid baudRate in open()', async () => {
            const port = new Port();
            await expect(port.open(null as any)).rejects.toThrow(TypeError);
            await expect(port.open({ baudRate: 0 })).rejects.toThrow(TypeError);
            await expect(port.open({ baudRate: -9600 })).rejects.toThrow(TypeError);
        });

        it('should open and close correctly', async () => {
            const port = new Port();
            await port.open({ baudRate: 9600 });
            expect(port.connected).toBe(true);

            // Cannot open again while open
            await expect(port.open({ baudRate: 9600 })).rejects.toThrow();

            await port.close();
            expect(port.connected).toBe(false);

            // Cannot close again while closed
            await expect(port.close()).rejects.toThrow();
        });

        it('should throw when accessing signals while closed', async () => {
            const port = new Port();
            await expect(port.getSignals()).rejects.toThrow();
            await expect(port.setSignals({ dataTerminalReady: true })).rejects.toThrow();
        });

        it('should get and set signals when open', async () => {
            const port = new Port();
            await port.open({ baudRate: 9600 });

            const signals = await port.getSignals();
            expect(signals).toHaveProperty('clearToSend');

            await port.setSignals({ dataTerminalReady: true, requestToSend: true });
            await port.close();
        });

        it('should return info object', () => {
            const port = new Port();
            const info = port.getInfo();
            expect(typeof info).toBe('object');
        });

        it('should support forget()', async () => {
            const port = new Port();
            await port.open({ baudRate: 9600 });
            expect(port.connected).toBe(true);
            await port.forget();
            expect(port.connected).toBe(false);
        });

        it('should support onconnect and ondisconnect event handlers', () => {
            const port = new Port();
            const connectHandler = vi.fn();
            const disconnectHandler = vi.fn();

            port.onconnect = connectHandler;
            port.ondisconnect = disconnectHandler;

            expect(port.onconnect).toBe(connectHandler);
            expect(port.ondisconnect).toBe(disconnectHandler);

            port.dispatchEvent(new Event('connect'));
            expect(connectHandler).toHaveBeenCalledTimes(1);

            port.dispatchEvent(new Event('disconnect'));
            expect(disconnectHandler).toHaveBeenCalledTimes(1);
        });
    });

    describe('Wrapped Port (wrapping SerialPortLike)', () => {
        function createMockUnderlyingPort(): SerialPortLike {
            const target = new EventTarget();
            let isOpen = false;
            let mockReadable: ReadableStream<Uint8Array> | null = null;
            let mockWritable: WritableStream<Uint8Array> | null = null;

            const underlying: SerialPortLike = {
                addEventListener: target.addEventListener.bind(target),
                removeEventListener: target.removeEventListener.bind(target),
                dispatchEvent: target.dispatchEvent.bind(target),
                get connected() {
                    return isOpen;
                },
                get readable() {
                    return mockReadable;
                },
                get writable() {
                    return mockWritable;
                },
                open: vi.fn(async () => {
                    isOpen = true;
                    mockReadable = new ReadableStream<Uint8Array>();
                    mockWritable = new WritableStream<Uint8Array>();
                }),
                close: vi.fn(async () => {
                    isOpen = false;
                    mockReadable = null;
                    mockWritable = null;
                }),
                getInfo: vi.fn(() => ({ usbVendorId: 0x1234, usbProductId: 0x5678 })),
                getSignals: vi.fn(async () => ({
                    dataCarrierDetect: true,
                    clearToSend: true,
                    ringIndicator: false,
                    dataSetReady: true,
                })),
                setSignals: vi.fn(async () => {}),
                forget: vi.fn(async () => {
                    isOpen = false;
                }),
            };

            return underlying;
        }

        it('should delegate open, close, streams and metadata to underlying port', async () => {
            const underlying = createMockUnderlyingPort();
            const port = new Port(underlying);

            expect(port.underlyingPort).toBe(underlying);
            expect(port.getInfo()).toEqual({ usbVendorId: 0x1234, usbProductId: 0x5678 });
            expect(port.connected).toBe(false);

            await port.open({ baudRate: 115200 });
            expect(underlying.open).toHaveBeenCalledWith({ baudRate: 115200 });
            expect(port.connected).toBe(true);
            expect(port.readable).toBeInstanceOf(ReadableStream);
            expect(port.writable).toBeInstanceOf(WritableStream);

            const signals = await port.getSignals();
            expect(signals.clearToSend).toBe(true);

            await port.setSignals({ dataTerminalReady: true });
            expect(underlying.setSignals).toHaveBeenCalledWith({ dataTerminalReady: true });

            await port.close();
            expect(underlying.close).toHaveBeenCalledTimes(1);
            expect(port.connected).toBe(false);

            await port.forget();
            expect(underlying.forget).toHaveBeenCalledTimes(1);
        });

        it('should forward connect and disconnect events from underlying port', () => {
            const underlying = createMockUnderlyingPort();
            const port = new Port(underlying);

            const connectListener = vi.fn();
            const disconnectListener = vi.fn();

            port.addEventListener('connect', connectListener);
            port.addEventListener('disconnect', disconnectListener);

            underlying.dispatchEvent(new Event('connect'));
            expect(connectListener).toHaveBeenCalledTimes(1);

            underlying.dispatchEvent(new Event('disconnect'));
            expect(disconnectListener).toHaveBeenCalledTimes(1);
        });
    });
});
