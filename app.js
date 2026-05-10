let port;
let reader;
let writer;
let keepReading = false;

const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const sendBtn = document.getElementById("sendBtn");
const output = document.getElementById("output");
const messageInput = document.getElementById("messageInput");

function log(message) {
  output.textContent += message + "\n";
  output.scrollTop = output.scrollHeight;
}

connectBtn.addEventListener("click", async () => {
  if (!("serial" in navigator)) {
    alert("Web Serial API is not supported in this browser.");
    return;
  }

  try {
    // Ask user to select serial device
    port = await navigator.serial.requestPort();

    // Open serial port
    await port.open({
      baudRate: 9600,
    });

    log("Connected to serial device.");

    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    sendBtn.disabled = false;

    keepReading = true;

    // Setup text decoder
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);

    reader = textDecoder.readable.getReader();

    readLoop();
  } catch (err) {
    console.error(err);
    log("Connection error: " + err.message);
  }
});

async function readLoop() {
  try {
    while (keepReading) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        log("RX: " + value);
      }
    }
  } catch (err) {
    console.error(err);
    log("Read error: " + err.message);
  }
}

sendBtn.addEventListener("click", async () => {
  const message = messageInput.value;

  if (!message || !port?.writable) {
    return;
  }

  try {
    const encoder = new TextEncoder();
    writer = port.writable.getWriter();

    await writer.write(encoder.encode(message + "\n"));

    log("TX: " + message);

    writer.releaseLock();

    messageInput.value = "";
  } catch (err) {
    console.error(err);
    log("Write error: " + err.message);
  }
});

disconnectBtn.addEventListener("click", async () => {
  try {
    keepReading = false;

    if (reader) {
      await reader.cancel();
      reader.releaseLock();
    }

    if (port) {
      await port.close();
    }

    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    sendBtn.disabled = true;

    log("Disconnected.");
  } catch (err) {
    console.error(err);
    log("Disconnect error: " + err.message);
  }
});
