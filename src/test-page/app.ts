import { Port } from '../connection/port.js';
import { MockPort } from '../connection/mockPort.js';
import { ModbusMaster } from '../mbmaster.js';
import { appendCRC16 } from '../protocol/crc16.js';
import { ModbusTag } from '../type.js';

// DOM Elements
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
const readBtn = document.getElementById('readBtn') as HTMLButtonElement;
const simBtn = document.getElementById('simBtn') as HTMLButtonElement;
const clearLogBtn = document.getElementById('clearLogBtn') as HTMLButtonElement;

const statusBadge = document.getElementById('statusBadge') as HTMLElement;
const statusText = document.getElementById('statusText') as HTMLElement;
const browserWarning = document.getElementById('browserWarning') as HTMLElement;

const slaveIdInput = document.getElementById('slaveIdInput') as HTMLInputElement;
const baudRateSelect = document.getElementById('baudRateSelect') as HTMLSelectElement;
const startAddrInput = document.getElementById('startAddrInput') as HTMLInputElement;
const quantityInput = document.getElementById('quantityInput') as HTMLInputElement;

const resultsTableBody = document.getElementById('resultsTableBody') as HTMLElement;
const emptyState = document.getElementById('emptyState') as HTMLElement;
const terminalOutput = document.getElementById('terminalOutput') as HTMLElement;

let activePort: Port | MockPort | null = null;
let master: ModbusMaster | null = null;
let isSimulated = false;

