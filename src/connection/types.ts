export type ParityType = 'none' | 'even' | 'mark' | 'odd' | 'space';
export type FlowControlType = 'none' | 'hardware';

export interface SerialOptions {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2;
    parity?: ParityType;
    bufferSize?: number;
    flowControl?: FlowControlType;
}

export interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
    bluetoothServiceClassId?: string;
}

export interface SerialInputSignals {
    dataCarrierDetect: boolean;
    clearToSend: boolean;
    ringIndicator: boolean;
    dataSetReady: boolean;
}

export interface SerialOutputSignals {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
}

export interface SerialPortLike extends EventTarget {
    readonly connected: boolean;
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    onconnect?: ((this: any, ev: Event) => any) | null;
    ondisconnect?: ((this: any, ev: Event) => any) | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
    getSignals(): Promise<SerialInputSignals>;
    setSignals(signals?: SerialOutputSignals): Promise<void>;
    forget?(): Promise<void>;
}
