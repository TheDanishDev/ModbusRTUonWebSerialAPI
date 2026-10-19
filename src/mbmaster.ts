import { appendCRC16, verifyCRC16 } from './protocol/crc16.js';
import { Port } from './connection/port.js';
import { SerialPortLike } from './connection/types.js';
import {
    DeviceOptions,
    DeviceProperty,
    ModbusAction,
    ModbusDataType,
    ModbusFunctionCode,
    ModbusReadMap,
    ModbusRegisterType,
    ModbusTag,
    QueueAction,
    getTypeByteLength,
    getByteLength,
    getTypeRegisterCount,
    getRegisterCount
} from './type.js';

// Re-export types from type.js for full backward compatibility
export * from './type.js';

export class ModbusMaster {
    static getTypeByteLength = getTypeByteLength;
    static getByteLength = getByteLength;
    static getTypeRegisterCount = getTypeRegisterCount;
    static getRegisterCount = getRegisterCount;

    public port?: Port | SerialPortLike;
    public queue: QueueAction[] = [];
    public responseTimeoutMs: number = 2000;

    private isProcessing: boolean = false;
    private deviceProperties: Map<number, DeviceProperty> = new Map();

    constructor(port?: Port | SerialPortLike) {
        if (port) {
            this.port = port;
        }
    }

    /**
     * Configures device-specific properties such as byte/word swapping and inter-request delay.
     *
     * @param id The Modbus slave/device ID
     * @param option 'swapBytes', 'swapWords', or an options object { swapBytes?, swapWords? }
     * @param delayIfEmptyQueue Milliseconds to wait after queue becomes empty (default 10)
     */
    setDeviceProperty(
        id: number,
        option: 'swapBytes' | 'swapWords' | 'mergeRequest' | DeviceOptions,
        delayIfEmptyQueue: number = 10
    ): DeviceProperty {
        const existing: DeviceProperty = this.deviceProperties.get(id) ?? {
            id,
            swapBytes: false,
            swapWords: false,
            delayIfEmptyQueue: 10,
            mergeRequest: true,
            maxMergeGap: 2,
        };

        if (typeof option === 'string') {
            if (option === 'swapBytes') {
                existing.swapBytes = true;
            } else if (option === 'swapWords') {
                existing.swapWords = true;
            } else if (option === 'mergeRequest') {
                existing.mergeRequest = true;
            }
        } else if (typeof option === 'object' && option !== null) {
            if (typeof option.swapBytes === 'boolean') {
                existing.swapBytes = option.swapBytes;
            }
            if (typeof option.swapWords === 'boolean') {
                existing.swapWords = option.swapWords;
            }
            if (typeof option.mergeRequest === 'boolean') {
                existing.mergeRequest = option.mergeRequest;
            }
            if (typeof option.maxMergeGap === 'number') {
                existing.maxMergeGap = option.maxMergeGap;
            }
        }

        existing.delayIfEmptyQueue = delayIfEmptyQueue;
        this.deviceProperties.set(id, existing);
        return { ...existing };
    }

    /**
     * Retrieves the configured property for the given device ID.
     */
    getDeviceProperty(id: number): DeviceProperty {
        const prop = this.deviceProperties.get(id);
        if (prop) {
            return { ...prop };
        }
        return {
            id,
            swapBytes: false,
            swapWords: false,
            delayIfEmptyQueue: 10,
            mergeRequest: true,
            maxMergeGap: 2,
        };
    }

