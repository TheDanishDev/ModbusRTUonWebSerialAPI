import { MockPort } from './mockPort.js';
import { SerialPortInfo } from './types.js';

export interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
    bluetoothServiceClassId?: string;
}

export interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
}

/**
 * Mock implementation of the browser navigator.serial object.
 */
export class MockSerial extends EventTarget {
    private _ports: MockPort[] = [];
    private _onconnect: ((this: MockSerial, ev: Event) => any) | null = null;
    private _ondisconnect: ((this: MockSerial, ev: Event) => any) | null = null;

    constructor(initialPorts: MockPort[] = []) {
        super();
        for (const port of initialPorts) {
            this.addPort(port);
        }
    }

    get onconnect(): ((this: MockSerial, ev: Event) => any) | null {
        return this._onconnect;
    }

    set onconnect(handler: ((this: MockSerial, ev: Event) => any) | null) {
        if (this._onconnect) {
            this.removeEventListener('connect', this._onconnect as EventListener);
        }
        this._onconnect = handler;
        if (this._onconnect) {
            this.addEventListener('connect', this._onconnect as EventListener);
        }
    }

    get ondisconnect(): ((this: MockSerial, ev: Event) => any) | null {
        return this._ondisconnect;
    }

    set ondisconnect(handler: ((this: MockSerial, ev: Event) => any) | null) {
        if (this._ondisconnect) {
            this.removeEventListener('disconnect', this._ondisconnect as EventListener);
        }
        this._ondisconnect = handler;
        if (this._ondisconnect) {
            this.addEventListener('disconnect', this._ondisconnect as EventListener);
        }
    }

    /**
     * Adds a mock port to the serial manager and triggers connect event.
     */
    addPort(port: MockPort): void {
        if (!this._ports.includes(port)) {
            this._ports.push(port);
            port.addEventListener('connect', () => {
                this.dispatchEvent(new Event('connect'));
            });
            port.addEventListener('disconnect', () => {
                this.dispatchEvent(new Event('disconnect'));
            });
        }
    }

    /**
     * Removes a mock port from the serial manager.
     */
    removePort(port: MockPort): boolean {
        const index = this._ports.indexOf(port);
        if (index !== -1) {
            this._ports.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Simulates navigator.serial.requestPort().
     */
    async requestPort(options?: SerialPortRequestOptions): Promise<MockPort> {
        if (this._ports.length === 0) {
            const defaultPort = new MockPort({
                usbVendorId: options?.filters?.[0]?.usbVendorId ?? 0x1234,
                usbProductId: options?.filters?.[0]?.usbProductId ?? 0x5678,
            });
            this.addPort(defaultPort);
            return defaultPort;
        }

        if (options?.filters && options.filters.length > 0) {
            for (const filter of options.filters) {
                const match = this._ports.find((p) => {
                    const info = p.getInfo();
                    if (filter.usbVendorId !== undefined && info.usbVendorId !== filter.usbVendorId) {
                        return false;
                    }
                    if (filter.usbProductId !== undefined && info.usbProductId !== filter.usbProductId) {
                        return false;
                    }
                    return true;
                });
                if (match) return match;
            }
        }

        return this._ports[0];
    }

    /**
     * Simulates navigator.serial.getPorts().
     */
    async getPorts(): Promise<MockPort[]> {
        return [...this._ports];
    }
}
