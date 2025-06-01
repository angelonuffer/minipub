# Minipub

Minipub é um servidor WebSocket com um protocolo publish/subscribe (pub/sub) binário minimalista.

## Protocolo de Comunicação

O protocolo de comunicação é binário e baseado em mensagens. Cada mensagem é prefixada por um byte que identifica seu tipo.

### Tipos de Mensagem

Existem três tipos de mensagem:

**1. Inscrever-se (Subscribe)**

* **Byte de Tipo:** `0`
* **Estrutura:**
    * Byte `0` (1 byte)
    * Tópico (128 bytes) - O tópico ao qual o cliente deseja se inscrever.
    * Mensagem de Saudação (restante da mensagem) - Uma mensagem a ser enviada para todos os outros clientes já inscritos no mesmo tópico.
* **Ação:** O cliente se inscreve no tópico especificado. A mensagem de saudação é enviada para todos os clientes atualmente inscritos nesse tópico.

**2. Publicar Mensagem (Publish)**

* **Byte de Tipo:** `1`
* **Estrutura:**
    * Byte `1` (1 byte)
    * Tópico (128 bytes) - O tópico para o qual a mensagem será publicada.
    * Mensagem (restante da mensagem) - O conteúdo da mensagem a ser enviada.
* **Ação:** A mensagem é enviada para todos os clientes inscritos no tópico especificado, *exceto* o próprio cliente que enviou a mensagem, mesmo que ele esteja inscrito.

**3. Desinscrever-se (Unsubscribe)**

* **Byte de Tipo:** `2`
* **Estrutura:**
    * Byte `2` (1 byte)
    * Tópico (128 bytes) - O tópico do qual o cliente deseja se desinscrever.
    * Mensagem de Despedida (restante da mensagem) - Uma mensagem a ser enviada para os clientes restantes inscritos no tópico.
* **Ação:** O cliente é desinscrito do tópico especificado. A mensagem de despedida é enviada para todos os clientes que permanecem inscritos nesse tópico.

## Como Rodar o Servidor