    /**
     * Adds a new QueueAction to the request queue.
     * Deduplicates pending read requests and triggers queue processing.
     *
     * @param action 'read' or 'write'
     * @param tag Modbus tag to read from or write to
     * @returns Promise resolving with the parsed response or write confirmation
     */
    addRequest(action: ModbusAction, tag: ModbusTag): Promise<any> {
        let len: number;
        if (tag.register === 'coil' || tag.register === 'discrete') {
            const match = tag.type.match(/^bool\[(\d+)\]$/);
            len = match ? parseInt(match[1], 10) : 1;
        } else {
            len = getTypeRegisterCount(tag.type);
        }

        const key = `${action}-${tag.id}-${tag.address}-${tag.register}-${tag.type}-${len}`;

        // Deduplication for reads: if identical read is already queued, share promise
        if (action === 'read') {
            const existingRequest = this.queue.find(item => item.key === key);
            if (existingRequest && existingRequest.resolve && existingRequest.reject) {
                return new Promise((resolve, reject) => {
                    const originalResolve = existingRequest.resolve!;
                    const originalReject = existingRequest.reject!;
                    existingRequest.resolve = (val) => {
                        originalResolve(val);
                        resolve(val);
                    };
                    existingRequest.reject = (err) => {
                        originalReject(err);
                        reject(err);
                    };
                });
            }
        }

        let resolveFn!: (value: any) => void;
        let rejectFn!: (reason?: any) => void;

        const promise = new Promise<any>((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
        });

        const queueItem: QueueAction = {
            key,
            action,
            tag,
            len,
            resolve: resolveFn,
            reject: rejectFn,
            promise,
        };

        this.queue.push(queueItem);
        this.processQueue();
        return promise;
    }

    /**
     * Convenience method to queue a read request for a tag.
     */
    read(tag: ModbusTag): Promise<any> {
        return this.addRequest('read', tag);
    }

    /**
     * Convenience method to queue a write request for a tag.
     */
    write(tag: ModbusTag, value?: any): Promise<any> {
        if (value !== undefined) {
            tag.value = value;
        }
        return this.addRequest('write', tag);
    }

    /**
     * Decodes 16-bit register arrays received from the device into the target JS type,
     * applying byte and word swaps as configured.
     */
    parseReadData(
        data: Uint16Array | number[],
        datatype: ModbusDataType,
        deviceIdOrOptions?: number | DeviceOptions
    ): any {
        if (!Array.isArray(data) && !(data instanceof Uint16Array)) {
            return data;
        }

        const devProp = this.resolveDeviceProperty(deviceIdOrOptions);
        const trimmed = datatype.trim();

        // 1. Boolean
        if (trimmed === 'bool') {
            return data[0] !== 0;
        }

        // 2. 8-bit integers
        if (trimmed === 'uint8') {
            return data[0] & 0xFF;
        }
        if (trimmed === 'int8') {
            const raw = data[0] & 0xFF;
            return (raw & 0x80) ? raw - 0x100 : raw;
        }

        // 3. 16-bit integers
        if (trimmed === 'uint16') {
            let val = data[0] & 0xFFFF;
            if (devProp.swapBytes) {
                val = ((val & 0xFF) << 8) | ((val >> 8) & 0xFF);
            }
            return val;
        }
        if (trimmed === 'int16') {
            let val = data[0] & 0xFFFF;
            if (devProp.swapBytes) {
                val = ((val & 0xFF) << 8) | ((val >> 8) & 0xFF);
            }
            return new Int16Array([val])[0];
        }

        // 4. Character strings
        if (trimmed.startsWith('char')) {
            const bytes = new Uint8Array(data.length * 2);
            for (let i = 0; i < data.length; i++) {
                let reg = data[i] & 0xFFFF;
                if (devProp.swapBytes) {
                    reg = ((reg & 0xFF) << 8) | ((reg >> 8) & 0xFF);
                }
                bytes[i * 2] = (reg >> 8) & 0xFF;
                bytes[i * 2 + 1] = reg & 0xFF;
            }
            let str = new TextDecoder().decode(bytes);
            const nullIdx = str.indexOf('\0');
            if (nullIdx !== -1) {
                str = str.substring(0, nullIdx);
            }
            return str;
        }

        // 5. Sized/unsized arrays of numbers (e.g. int32[3], uint16[4], float32[2])
        const arrayMatch = trimmed.match(/^([a-zA-Z0-9_]+)\[(\d+)?\]$/);
        if (arrayMatch) {
            const baseType = arrayMatch[1] as ModbusDataType;
            const wordsPerElem = getTypeRegisterCount(baseType);
            const count = arrayMatch[2] ? parseInt(arrayMatch[2], 10) : Math.floor(data.length / wordsPerElem);
            const results: any[] = [];
            for (let i = 0; i < count; i++) {
                const subRegs = Array.from(data.slice(i * wordsPerElem, (i + 1) * wordsPerElem));
                results.push(this.parseReadData(subRegs, baseType, devProp));
            }
            return results;
        }

        // 6. Multi-register numbers (32-bit and 64-bit)
        const buffer = new ArrayBuffer(data.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < data.length; i++) {
            const wordIdx = (data.length >= 2 && devProp.swapWords) ? (i ^ 1) : i;
            let reg = data[wordIdx] & 0xFFFF;
            if (devProp.swapBytes) {
                reg = ((reg & 0xFF) << 8) | ((reg >> 8) & 0xFF);
            }
            view.setUint16(i * 2, reg, false);
        }

        switch (trimmed) {
            case 'int32': return view.getInt32(0, false);
            case 'uint32': return view.getUint32(0, false);
            case 'float32': return view.getFloat32(0, false);
            case 'float64': return view.getFloat64(0, false);
            case 'int64': return view.getBigInt64(0, false);
            case 'uint64': return view.getBigUint64(0, false);
            default: return data;
        }
    }

