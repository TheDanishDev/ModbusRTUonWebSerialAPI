import { Port } from './port.js';
import {
    SerialInputSignals,
    SerialOptions,
    SerialOutputSignals,
    SerialPortInfo
} from './types.js';

export type OnWriteCallback = (chunk: Uint8Array) => void | Promise<void>;

/**
 * MockPort provides an in-memory mock of the Web Serial API SerialPort.
 * Ideal for unit testing Modbus requests and serial communication without physical hardware.
 */
export class MockPort extends Port {
    private _readableController: ReadableStreamDefaultController<Uint8Array> | null = null;
    private _writtenChunks: Uint8Array[] = [];
    private _onWrite: OnWriteCallback | null = null;
    private _writeListeners: OnWriteCallback[] = [];

    constructor(info?: SerialPortInfo) {
        super();
        if (info) {
            this._info = { ...info };
        }
        // Realistic default serial input signals
        this._signals = {
            dataCarrierDetect: true,
            clearToSend: true,
            ringIndicator: false,
            dataSetReady: true,
        };
    }

    /**
     * Whether the port is currently open.
     */
    get isOpen(): boolean {
        return this._isOpen;
    }

    /**
     * Options used when opening the port.
     */
    get options(): SerialOptions | undefined {
        return this._options ? { ...this._options } : undefined;
    }

    /**
     * Chunks written to the port's writable stream.
     */
    get writtenData(): Uint8Array[] {
        return [...this._writtenChunks];
    }

    /**
     * Alias for writtenData.
     */
    get writtenChunks(): Uint8Array[] {
        return [...this._writtenChunks];
    }

    /**
     * Most recent output signals set via setSignals().
     */
    get outputSignals(): SerialOutputSignals {
        return { ...this._outputSignals };
    }

    /**
     * Callback invoked whenever data is written to the writable stream.
     */
    get onWrite(): OnWriteCallback | null {
        return this._onWrite;
    }

    set onWrite(callback: OnWriteCallback | null) {
        this._onWrite = callback;
    }

    /**
     * Adds an internal listener for write events.
     */
    addWriteListener(listener: OnWriteCallback): void {
        this._writeListeners.push(listener);
    }

    /**
     * Removes an internal listener for write events.
     */
    removeWriteListener(listener: OnWriteCallback): void {
        const index = this._writeListeners.indexOf(listener);
        if (index !== -1) {
            this._writeListeners.splice(index, 1);
        }
    }

    /**
     * Opens the mock port and initializes readable and writable streams.
     */
    override async open(options: SerialOptions): Promise<void> {
        if (!options || typeof options.baudRate !== 'number' || options.baudRate <= 0) {
            throw new TypeError("Baud rate must be a positive number.");
        }

        if (this._isOpen) {
            throw new DOMException("Port is already open.", "InvalidStateError");
        }

        this._options = { ...options };
        this._isOpen = true;

        this._readable = new ReadableStream<Uint8Array>({
            start: (controller) => {
                this._readableController = controller;
            },
            cancel: () => {
                this._readableController = null;
            }
        });

        this._writable = new WritableStream<Uint8Array>({
            write: async (chunk) => {
                const data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
                const copy = new Uint8Array(data);
                this._writtenChunks.push(copy);

                for (const listener of this._writeListeners) {
                    await listener(copy);
                }

                if (this._onWrite) {
                    await this._onWrite(copy);
                }
            }
        });
    }

    /**
     * Closes the mock port and tears down streams.
     */
    override async close(): Promise<void> {
        if (!this._isOpen) {
            throw new DOMException("Port is already closed.", "InvalidStateError");
        }

        if (this._readable?.locked) {
            throw new DOMException("Cannot close port while readable stream is locked.", "InvalidStateError");
        }

        if (this._writable?.locked) {
            throw new DOMException("Cannot close port while writable stream is locked.", "InvalidStateError");
        }

        if (this._readableController) {
            try {
                this._readableController.close();
            } catch {
                // Ignore if controller is already closed
            }
            this._readableController = null;
        }

        this._readable = null;
        this._writable = null;
        this._isOpen = false;
    }

    /**
     * Injects incoming data into the readable stream for the consumer to read.
     */
    emitData(data: Uint8Array | number[] | ArrayBuffer): void {
        if (!this._isOpen || !this._readableController) {
            throw new DOMException("Port is not open.", "InvalidStateError");
        }

        let bytes: Uint8Array;
        if (data instanceof Uint8Array) {
            bytes = data;
        } else if (Array.isArray(data)) {
            bytes = new Uint8Array(data);
        } else if (data instanceof ArrayBuffer) {
            bytes = new Uint8Array(data);
        } else {
            bytes = new Uint8Array(data);
        }

        this._readableController.enqueue(bytes);
    }

    /**
     * Alias for emitData.
     */
    simulateRead(data: Uint8Array | number[] | ArrayBuffer): void {
        this.emitData(data);
    }

    /**
     * Errors the readable stream with the specified error.
     */
    simulateReadError(error: Error): void {
        if (!this._isOpen || !this._readableController) {
            throw new DOMException("Port is not open.", "InvalidStateError");
        }
        this._readableController.error(error);
    }

    /**
     * Returns all written data concatenated into a single Uint8Array.
     */
    getWrittenData(): Uint8Array {
        const totalLength = this._writtenChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of this._writtenChunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        return combined;
    }

    /**
     * Returns the most recent chunk written to the port, or undefined if no writes yet.
     */
    getLastWrittenChunk(): Uint8Array | undefined {
        if (this._writtenChunks.length === 0) {
            return undefined;
        }
        return this._writtenChunks[this._writtenChunks.length - 1];
    }

    /**
     * Clears all recorded written chunks.
     */
    clearWrittenData(): void {
        this._writtenChunks = [];
    }

    /**
     * Configures the simulated control signals returned by getSignals().
     */
    setMockSignals(signals: Partial<SerialInputSignals>): void {
        this._signals = { ...this._signals, ...signals };
    }

    /**
     * Simulates device connect event.
     */
    simulateConnect(): void {
        const event = new Event('connect');
        this.dispatchEvent(event);
    }

    /**
     * Simulates device disconnection event.
     */
    simulateDisconnect(): void {
        const event = new Event('disconnect');
        this.dispatchEvent(event);
        if (this._isOpen) {
            this._isOpen = false;
            if (this._readableController) {
                try {
                    this._readableController.close();
                } catch {}
                this._readableController = null;
            }
            this._readable = null;
            this._writable = null;
        }
    }

    /**
     * Creates a connected pair of MockPorts (virtual null-modem cable).
     * Data written to portA is received by portB, and vice versa.
     */
    static createPair(infoA?: SerialPortInfo, infoB?: SerialPortInfo): [MockPort, MockPort] {
        const portA = new MockPort(infoA ?? { usbVendorId: 0x1001, usbProductId: 0x0001 });
        const portB = new MockPort(infoB ?? { usbVendorId: 0x1002, usbProductId: 0x0002 });

        portA.addWriteListener((chunk) => {
            if (portB.isOpen) {
                portB.emitData(chunk);
            }
        });

        portB.addWriteListener((chunk) => {
            if (portA.isOpen) {
                portA.emitData(chunk);
            }
        });

        return [portA, portB];
    }

    /**
     * Creates a loopback MockPort where any written data is immediately echoed back to readable.
     */
    static createLoopback(info?: SerialPortInfo): MockPort {
        const port = new MockPort(info);
        port.addWriteListener((chunk) => {
            if (port.isOpen) {
                port.emitData(chunk);
            }
        });
        return port;
    }
}