// Format byte array to spaced HEX string
function toHex(bytes: Uint8Array | number[]): string {
    return Array.from(bytes)
        .map(b => (b & 0xFF).toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
}

// Log message to terminal
function log(msg: string, type: 'info' | 'tx' | 'rx' | 'err' = 'info'): void {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = type;
    line.innerHTML = `<span class="time">[${time}]</span> ${msg}`;
    terminalOutput.appendChild(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// Check Web Serial API support
if (!('serial' in navigator)) {
    browserWarning.style.display = 'block';
    connectBtn.disabled = true;
    log('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.', 'err');
} else {
    log('Web Serial API is available.', 'info');
}

// Update UI connection state
function setConnected(connected: boolean, label: string = 'Disconnected', badgeClass: string = 'disconnected') {
    statusBadge.className = `badge ${badgeClass}`;
    statusBadge.textContent = badgeClass;
    statusText.textContent = label;

    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
    readBtn.disabled = !connected;
    baudRateSelect.disabled = connected;
}

// Connect to a Real COM Port
connectBtn.addEventListener('click', async () => {
    try {
        log('Requesting serial port from user...', 'info');
        const rawPort = await (navigator as any).serial.requestPort();
        const baudRate = parseInt(baudRateSelect.value, 10);

        log(`Opening serial port at ${baudRate} baud...`, 'info');
        const port = new Port(rawPort);
        await port.open({ baudRate });

        activePort = port;
        master = new ModbusMaster(port);
        isSimulated = false;

        const info = port.getInfo();
        const infoStr = info.usbVendorId ? ` (VID: 0x${info.usbVendorId.toString(16)})` : '';
        log(`Connected successfully to serial port${infoStr}`, 'info');
        setConnected(true, `Connected to COM Port${infoStr}`, 'connected');

        // Automatically read holding registers 1 to 10 as requested
        await readHoldingRegisters();
    } catch (err: any) {
        log(`Connection failed: ${err.message}`, 'err');
        setConnected(false, `Error: ${err.message}`, 'disconnected');
    }
});

// Run Simulation with MockPort
simBtn.addEventListener('click', async () => {
    try {
        if (activePort) {
            await disconnect();
        }

        log('Starting Simulation Mode with MockPort...', 'info');
        const mockPort = new MockPort({ usbVendorId: 0x1234, usbProductId: 0x5678 });
        await mockPort.open({ baudRate: 9600 });

        // Simulate a Modbus Slave responding with values [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
        mockPort.onWrite = (requestChunk) => {
            log(`[TX] ${toHex(requestChunk)}`, 'tx');
            const slaveId = requestChunk[0];
            const fc = requestChunk[1];
            const startAddr = (requestChunk[2] << 8) | requestChunk[3];
            const qty = (requestChunk[4] << 8) | requestChunk[5];

            if (fc === 0x03) {
                // Read holding registers response
                const byteCount = qty * 2;
                const payload = new Uint8Array(3 + byteCount);
                payload[0] = slaveId;
                payload[1] = 0x03;
                payload[2] = byteCount;

                const view = new DataView(payload.buffer);
                for (let i = 0; i < qty; i++) {
                    const simulatedVal = (startAddr + i) * 100;
                    view.setUint16(3 + i * 2, simulatedVal, false);
                }

                const responseFrame = appendCRC16(payload);
                setTimeout(() => {
                    log(`[RX] ${toHex(responseFrame)}`, 'rx');
                    mockPort.emitData(responseFrame);
                }, 20);
            }
        };

        activePort = mockPort;
        master = new ModbusMaster(mockPort);
        isSimulated = true;

        log('Mock Port initialized (Virtual Slave ready).', 'info');
        setConnected(true, 'Connected (MockPort Simulation)', 'connected');

        // Automatically read holding registers 1 to 10
        await readHoldingRegisters();
    } catch (err: any) {
        log(`Simulation error: ${err.message}`, 'err');
    }
});

// Disconnect
async function disconnect() {
    if (activePort) {
        log('Closing port...', 'info');
        try {
            await activePort.close();
        } catch (e: any) {
            log(`Close error: ${e.message}`, 'err');
        }
        activePort = null;
        master = null;
    }
    setConnected(false, 'Disconnected', 'disconnected');
    log('Port closed.', 'info');
}

disconnectBtn.addEventListener('click', disconnect);

// Read Holding Registers from Start Address (default 1) to Count (default 10)
async function readHoldingRegisters() {
    if (!master || !activePort) {
        log('Cannot read: port is not connected.', 'err');
        return;
    }

    const slaveId = parseInt(slaveIdInput.value, 10) || 1;
    const startAddress = parseInt(startAddrInput.value, 10) || 1;
    const quantity = parseInt(quantityInput.value, 10) || 10;

    log(`Reading holding registers ${startAddress} to ${startAddress + quantity - 1} (Slave ID: ${slaveId})...`, 'info');
    statusBadge.className = 'badge reading';
    statusBadge.textContent = 'reading';

    // Hook TX logging for real port if not simulated
    if (!isSimulated && activePort && activePort.writable) {
        const originalGetWriter = activePort.writable.getWriter.bind(activePort.writable);
        activePort.writable.getWriter = () => {
            const writer = originalGetWriter();
            const originalWrite = writer.write.bind(writer);
            writer.write = async (chunk: Uint8Array) => {
                log(`[TX] ${toHex(chunk)}`, 'tx');
                return originalWrite(chunk);
            };
            return writer;
        };
    }

    const tag: ModbusTag = {
        id: slaveId,
        register: 'holding',
        address: startAddress,
        type: `uint16[${quantity}]` as any,
    };

    try {
        const values: number[] = await master.read(tag);
        log(`Successfully received ${values.length} registers!`, 'info');
        renderRegistersTable(startAddress, values);
    } catch (err: any) {
        log(`Read failed: ${err.message}`, 'err');
    } finally {
        if (activePort) {
            statusBadge.className = 'badge connected';
            statusBadge.textContent = 'connected';
        }
    }
}

readBtn.addEventListener('click', readHoldingRegisters);

// Render results in table
function renderRegistersTable(startAddress: number, values: number[]) {
    emptyState.style.display = 'none';
    resultsTableBody.innerHTML = '';

    values.forEach((val, index) => {
        const address = startAddress + index;
        const u16 = val & 0xFFFF;
        const s16 = new Int16Array([u16])[0];
        const hex = '0x' + u16.toString(16).padStart(4, '0').toUpperCase();
        const binary = u16.toString(2).padStart(16, '0').replace(/(.{4})/g, '$1 ').trim();

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="highlight mono">#${index + 1}</td>
            <td class="mono"><strong>${address}</strong> (0x${address.toString(16).padStart(4, '0').toUpperCase()})</td>
            <td class="mono highlight">${u16}</td>
            <td class="mono">${s16}</td>
            <td class="mono">${hex}</td>
            <td class="mono" style="color: #94a3b8; font-size: 11px;">${binary}</td>
        `;
        resultsTableBody.appendChild(tr);
    });
}

// Clear log button
clearLogBtn.addEventListener('click', () => {
    terminalOutput.innerHTML = '';
});