    /**
     * Converts a JS value into an array of 16-bit register values ready to be sent over Modbus.
     */
    prepareWriteData(
        value: any,
        datatype: ModbusDataType,
        deviceIdOrOptions?: number | DeviceOptions
    ): number[] {
        const devProp = this.resolveDeviceProperty(deviceIdOrOptions);
        const trimmed = datatype.trim();

        if (trimmed === 'bool') {
            return [value ? 1 : 0];
        }

        if (trimmed === 'uint8' || trimmed === 'int8') {
            return [Number(value) & 0xFF];
        }

        if (trimmed === 'uint16' || trimmed === 'int16') {
            let val = Number(value) & 0xFFFF;
            if (devProp.swapBytes) {
                val = ((val & 0xFF) << 8) | ((val >> 8) & 0xFF);
            }
            return [val];
        }

        if (trimmed.startsWith('char')) {
            const str = String(value ?? '');
            const encoded = new TextEncoder().encode(str);
            const len = getTypeRegisterCount(trimmed);
            const registers: number[] = [];
            for (let i = 0; i < len; i++) {
                const b0 = i * 2 < encoded.length ? encoded[i * 2] : 0;
                const b1 = i * 2 + 1 < encoded.length ? encoded[i * 2 + 1] : 0;
                let reg = (b0 << 8) | b1;
                if (devProp.swapBytes) {
                    reg = ((reg & 0xFF) << 8) | ((reg >> 8) & 0xFF);
                }
                registers.push(reg);
            }
            return registers;
        }

        // Sized or unsized arrays
        const arrayMatch = trimmed.match(/^([a-zA-Z0-9_]+)\[(\d+)?\]$/);
        if (arrayMatch && Array.isArray(value)) {
            const baseType = arrayMatch[1] as ModbusDataType;
            const registers: number[] = [];
            for (const item of value) {
                const itemRegs = this.prepareWriteData(item, baseType, devProp);
                registers.push(...itemRegs);
            }
            return registers;
        }

        // Multi-register types
        const len = getTypeRegisterCount(trimmed);
        const buffer = new ArrayBuffer(len * 2);
        const view = new DataView(buffer);

        switch (trimmed) {
            case 'int32': view.setInt32(0, Number(value), false); break;
            case 'uint32': view.setUint32(0, Number(value), false); break;
            case 'float32': view.setFloat32(0, Number(value), false); break;
            case 'float64': view.setFloat64(0, Number(value), false); break;
            case 'int64': view.setBigInt64(0, BigInt(value), false); break;
            case 'uint64': view.setBigUint64(0, BigInt(value), false); break;
            default: return [Number(value) & 0xFFFF];
        }

        const registers: number[] = [];
        for (let i = 0; i < len; i++) {
            const wordIdx = (len >= 2 && devProp.swapWords) ? (i ^ 1) : i;
            let reg = view.getUint16(wordIdx * 2, false);
            if (devProp.swapBytes) {
                reg = ((reg & 0xFF) << 8) | ((reg >> 8) & 0xFF);
            }
            registers.push(reg);
        }
        return registers;
    }

