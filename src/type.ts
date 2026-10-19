export * from './connection/types.js';

/**
 * Standard Modbus Function Codes
 */
export enum ModbusFunctionCode {
    ReadCoils = 0x01,
    ReadDiscreteInputs = 0x02,
    ReadHoldingRegisters = 0x03,
    ReadInputRegisters = 0x04,
    WriteSingleCoil = 0x05,
    WriteSingleRegister = 0x06,
    ReadExceptionStatus = 0x07, // Rarely used on modern serial lines
    Diagnostics = 0x08,
    WriteMultipleCoils = 0x0F,
    WriteMultipleRegisters = 0x10,
    MaskWriteRegister = 0x16,
    ReadWriteMultipleRegisters = 0x17
}

export type ModbusRegisterType = 'holding' | 'input' | 'coil' | 'discrete';
export type ModbusAction = 'read' | 'write';

/**
 * Supported scalar numeric and boolean types in Modbus
 */
export type ModbusNumbersType =
    | 'bool'
    | 'int8'
    | 'uint8'
    | 'int16'
    | 'uint16'
    | 'int32'
    | 'uint32'
    | 'int64'
    | 'uint64'
    | 'float32'
    | 'float64';

/**
 * Explicit array types for each ModbusNumbersType
 */
export type ModbusBoolArray = `bool[${number}]` | 'bool[]';
export type ModbusInt8Array = `int8[${number}]` | 'int8[]';
export type ModbusUint8Array = `uint8[${number}]` | 'uint8[]';
export type ModbusInt16Array = `int16[${number}]` | 'int16[]';
export type ModbusUint16Array = `uint16[${number}]` | 'uint16[]';
export type ModbusInt32Array = `int32[${number}]` | 'int32[]';
export type ModbusUint32Array = `uint32[${number}]` | 'uint32[]';
export type ModbusInt64Array = `int64[${number}]` | 'int64[]';
export type ModbusUint64Array = `uint64[${number}]` | 'uint64[]';
export type ModbusFloat32Array = `float32[${number}]` | 'float32[]';
export type ModbusFloat64Array = `float64[${number}]` | 'float64[]';

/**
 * Sized arrays (e.g. 'bool[7]', 'int32[3]', 'uint16[10]')
 */
export type ModbusSizedArrayType = `${ModbusNumbersType}[${number}]`;

/**
 * Unsized arrays (e.g. 'bool[]', 'int32[]', 'uint16[]')
 */
export type ModbusUnsizedArrayType = `${ModbusNumbersType}[]`;

/**
 * All Modbus numbers array types (sized and unsized)
 */
export type ModbusArraysType =
    | ModbusUnsizedArrayType
    | ModbusSizedArrayType
    | ModbusBoolArray
    | ModbusInt8Array
    | ModbusUint8Array
    | ModbusInt16Array
    | ModbusUint16Array
    | ModbusInt32Array
    | ModbusUint32Array
    | ModbusInt64Array
    | ModbusUint64Array
    | ModbusFloat32Array
    | ModbusFloat64Array;

/**
 * Fixed or dynamic character string types (e.g. 'char[10]', 'char[]')
 */
export type ModbusTypeString = `char[${number}]` | 'char[]';

/**
 * Complete union of Modbus data types
 */
export type ModbusDataType =
    | ModbusNumbersType
    | ModbusArraysType
    | ModbusTypeString
    | 'char';

export interface ModbusTag {
    id: number;
    register: ModbusRegisterType;
    address: number;
    type: ModbusDataType;
    value?: any;
    timestamp?: Date;
}

export interface QueueAction {
    action: ModbusAction;
    tag: ModbusTag;
}

/**
 * Mapping between Modbus register types and default read function codes
 */
export const ModbusReadMap: Record<ModbusRegisterType, ModbusFunctionCode> = {
    coil: ModbusFunctionCode.ReadCoils,               // 0x01
    discrete: ModbusFunctionCode.ReadDiscreteInputs,  // 0x02
    holding: ModbusFunctionCode.ReadHoldingRegisters, // 0x03
    input: ModbusFunctionCode.ReadInputRegisters,     // 0x04
};

/**
 * Base byte sizes for each scalar type
 */
export const MODBUS_TYPE_BYTE_SIZES: Record<ModbusNumbersType | 'char', number> = {
    bool: 1,
    int8: 1,
    uint8: 1,
    int16: 2,
    uint16: 2,
    int32: 4,
    uint32: 4,
    int64: 8,
    uint64: 8,
    float32: 4,
    float64: 8,
    char: 1,
};

