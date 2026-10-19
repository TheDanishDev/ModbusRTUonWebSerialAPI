import {
    SerialInputSignals,
    SerialOptions,
    SerialOutputSignals,
    SerialPortInfo,
    SerialPortLike
} from './types.js';

/**
 * Port class mimicking the W3C Web Serial API SerialPort interface.
 * Can wrap a native SerialPort (e.g., from navigator.serial.requestPort())
 * or serve as a base class for virtual/mock serial ports.
 */
export class Port extends EventTarget implements SerialPortLike {
    protected _underlyingPort?: SerialPortLike;
    protected _isOpen: boolean = false;
    protected _options?: SerialOptions;
    protected _info: SerialPortInfo = {};
    protected _signals: SerialInputSignals = {
        dataCarrierDetect: false,
        clearToSend: false,
        ringIndicator: false,
        dataSetReady: false,
    };
    protected _outputSignals: SerialOutputSignals = {
        dataTerminalReady: false,
        requestToSend: false,
        break: false,
    };
    protected _readable: ReadableStream<Uint8Array> | null = null;
    protected _writable: WritableStream<Uint8Array> | null = null;

    private _onconnect: ((this: Port, ev: Event) => any) | null = null;
    private _ondisconnect: ((this: Port, ev: Event) => any) | null = null;
    private _underlyingConnectListener?: (ev: Event) => void;
    private _underlyingDisconnectListener?: (ev: Event) => void;

    constructor(underlyingPort?: SerialPortLike) {
        super();
        if (underlyingPort) {
            this._underlyingPort = underlyingPort;
            this._underlyingConnectListener = (ev: Event) => {
                this.dispatchEvent(new Event('connect'));
            };
            this._underlyingDisconnectListener = (ev: Event) => {
                this.dispatchEvent(new Event('disconnect'));
            };
            this._underlyingPort.addEventListener('connect', this._underlyingConnectListener);
            this._underlyingPort.addEventListener('disconnect', this._underlyingDisconnectListener);
        }
    }

    /**
     * The underlying native or wrapped port, if any.
     */
    get underlyingPort(): SerialPortLike | undefined {
        return this._underlyingPort;
    }

    /**
     * ReadableStream for receiving data from the connected device.
     * Returns null if the port is closed.
     */
    get readable(): ReadableStream<Uint8Array> | null {
        if (this._underlyingPort) {
            return this._underlyingPort.readable;
        }
        return this._readable;
    }

    /**
     * WritableStream for sending data to the connected device.
     * Returns null if the port is closed.
     */
    get writable(): WritableStream<Uint8Array> | null {
        if (this._underlyingPort) {
            return this._underlyingPort.writable;
        }
        return this._writable;
    }

    /**
     * Returns true if the port is currently connected / open.
     */
    get connected(): boolean {
        if (this._underlyingPort) {
            return this._underlyingPort.connected ?? this._isOpen;
        }
        return this._isOpen;
    }

    /**
     * Event handler property for 'connect' event.
     */
    get onconnect(): ((this: Port, ev: Event) => any) | null {
        return this._onconnect;
    }

    set onconnect(handler: ((this: Port, ev: Event) => any) | null) {
        if (this._onconnect) {
            this.removeEventListener('connect', this._onconnect as EventListener);
        }
        this._onconnect = handler;
        if (this._onconnect) {
            this.addEventListener('connect', this._onconnect as EventListener);
        }
    }

    /**
     * Event handler property for 'disconnect' event.
     */
    get ondisconnect(): ((this: Port, ev: Event) => any) | null {
        return this._ondisconnect;
    }

    set ondisconnect(handler: ((this: Port, ev: Event) => any) | null) {
        if (this._ondisconnect) {
            this.removeEventListener('disconnect', this._ondisconnect as EventListener);
        }
        this._ondisconnect = handler;
        if (this._ondisconnect) {
            this.addEventListener('disconnect', this._ondisconnect as EventListener);
        }
    }

    /**
     * Opens the serial port with the specified options.
     */
    async open(options: SerialOptions): Promise<void> {
        if (!options || typeof options.baudRate !== 'number' || options.baudRate <= 0) {
            throw new TypeError("Baud rate must be a positive number.");
        }

        if (this._underlyingPort) {
            await this._underlyingPort.open(options);
            this._isOpen = true;
            this._options = options;
            return;
        }

        if (this._isOpen) {
            throw new DOMException("Port is already open.", "InvalidStateError");
        }

        this._isOpen = true;
        this._options = options;
    }

    /**
     * Closes the serial port.
     */
    async close(): Promise<void> {
        if (this._underlyingPort) {
            await this._underlyingPort.close();
            this._isOpen = false;
            return;
        }

        if (!this._isOpen) {
            throw new DOMException("Port is already closed.", "InvalidStateError");
        }

        if (this._readable?.locked) {
            throw new DOMException("Cannot close port while readable stream is locked.", "InvalidStateError");
        }

        if (this._writable?.locked) {
            throw new DOMException("Cannot close port while writable stream is locked.", "InvalidStateError");
        }

        this._isOpen = false;
        this._readable = null;
        this._writable = null;
    }

    /**
     * Returns metadata regarding the port (e.g. USB vendor/product IDs).
     */
    getInfo(): SerialPortInfo {
        if (this._underlyingPort) {
            return this._underlyingPort.getInfo();
        }
        return { ...this._info };
    }

    /**
     * Returns current state of control signals (DCD, CTS, RI, DSR).
     */
    async getSignals(): Promise<SerialInputSignals> {
        if (this._underlyingPort) {
            return await this._underlyingPort.getSignals();
        }

        if (!this._isOpen) {
            throw new DOMException("Port is not open.", "InvalidStateError");
        }

        return { ...this._signals };
    }

    /**
     * Controls output signals (DTR, RTS, Break).
     */
    async setSignals(signals?: SerialOutputSignals): Promise<void> {
        if (this._underlyingPort) {
            return await this._underlyingPort.setSignals(signals);
        }

        if (!this._isOpen) {
            throw new DOMException("Port is not open.", "InvalidStateError");
        }

        if (signals) {
            this._outputSignals = { ...this._outputSignals, ...signals };
        }
    }

    /**
     * Closes the port and revokes permission if supported.
     */
    async forget(): Promise<void> {
        if (this._underlyingPort?.forget) {
            await this._underlyingPort.forget();
            this._isOpen = false;
            return;
        }

        if (this._isOpen) {
            await this.close();
        }
    }
}