    /**
     * Finds and batches pending read requests in the queue that target the same device ID
     * and register type, within protocol limits.
     */
    private findMergeableBatch(firstTask: QueueAction, devProp: DeviceProperty): QueueAction[] {
        if (!devProp.mergeRequest || firstTask.action !== 'read') {
            return [firstTask];
        }

        const isCoilOrDiscrete = firstTask.tag.register === 'coil' || firstTask.tag.register === 'discrete';
        const maxLength = isCoilOrDiscrete ? 2000 : 125;
        const maxGap = devProp.maxMergeGap ?? 2;

        const batch: QueueAction[] = [firstTask];
        let batchStart = firstTask.tag.address;
        let batchEnd = firstTask.tag.address + (firstTask.len ?? 1);

        const extractedIndices: number[] = [];

        for (let i = 0; i < this.queue.length; i++) {
            const task = this.queue[i];

            // 1. Must be a read action
            if (task.action !== 'read') continue;

            // 2. CRITICAL: MUST be the exact same device ID
            if (task.tag.id !== firstTask.tag.id) continue;

            // 3. Must be the exact same register type
            if (task.tag.register !== firstTask.tag.register) continue;

            const taskStart = task.tag.address;
            const taskEnd = taskStart + (task.len ?? 1);

            // 4. Check if near enough (within maxGap)
            const gap = Math.max(0, taskStart - batchEnd, batchStart - taskEnd);
            if (gap > maxGap) continue;

            // 5. Check if total span does not exceed Modbus limits
            const potentialStart = Math.min(batchStart, taskStart);
            const potentialEnd = Math.max(batchEnd, taskEnd);
            if (potentialEnd - potentialStart > maxLength) continue;

            // Merge into current batch
            batch.push(task);
            batchStart = potentialStart;
            batchEnd = potentialEnd;
            extractedIndices.push(i);
        }

        // Remove merged items from queue in reverse order
        for (let j = extractedIndices.length - 1; j >= 0; j--) {
            this.queue.splice(extractedIndices[j], 1);
        }

        return batch;
    }

