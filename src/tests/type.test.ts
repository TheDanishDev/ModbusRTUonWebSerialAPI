import { describe, it, expect } from 'vitest';
import {
    getTypeByteLength,
    getByteLength,
    getTypeRegisterCount,
    getRegisterCount,
    MODBUS_TYPE_BYTE_SIZES,
    ModbusDataType,
    ModbusFunctionCode,
    ModbusNumbersType,
    ModbusReadMap,
} from '../type.js';
import { ModbusMaster } from '../mbmaster.js';

describe('Modbus Types and Byte Length Calculation', () => {
    describe('Scalar type byte length', () => {
        const expectedSizes: Record<ModbusNumbersType | 'char', number> = {
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

        for (const [type, size] of Object.entries(expectedSizes)) {
            it(`should return ${size} byte(s) for scalar '${type}'`, () => {
                expect(getTypeByteLength(type as ModbusDataType)).toBe(size);
                expect(getByteLength(type as ModbusDataType)).toBe(size);
                expect(ModbusMaster.getTypeByteLength(type as ModbusDataType)).toBe(size);
            });
        }
    });

    describe('Sized array types (e.g. bool[7], int32[3])', () => {
        it('should correctly calculate byte length for bool[7]', () => {
            const tagType: ModbusDataType = 'bool[7]';
            // Default 1 byte per boolean
            expect(getTypeByteLength(tagType)).toBe(7);
            // Packed bit option: Math.ceil(7 / 8) = 1 byte
            expect(getTypeByteLength(tagType, { bitPackedBool: true })).toBe(1);
        });

        it('should correctly calculate byte length for bool[9] with packed option', () => {
            const tagType: ModbusDataType = 'bool[9]';
            expect(getTypeByteLength(tagType)).toBe(9);
            expect(getTypeByteLength(tagType, { bitPackedBool: true })).toBe(2);
        });

        it('should correctly calculate byte length for int32[3]', () => {
            const tagType: ModbusDataType = 'int32[3]';
            expect(getTypeByteLength(tagType)).toBe(12);
        });

        it('should correctly calculate byte length for all ModbusNumbersType sized arrays', () => {
            expect(getTypeByteLength('int8[5]')).toBe(5);
            expect(getTypeByteLength('uint8[10]')).toBe(10);
            expect(getTypeByteLength('int16[4]')).toBe(8);
            expect(getTypeByteLength('uint16[8]')).toBe(16);
            expect(getTypeByteLength('uint32[2]')).toBe(8);
            expect(getTypeByteLength('int64[3]')).toBe(24);
            expect(getTypeByteLength('uint64[2]')).toBe(16);
            expect(getTypeByteLength('float32[4]')).toBe(16);
            expect(getTypeByteLength('float64[2]')).toBe(16);
            expect(getTypeByteLength('char[20]')).toBe(20);
        });

        it('should support 0-length arrays', () => {
            expect(getTypeByteLength('int32[0]')).toBe(0);
            expect(getTypeByteLength('bool[0]', { bitPackedBool: true })).toBe(0);
            expect(getTypeByteLength('char[0]')).toBe(0);
        });
    });

    describe('Unsized arrays with explicit length parameter', () => {
        it('should calculate length when length parameter is passed', () => {
            expect(getTypeByteLength('int32[]', 3)).toBe(12);
            expect(getTypeByteLength('uint16[]', 5)).toBe(10);
            expect(getTypeByteLength('char[]', 15)).toBe(15);
            expect(getTypeByteLength('bool[]', 7)).toBe(7);
            expect(getTypeByteLength('bool[]', 7, { bitPackedBool: true })).toBe(1);
            expect(getTypeByteLength('bool[]', 9, { bitPackedBool: true })).toBe(2);
        });

        it('should throw TypeError when length is omitted for unsized arrays', () => {
            expect(() => getTypeByteLength('int32[]')).toThrow(TypeError);
            expect(() => getTypeByteLength('bool[]')).toThrow(TypeError);
            expect(() => getTypeByteLength('char[]')).toThrow(TypeError);
        });

        it('should throw RangeError for negative length parameter', () => {
            expect(() => getTypeByteLength('int32[]', -1)).toThrow(RangeError);
            expect(() => getTypeByteLength('uint16[]', -5)).toThrow(RangeError);
        });
    });

    describe('Register count (16-bit words) calculation', () => {
        it('should calculate the number of Modbus registers (ceil(bytes / 2))', () => {
            expect(getTypeRegisterCount('int16')).toBe(1);
            expect(getTypeRegisterCount('uint16')).toBe(1);
            expect(getTypeRegisterCount('int32')).toBe(2);
            expect(getTypeRegisterCount('float32')).toBe(2);
            expect(getTypeRegisterCount('int64')).toBe(4);
            expect(getTypeRegisterCount('float64')).toBe(4);
            expect(getTypeRegisterCount('int32[3]')).toBe(6);
            expect(getTypeRegisterCount('char[10]')).toBe(5);
            expect(getTypeRegisterCount('char[5]')).toBe(3); // 5 bytes = 3 registers (5 / 2 = 2.5 -> ceil 3)
            expect(getRegisterCount('int32[3]')).toBe(6);
            expect(ModbusMaster.getTypeRegisterCount('int32[3]')).toBe(6);
        });
    });

    describe('Error handling', () => {
        it('should throw TypeError for unknown types', () => {
            expect(() => getTypeByteLength('invalid')).toThrow(TypeError);
            expect(() => getTypeByteLength('foobar[3]')).toThrow(TypeError);
            // @ts-expect-error - testing non-string type
            expect(() => getTypeByteLength(null)).toThrow(TypeError);
        });
    });

    describe('Enums and Maps in type.ts', () => {
        it('should expose ModbusFunctionCode enum and ModbusReadMap', () => {
            expect(ModbusFunctionCode.ReadHoldingRegisters).toBe(0x03);
            expect(ModbusFunctionCode.WriteMultipleRegisters).toBe(0x10);
            expect(ModbusReadMap.holding).toBe(ModbusFunctionCode.ReadHoldingRegisters);
            expect(ModbusReadMap.coil).toBe(ModbusFunctionCode.ReadCoils);
            expect(ModbusReadMap.discrete).toBe(ModbusFunctionCode.ReadDiscreteInputs);
            expect(ModbusReadMap.input).toBe(ModbusFunctionCode.ReadInputRegisters);
        });

        it('should expose MODBUS_TYPE_BYTE_SIZES map', () => {
            expect(MODBUS_TYPE_BYTE_SIZES.int32).toBe(4);
            expect(MODBUS_TYPE_BYTE_SIZES.float64).toBe(8);
            expect(MODBUS_TYPE_BYTE_SIZES.bool).toBe(1);
        });
    });
});