export interface ByteLengthOptions {
    /**
     * If true, bool arrays are calculated as bit-packed bytes: Math.ceil(count / 8)
     * e.g., bool[7] -> 1 byte, bool[9] -> 2 bytes.
     * Default is false (1 byte per boolean element, e.g. bool[7] -> 7 bytes).
     */
    bitPackedBool?: boolean;
}

/**
 * Calculates the length in bytes for a given Modbus data type.
 * Supports scalar types ('int32', 'float64', etc.), fixed arrays ('int32[3]', 'bool[7]', 'char[10]'),
 * and unsized arrays ('int32[]') when length is provided.
 *
 * @param type The Modbus data type string (e.g. 'int32', 'bool[7]', 'char[10]', 'int16[]')
 * @param arrayLengthOrOptions Optional length for unsized arrays or calculation options
 * @param maybeOptions Optional calculation options if length was provided as 2nd arg
 * @returns Total length in bytes
 */
export function getTypeByteLength(
    type: ModbusDataType | string,
    arrayLengthOrOptions?: number | ByteLengthOptions,
    maybeOptions?: ByteLengthOptions
): number {
    let arrayLength: number | undefined;
    let options: ByteLengthOptions | undefined;

    if (typeof arrayLengthOrOptions === 'number') {
        arrayLength = arrayLengthOrOptions;
        options = maybeOptions;
    } else if (typeof arrayLengthOrOptions === 'object' && arrayLengthOrOptions !== null) {
        options = arrayLengthOrOptions;
    }

    if (typeof type !== 'string') {
        throw new TypeError('Type must be a string.');
    }

    const trimmed = type.trim();

    // Sized array: e.g. "int32[3]", "bool[7]", "char[10]"
    const sizedMatch = trimmed.match(/^([a-zA-Z0-9_]+)\[(\d+)\]$/);
    if (sizedMatch) {
        const base = sizedMatch[1] as ModbusNumbersType | 'char';
        const count = parseInt(sizedMatch[2], 10);
        return calculateBaseLength(base, count, trimmed, options);
    }

    // Unsized array: e.g. "int32[]", "bool[]", "char[]"
    const unsizedMatch = trimmed.match(/^([a-zA-Z0-9_]+)\[\]$/);
    if (unsizedMatch) {
        const base = unsizedMatch[1] as ModbusNumbersType | 'char';
        if (arrayLength === undefined) {
            throw new TypeError(`Unsized array type '${trimmed}' requires an explicit length parameter.`);
        }
        if (arrayLength < 0 || !Number.isInteger(arrayLength)) {
            throw new RangeError(`Array length must be a non-negative integer, got ${arrayLength}.`);
        }
        return calculateBaseLength(base, arrayLength, trimmed, options);
    }

    // Scalar type: e.g. "int32", "bool", "char"
    const base = trimmed as ModbusNumbersType | 'char';
    if (!(base in MODBUS_TYPE_BYTE_SIZES)) {
        throw new TypeError(`Unknown Modbus data type '${trimmed}'.`);
    }

    if (arrayLength !== undefined) {
        if (arrayLength < 0 || !Number.isInteger(arrayLength)) {
            throw new RangeError(`Array length must be a non-negative integer, got ${arrayLength}.`);
        }
        return calculateBaseLength(base, arrayLength, trimmed, options);
    }

    return MODBUS_TYPE_BYTE_SIZES[base];
}

function calculateBaseLength(
    base: ModbusNumbersType | 'char',
    count: number,
    originalType: string,
    options?: ByteLengthOptions
): number {
    if (!(base in MODBUS_TYPE_BYTE_SIZES)) {
        throw new TypeError(`Unknown Modbus data type '${originalType}'.`);
    }

    if (count < 0 || !Number.isInteger(count)) {
        throw new RangeError(`Array count must be a non-negative integer, got ${count}.`);
    }

    if (base === 'bool' && options?.bitPackedBool) {
        return Math.ceil(count / 8);
    }

    return MODBUS_TYPE_BYTE_SIZES[base] * count;
}

/**
 * Alias for getTypeByteLength
 */
export const getByteLength = getTypeByteLength;

/**
 * Returns the number of Modbus 16-bit registers (words) required to hold the specified type.
 */
export function getTypeRegisterCount(
    type: ModbusDataType | string,
    arrayLengthOrOptions?: number | ByteLengthOptions,
    options?: ByteLengthOptions
): number {
    const bytes = getTypeByteLength(type, arrayLengthOrOptions, options);
    return Math.ceil(bytes / 2);
}

/**
 * Alias for getTypeRegisterCount
 */
export const getRegisterCount = getTypeRegisterCount;
