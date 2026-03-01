// ============================================
// Server Ping Handler — Minecraft Server List Ping (SLP) Protocol
// Pure TCP implementation, no external dependencies
// ============================================
const net = require('net');

// ---- VarInt Helpers (Minecraft protocol encoding) ----

function writeVarInt(value) {
  const bytes = [];
  while (true) {
    if ((value & ~0x7F) === 0) {
      bytes.push(value);
      break;
    }
    bytes.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset) {
  let value = 0;
  let size = 0;
  let byte;
  do {
    if (offset + size >= buffer.length) {
      throw new Error('VarInt incomplete');
    }
    byte = buffer[offset + size];
    value |= (byte & 0x7F) << (size * 7);
    size++;
    if (size > 5) throw new Error('VarInt too big');
  } while ((byte & 0x80) !== 0);
  return { value, size };
}

function writeUInt16BE(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

// ---- Minecraft Server List Ping ----

function pingServer(host, port = 25565, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let responseData = Buffer.alloc(0);
    let resolved = false;

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    const fail = (reason) => {
      done({
        online: false,
        latency: -1,
        players: { online: 0, max: 0, sample: [] },
        version: '',
        motd: '',
        error: reason
      });
    };

    socket.setTimeout(timeout);
    socket.on('timeout', () => fail('timeout'));
    socket.on('error', (err) => fail(err.message));

    socket.connect(port, host, () => {
      try {
        // --- Handshake Packet (ID 0x00) ---
        const hostBuf = Buffer.from(host, 'utf-8');
        const handshakePayload = Buffer.concat([
          writeVarInt(0x00),                  // Packet ID: Handshake
          writeVarInt(-1),                    // Protocol version (-1 = request any)
          writeVarInt(hostBuf.length),        // Server address string length
          hostBuf,                            // Server address string
          writeUInt16BE(port),                // Server port
          writeVarInt(1)                      // Next state: 1 = Status
        ]);
        // Prepend packet length
        socket.write(Buffer.concat([writeVarInt(handshakePayload.length), handshakePayload]));

        // --- Status Request Packet (ID 0x00) ---
        const requestPayload = writeVarInt(0x00); // Packet ID: Status Request
        socket.write(Buffer.concat([writeVarInt(requestPayload.length), requestPayload]));
      } catch (err) {
        fail('handshake error: ' + err.message);
      }
    });

    socket.on('data', (chunk) => {
      responseData = Buffer.concat([responseData, chunk]);

      try {
        let offset = 0;

        // Read packet length (VarInt)
        const packetLenResult = readVarInt(responseData, offset);
        const packetLength = packetLenResult.value;
        offset += packetLenResult.size;

        // Check if we have the full packet
        if (responseData.length < offset + packetLength) return; // Wait for more data

        // Read packet ID (VarInt)
        const packetIdResult = readVarInt(responseData, offset);
        const packetId = packetIdResult.value;
        offset += packetIdResult.size;

        if (packetId !== 0x00) {
          fail('unexpected packet id: ' + packetId);
          return;
        }

        // Read JSON string length (VarInt)
        const jsonLenResult = readVarInt(responseData, offset);
        const jsonLength = jsonLenResult.value;
        offset += jsonLenResult.size;

        // Check if we have the full JSON string
        if (responseData.length < offset + jsonLength) return; // Wait for more data

        // Parse JSON response
        const jsonStr = responseData.slice(offset, offset + jsonLength).toString('utf-8');
        const data = JSON.parse(jsonStr);

        const latency = Date.now() - startTime;

        // Extract MOTD (can be string or chat component object)
        let motd = '';
        if (typeof data.description === 'string') {
          motd = data.description;
        } else if (data.description && typeof data.description === 'object') {
          motd = data.description.text || '';
          // Handle extra components
          if (data.description.extra && Array.isArray(data.description.extra)) {
            motd += data.description.extra.map(c => c.text || '').join('');
          }
        }

        done({
          online: true,
          latency,
          players: {
            online: data.players?.online || 0,
            max: data.players?.max || 0,
            sample: (data.players?.sample || []).map(p => p.name)
          },
          version: data.version?.name || '',
          motd: motd.replace(/§[0-9a-fk-or]/gi, '') // Strip Minecraft color codes
        });
      } catch {
        // Incomplete data, wait for more chunks
      }
    });

    socket.on('close', () => {
      if (!resolved) fail('connection closed');
    });
  });
}

// ---- IPC Registration ----

module.exports = function (ipcMain) {
  ipcMain.handle('server:ping', async (_e, address) => {
    if (!address || typeof address !== 'string') {
      return { online: false, latency: -1, players: { online: 0, max: 0, sample: [] }, error: 'invalid address' };
    }

    const parts = address.split(':');
    const host = parts[0];
    const port = parseInt(parts[1]) || 25565;

    try {
      return await pingServer(host, port);
    } catch (err) {
      return { online: false, latency: -1, players: { online: 0, max: 0, sample: [] }, error: err.message };
    }
  });
};
