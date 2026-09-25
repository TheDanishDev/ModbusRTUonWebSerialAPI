/**
 * Calculates the standard CRC-16 checksum for Modbus RTU 
 * and returns it as a 2-byte Uint8Array [Low Byte, High Byte].
 * 
 * @param data A Uint8Array containing the bytes to process
 * @returns A Uint8Array of exactly 2 bytes
 */
export function calculateCRC16(data: Uint8Array): Uint8Array {
    let crc = 0xFFFF;

    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];

        for (let j = 0; j < 8; j++) {
            if ((crc & 0x0001) !== 0) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }

    // Split the 16-bit integer into two 8-bit bytes
    const crcLow = crc & 0xFF;
    const crcHigh = (crc >> 8) & 0xFF;

    // Return exactly the two bytes as a Uint8Array
    return new Uint8Array([crcLow, crcHigh]);
}

/**
 * Takes a data payload, calculates its Modbus CRC-16, and returns a new Uint8Array
 * with the 2 CRC bytes appended at the end (Low Byte first, High Byte second).
 * 
 * @param data The input payload (e.g., [SlaveID, FunctionCode, Address...])
 * @returns A new Uint8Array containing the original data plus the 2 trailing CRC bytes
 */
export function appendCRC16(data: Uint8Array): Uint8Array {
    // 1. Get the 2 CRC bytes directly
    const crcBytes = calculateCRC16(data);

    // 2. Create a new array with room for original data + 2 bytes
    const result = new Uint8Array(data.length + 2);

    // 3. Copy the original data and set the 2 trailing bytes
    result.set(data, 0);
    result.set(crcBytes, data.length);

    return result;
}

/**
 * Verifies if the received Modbus packet has a valid CRC.
 * In Modbus RTU, the last two bytes of the packet are the CRC (Low Byte, High Byte).
 * 
 * @param packet The complete received packet (including the 2 final CRC bytes)
 * @returns true if the CRC is correct, false otherwise
 */
export function verifyCRC16(packet: Uint8Array): boolean {
    if (packet.length < 3) return false;

    // Separate data from the received trailing CRC bytes
    const data = packet.slice(0, -2);
    const receivedCrcLow = packet[packet.length - 2];
    const receivedCrcHigh = packet[packet.length - 1];

    // Calculate CRC on the extracted data
    const calculatedCrc = calculateCRC16(data);

    // In Modbus, the least significant byte (Low) is transmitted before the most significant (High)
    const calculatedCrcLow = calculatedCrc[0];
    const calculatedCrcHigh = calculatedCrc[1];

    return receivedCrcLow === calculatedCrcLow && receivedCrcHigh === calculatedCrcHigh;
}
