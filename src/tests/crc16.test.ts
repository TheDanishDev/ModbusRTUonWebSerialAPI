import { describe, it, expect } from 'vitest';
import { calculateCRC16, appendCRC16, verifyCRC16 } from '../protocol/crc16.js';

describe('Modbus CRC-16 Tests', () => {

    it('should correctly calculate the CRC for a standard example packet', () => {
        // Standard Modbus Request: Slave 1, Read Holding Registers (0x03), from address 0 to 2.
        const packetWithoutCRC = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02]);
        
        const crc = calculateCRC16(packetWithoutCRC);
        // Expected CRC for this packet is 0xC40B
        // (Transmitted later as Low: 0x0B, High: 0xC4)
        expect(crc[0]).toBe(0xC4);
        expect(crc[1]).toBe(0x0B);
    });

    it('should correctly append the 2 CRC bytes to a standard Modbus request frame', () => {
        // Request: Slave 1, Read Holding Registers (0x03), Address 0, Quantity 2
        const rawFrame = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02]);
        
        const finalFrame = appendCRC16(rawFrame);

        // The complete frame length should be exactly 8 bytes (6 + 2)
        expect(finalFrame.length).toBe(8);

        // The first 6 bytes must remain untouched
        expect(Array.from(finalFrame.slice(0, 6))).toEqual([0x01, 0x03, 0x00, 0x00, 0x00, 0x02]);

        // The last two bytes must be the Low and High CRC bytes (0xC40B -> 0x0B, 0xC4)
        expect(finalFrame[6]).toBe(0xC4); // CRC Low Byte
        expect(finalFrame[7]).toBe(0x0B); // CRC High Byte
    });

    it('should correctly validate an untampered packet', () => {
        // Complete packet with integrated CRC (Low byte: 0x0B, High byte: 0xC4)
        const validCompletePacket = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xC4, 0x0B]);
        
        const isValid = verifyCRC16(validCompletePacket);
        
        expect(isValid).toBe(true);
    });

    it('should reject a packet if the data or the CRC is corrupted', () => {
        // Corrupted packet (the last byte of data changed from 0x02 to 0x99)
        const corruptedPacket = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x99, 0xC4, 0x0B]);
        
        const isValid = verifyCRC16(corruptedPacket);
        
        expect(isValid).toBe(false);
    });

    it('should handle short arrays by returning false', () => {
        const shortPacket = new Uint8Array([0x01, 0x02]); // Minimum 3 bytes needed for data + CRC
        expect(verifyCRC16(shortPacket)).toBe(false);
    });

});
