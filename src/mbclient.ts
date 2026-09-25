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

export class ModbusClient {
    
    static buildReadRequest(slaveAddress: number, functionCode: ModbusFunctionCode, address: number, length: number ): Uint8Array {
        const request = new Uint8Array(6);
        const viewrequest = new DataView(request.buffer);

        viewrequest.setUint8(0, slaveAddress);
        viewrequest.setUint8(1, functionCode);
        viewrequest.setUint16(2, address, false);
        viewrequest.setUint16(4, length, false);
        
        return appendCRC16(request);
    }
}