Para rodar o servidor Minipub, você precisará ter o [Node.js](https://nodejs.org/) instalado em sua máquina.

1.  **Instale as dependências:**
    Navegue até o diretório raiz do projeto e execute o comando abaixo para instalar as bibliotecas necessárias (como `ws` e `uuid`):
    ```bash
    npm install
    ```

2.  **Inicie o servidor:**
    Após a instalação das dependências, inicie o servidor com o seguinte comando:
    ```bash
    node server.js
    ```

O servidor WebSocket estará em execução e escutando em `ws://localhost:8080`.

## Conectando ao Servidor e Utilizando as Funcionalidades

Para interagir com o servidor Minipub, seu cliente WebSocket deve se conectar ao endereço `ws://localhost:8080`.

A comunicação é feita através de mensagens binárias, conforme detalhado na seção "Protocolo de Comunicação". Seu cliente precisará construir e enviar essas mensagens como `Buffer` ou `Uint8Array`.

Aqui está um exemplo conceitual de como um cliente poderia interagir com o servidor:

1.  **Inscrever-se em um Tópico:**
    *   Para se inscrever no tópico "noticias", o cliente enviaria uma mensagem binária composta por:
        *   Byte de Tipo: `0` (Subscribe)
        *   Tópico: "noticias" (UTF-8, preenchido com nulos até 128 bytes)
        *   Mensagem de Saudação: "Olá, sou um novo inscrito!" (UTF-8)

2.  **Publicar uma Mensagem:**
    *   Para publicar "Nova atualização importante!" no tópico "noticias", o cliente enviaria:
        *   Byte de Tipo: `1` (Publish)
        *   Tópico: "noticias" (UTF-8, preenchido com nulos até 128 bytes)
        *   Mensagem: "Nova atualização importante!" (UTF-8)

3.  **Receber Mensagens:**
    *   O cliente deve estar preparado para receber mensagens binárias do servidor. Estas podem ser saudações de outros clientes, mensagens publicadas nos tópicos inscritos ou mensagens de despedida. O conteúdo da mensagem recebida será o payload original enviado por outro cliente.

### Exemplo de Cliente JavaScript (Navegador)

Abaixo está um exemplo de como um cliente JavaScript, rodando em um navegador, poderia se conectar e interagir com o servidor Minipub. Você pode salvar este código como um arquivo `.js` e incluí-lo em uma página HTML.

```javascript
// Minipub WebSocket Client Example for Browsers

// Configuration
const SERVER_URL = 'ws://localhost:8080';
const TOPIC_GENERAL = 'general';

// --- WebSocket Connection ---
const socket = new WebSocket(SERVER_URL);
socket.binaryType = 'arraybuffer'; // Important for receiving binary data

socket.onopen = () => {
    console.log('WebSocket connection established.');

    // 3. Subscribe to a topic upon connection
    const greetingMessage = 'Hello from browser client!';
    const subscribeMsg = encodeMessage(0, TOPIC_GENERAL, greetingMessage);
    if (subscribeMsg) {
        socket.send(subscribeMsg);
        console.log(`Sent SUBSCRIBE to topic "${TOPIC_GENERAL}" with greeting: "${greetingMessage}"`);
    }

    // 4. Publish a message after a delay
    setTimeout(() => {
        const publishPayload = 'This is a test message to the general topic!';
        const publishMsg = encodeMessage(1, TOPIC_GENERAL, publishPayload);
        if (publishMsg) {
            socket.send(publishMsg);
            console.log(`Sent PUBLISH to topic "${TOPIC_GENERAL}" with message: "${publishPayload}"`);
        }
    }, 2000); // 2-second delay
};

socket.onerror = (error) => {
    console.error('WebSocket Error:', error);
};

socket.onclose = (event) => {
    console.log('WebSocket connection closed:', event.code, event.reason);
};

// --- Message Encoding Function ---
/**
 * Encodes a message for the Minipub server.
 * @param {number} type - Message type (0: Subscribe, 1: Publish, 2: Unsubscribe).
 * @param {string} topic - The topic string (max 128 bytes UTF-8).
 * @param {string} payloadString - The payload string.
 * @returns {ArrayBuffer | null} - The encoded message as an ArrayBuffer, or null on error.
 */
function encodeMessage(type, topic, payloadString) {
    try {
        // 1-byte buffer for type
        const typeBuffer = new Uint8Array([type]).buffer;

        // 128-byte buffer for topic
        const topicBuffer = new ArrayBuffer(128);
        const topicView = new Uint8Array(topicBuffer);
        const encodedTopic = new TextEncoder().encode(topic);
        if (encodedTopic.length > 128) {
            console.error('Topic string is too long (max 128 bytes UTF-8).');
            return null;
        }
        topicView.set(encodedTopic); // Copies encodedTopic into topicBuffer, padding with 0s

        // Buffer for payload
        const payloadBuffer = new TextEncoder().encode(payloadString).buffer;

        // Concatenate buffers
        const totalLength = typeBuffer.byteLength + topicBuffer.byteLength + payloadBuffer.byteLength;
        const messageArrayBuffer = new ArrayBuffer(totalLength);
        const messageView = new Uint8Array(messageArrayBuffer);

        let offset = 0;
        messageView.set(new Uint8Array(typeBuffer), offset);
        offset += typeBuffer.byteLength;
        messageView.set(new Uint8Array(topicBuffer), offset);
        offset += topicBuffer.byteLength;
        messageView.set(new Uint8Array(payloadBuffer), offset);

        return messageArrayBuffer;
    } catch (e) {
        console.error("Error encoding message:", e);
        return null;
    }
}

// --- Receiving Messages ---
socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
        console.log('Received binary message from server.');
        // For simplicity, this example assumes the *entire* received message is the payload.
        // A real client would parse the type and topic from the incoming message if needed.
        // We also skip the first 129 bytes (type + topic) to get to the payload.

        const receivedBuffer = event.data;
        if (receivedBuffer.byteLength > 129) {
            const payloadArrayBuffer = receivedBuffer.slice(129); // Skip type (1 byte) and topic (128 bytes)
            try {
                const payloadString = new TextDecoder('utf-8').decode(payloadArrayBuffer);
                console.log('Received Payload:', payloadString);
            } catch (e) {
                console.error('Error decoding received message payload:', e);
                // Fallback: log as hex if decoding fails
                const hexPayload = Array.from(new Uint8Array(payloadArrayBuffer)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                console.log('Received Payload (hex):', hexPayload);
            }
        } else if (receivedBuffer.byteLength > 0) {
            // If message is too short to contain our expected type+topic+payload structure,
            // it might be a different kind of message or an error.
            // For now, just try to decode the whole thing if it's not empty.
             try {
                const payloadString = new TextDecoder('utf-8').decode(receivedBuffer);
                console.log('Received (short) Message / Payload:', payloadString);
            } catch (e) {
                console.error('Error decoding short received message:', e);
            }
        } else {
            console.log('Received an empty message.');
        }
    } else {
        // This case should ideally not happen if server sends binary as configured
        console.log('Received non-binary message:', event.data);
    }
};

console.log('Minipub client script loaded. Attempting to connect...');
// To use this script:
// 1. Save it as a .js file (e.g., minipub_client.js).
// 2. Include it in an HTML file: <script src="minipub_client.js"></script>
// 3. Open the HTML file in a browser with the developer console open.
// 4. Ensure your Minipub server is running on ws://localhost:8080.
```

Para uma descrição completa da estrutura da mensagem, incluindo como o tópico e o payload devem ser formatados, consulte a seção "Protocolo de Comunicação".