    /**
     * Processes pending items in the request queue, merging adjacent reads for the same device ID.
     */
    public async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) return;
        if (!this.port || !this.port.connected) return;

        this.isProcessing = true;
        // Yield microtask to allow synchronous callers in the same tick to finish adding requests to queue
        await Promise.resolve();

        if (!this.port || !this.port.connected || this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        const currentTask = this.queue.shift();

        if (currentTask) {
            const devProp = this.getDeviceProperty(currentTask.tag.id);
            const batch = this.findMergeableBatch(currentTask, devProp);

            try {
                if (!this.port.writable || !this.port.readable) {
                    throw new Error("Port readable or writable stream is not available.");
                }

                let requestFrame: Uint8Array;

                if (currentTask.action === 'read') {
                    const isCoilOrDiscrete = currentTask.tag.register === 'coil' || currentTask.tag.register === 'discrete';
                    const batchStart = Math.min(...batch.map(t => t.tag.address));
                    const batchEnd = Math.max(...batch.map(t => t.tag.address + (t.len ?? 1)));
                    const batchLength = batchEnd - batchStart;

                    requestFrame = ModbusMaster.buildReadRequest(
                        currentTask.tag.id,
                        currentTask.tag.register,
                        batchStart,
                        batchLength
                    );

                    // Send request frame
                    const writer = this.port.writable.getWriter();
                    await writer.write(requestFrame);
                    writer.releaseLock();

                    // Receive response frame
                    const response = await this.readResponse(this.responseTimeoutMs);

                    if (!verifyCRC16(response)) {
                        throw new Error("Modbus CRC verification failed on received response.");
                    }

                    if ((response[1] & 0x80) !== 0) {
                        throw new Error(`Modbus exception response: code ${response[2]}`);
                    }

                    if (isCoilOrDiscrete) {
                        const allBits: boolean[] = [];
                        for (let i = 0; i < batchLength; i++) {
                            const byteIdx = 3 + Math.floor(i / 8);
                            const bitIdx = i % 8;
                            allBits.push((response[byteIdx] & (1 << bitIdx)) !== 0);
                        }

                        for (const task of batch) {
                            const offset = task.tag.address - batchStart;
                            const taskLen = task.len ?? 1;
                            const taskBits = allBits.slice(offset, offset + taskLen);
                            const parsed = (taskLen === 1 && !task.tag.type.includes('[')) ? taskBits[0] : taskBits;

                            task.tag.value = parsed;
                            task.tag.timestamp = new Date();
                            task.resolve?.(parsed);
                        }
                    } else {
                        const byteCount = response[2];
                        const regCount = byteCount / 2;
                        const allRegisters = new Uint16Array(regCount);
                        const view = new DataView(response.buffer, response.byteOffset + 3, byteCount);
                        for (let i = 0; i < regCount; i++) {
                            allRegisters[i] = view.getUint16(i * 2, false);
                        }

                        for (const task of batch) {
                            const offset = task.tag.address - batchStart;
                            const taskLen = task.len ?? 1;
                            const taskRegisters = allRegisters.subarray(offset, offset + taskLen);
                            const parsed = this.parseReadData(taskRegisters, task.tag.type, devProp);

                            task.tag.value = parsed;
                            task.tag.timestamp = new Date();
                            task.resolve?.(parsed);
                        }
                    }
                } else {
                    if (currentTask.tag.register === 'coil') {
                        const boolData = Array.isArray(currentTask.tag.value)
                            ? currentTask.tag.value
                            : [Boolean(currentTask.tag.value)];
                        requestFrame = ModbusMaster.buildWriteCoilsRequest(
                            currentTask.tag.id,
                            currentTask.tag.address,
                            boolData
                        );
                    } else {
                        const registers = this.prepareWriteData(
                            currentTask.tag.value,
                            currentTask.tag.type,
                            devProp
                        );
                        requestFrame = ModbusMaster.buildWriteRegisterRequest(
                            currentTask.tag.id,
                            currentTask.tag.address,
                            new Uint16Array(registers)
                        );
                    }

                    // Send request frame
                    const writer = this.port.writable.getWriter();
                    await writer.write(requestFrame);
                    writer.releaseLock();

                    // Receive response frame
                    const response = await this.readResponse(this.responseTimeoutMs);

                    if (!verifyCRC16(response)) {
                        throw new Error("Modbus CRC verification failed on received response.");
                    }

                    if ((response[1] & 0x80) !== 0) {
                        throw new Error(`Modbus exception response: code ${response[2]}`);
                    }

                    currentTask.tag.timestamp = new Date();
                    currentTask.resolve?.(response);
                }

                // Wait delayIfEmptyQueue if queue is currently empty
                if (this.queue.length === 0 && devProp.delayIfEmptyQueue > 0) {
                    await new Promise(r => setTimeout(r, devProp.delayIfEmptyQueue));
                }
            } catch (err) {
                for (const task of batch) {
                    task.reject?.(err);
                }
            } finally {
                this.isProcessing = false;
                this.processQueue();
            }
        }
    }

    private async readResponse(timeoutMs: number = 2000): Promise<Uint8Array> {
        if (!this.port || !this.port.readable) {
            throw new Error("Port readable stream is not available.");
        }

        const reader = this.port.readable.getReader();
        const chunks: Uint8Array[] = [];
        let totalLength = 0;

        let timerId: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timerId = setTimeout(() => {
                reject(new Error("Modbus response timeout."));
            }, timeoutMs);
            if (typeof timerId?.unref === 'function') timerId.unref();
        });

        const readLoop = async (): Promise<Uint8Array> => {
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    throw new Error("Serial port closed while reading Modbus response.");
                }
                if (value && value.length > 0) {
                    chunks.push(value);
                    totalLength += value.length;

                    const combined = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) {
                        combined.set(chunk, offset);
                        offset += chunk.length;
                    }

                    if (combined.length >= 5) {
                        const fc = combined[1];

                        // Exception response (5 bytes)
                        if ((fc & 0x80) !== 0) {
                            return combined.slice(0, 5);
                        }

                        // Read response (3 + byteCount + 2 bytes)
                        if (fc === 0x01 || fc === 0x02 || fc === 0x03 || fc === 0x04) {
                            const byteCount = combined[2];
                            const expectedFrameLen = 3 + byteCount + 2;
                            if (combined.length >= expectedFrameLen) {
                                return combined.slice(0, expectedFrameLen);
                            }
                        }

                        // Write response (8 bytes)
                        if (fc === 0x05 || fc === 0x06 || fc === 0x0F || fc === 0x10) {
                            if (combined.length >= 8) {
                                return combined.slice(0, 8);
                            }
                        }
                    }
                }
            }
        };

        try {
            return await Promise.race([readLoop(), timeoutPromise]);
        } finally {
            clearTimeout(timerId);
            reader.releaseLock();
        }
    }

    private resolveDeviceProperty(deviceIdOrOptions?: number | DeviceOptions): DeviceProperty {
        if (typeof deviceIdOrOptions === 'number') {
            return this.getDeviceProperty(deviceIdOrOptions);
        }
        if (typeof deviceIdOrOptions === 'object' && deviceIdOrOptions !== null) {
            return {
                id: 0,
                swapBytes: Boolean(deviceIdOrOptions.swapBytes),
                swapWords: Boolean(deviceIdOrOptions.swapWords),
                delayIfEmptyQueue: 10,
                mergeRequest: deviceIdOrOptions.mergeRequest !== undefined ? deviceIdOrOptions.mergeRequest : true,
                maxMergeGap: deviceIdOrOptions.maxMergeGap ?? 2,
            };
        }
        return { id: 0, swapBytes: false, swapWords: false, delayIfEmptyQueue: 10, mergeRequest: true, maxMergeGap: 2 };
    }

    static buildReadRequest(slaveAddress: number, register: ModbusRegisterType, address: number, length: number): Uint8Array {
        if (length < 1)
            throw new RangeError("Modbus request length must be greater than 0.");

        const isCoilOrDiscrete = register === 'coil' || register === 'discrete';
        const maxLength = isCoilOrDiscrete ? 2000 : 125; // Standard Modbus protocol limits

        if (length > maxLength)
            throw new RangeError(`Maximum length exceeded for type '${register}'. Maximum allowed: ${maxLength}.`);

        const request = new Uint8Array(6);
        const viewrequest = new DataView(request.buffer);

        viewrequest.setUint8(0, slaveAddress);
        viewrequest.setUint8(1, ModbusReadMap[register]);
        viewrequest.setUint16(2, address, false);
        viewrequest.setUint16(4, length, false);

        return appendCRC16(request);
    }

    static buildWriteRegisterRequest(slaveAddress: number, address: number, data: Uint16Array): Uint8Array {
        const request = new Uint8Array(data.length * 2 + 7);
        const viewrequest = new DataView(request.buffer);

        viewrequest.setUint8(0, slaveAddress);      //slave id
        viewrequest.setUint8(1, ModbusFunctionCode.WriteMultipleRegisters);       //function code
        viewrequest.setUint16(2, address, false);   //start address
        viewrequest.setUint16(4, data.length, false);       //quantity of registers
        viewrequest.setUint8(6, data.length * 2);       //quantity in bytes
        for (let i = 0; i < data.length; i++)
            viewrequest.setUint16(7 + 2 * i, data[i], false);
        return appendCRC16(request);
    }

    static buildWriteCoilsRequest(slaveAddress: number, address: number, data: boolean[]): Uint8Array {
        const byteCount = (data.length + 7) >> 3;
        const request = new Uint8Array(byteCount + 7);
        const viewrequest = new DataView(request.buffer);

        viewrequest.setUint8(0, slaveAddress);      //slave id
        viewrequest.setUint8(1, ModbusFunctionCode.WriteMultipleCoils);       //function code
        viewrequest.setUint16(2, address, false);   //start address
        viewrequest.setUint16(4, data.length, false);       //quantity of coils
        viewrequest.setUint8(6, byteCount);       //byte count
        for (let i = 0; i < data.length; i++) {
            if (data[i]) {
                const byteIndex = 7 + Math.floor(i / 8);
                const bitPosition = i % 8;
                viewrequest.setUint8(byteIndex, viewrequest.getUint8(byteIndex) | (1 << bitPosition));
            }
        }

        return appendCRC16(request);
    }
}