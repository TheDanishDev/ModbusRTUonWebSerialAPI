import { appendCRC16, calculateCRC16 } from './protocol/crc16.js';

export enum ModbusFunctionCode {
    ReadCoils = 0x01,
    ReadDiscreteInputs = 0x02,
    ReadHoldingRegisters = 0x03,
    ReadInputRegisters = 0x04,
    WriteSingleCoil = 0x05,
    WriteSingleRegister = 0x06,
    ReadExceptionStatus = 0x07, // Usato raramente sulle seriali moderne
    Diagnostics = 0x08,
    WriteMultipleCoils = 0x0F,
    WriteMultipleRegisters = 0x10,
    MaskWriteRegister = 0x16,
    ReadWriteMultipleRegisters = 0x17
}

export type ModbusRegisterType = 'holding' | 'input' | 'coil' | 'discrete';
export type ModbusAction = 'read' | 'write';
export type ModbusIntegersType = "bool" | "int16" | "uint16" | "int32" | "uint32" | "int64" | "uint64" | "float32" | "float64";
export type ModbusArraysType = `${ModbusIntegersType}[]`;
export type ModbusTypeString = `char[${number}]`;
export type ModbusDataType = ModbusIntegersType | ModbusArraysType | ModbusTypeString;

export interface ModbusTag {
    id: number,
    register: ModbusRegisterType,
    address: number,
    type: ModbusDataType,
    value?: any,
    timestamp?: Date,
}

interface QueueAction {
    action: ModbusAction,
    tag: ModbusTag,
}


const ModbusReadMap: Record<ModbusRegisterType, ModbusFunctionCode> = {
    coil: ModbusFunctionCode.ReadCoils,               // 0x01
    discrete: ModbusFunctionCode.ReadDiscreteInputs,  // 0x02
    holding: ModbusFunctionCode.ReadHoldingRegisters, // 0x03
    input: ModbusFunctionCode.ReadInputRegisters,     // 0x04
};


export class ModbusMaster {

    static buildReadRequest(slaveAddress: number, register: ModbusRegisterType, address: number, length: number): Uint8Array {
        if (length < 1)
            throw new RangeError("La lunghezza della richiesta Modbus deve essere maggiore di 0.");

        const isCoilOrDiscrete = register === 'coil' || register === 'discrete';
        const maxLength = isCoilOrDiscrete ? 2000 : 125; // Limiti standard del protocollo Modbus

        if (length > maxLength)
            throw new RangeError(`Lunghezza massima superata per il tipo '${register}'. Massimo consentito: ${maxLength}.`);

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
        viewrequest.setUint16(4, data.length, false);       //quantity of registers
        viewrequest.setUint8(6, byteCount);       //quantity in bytes
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