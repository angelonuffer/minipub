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

## Gerenciamento de Estado com `handleMessage`

O núcleo da lógica de pub/sub é gerenciado por uma função pura chamada `handleMessage`. Essa função é responsável por atualizar o estado da aplicação com base nas mensagens recebidas dos clientes.

### Definição da Função

```javascript
/**
 * Processa uma mensagem recebida e retorna o novo estado da aplicação.
 * Esta é uma função pura, o que significa que não modifica o estado original.
 *
 * @param {object} state - O estado atual da aplicação.
 * @param {string|number} client - Um identificador único para o cliente que enviou a mensagem.
 * @param {Buffer|Uint8Array} message - A mensagem binária recebida do cliente.
 * @returns {object} - O novo estado da aplicação após processar a mensagem.
 */
function handleMessage(state, client, message) {
  // ... lógica de processamento ...
}
```

### Estrutura do Estado (`state`)

O objeto de estado (`state`) possui a seguinte estrutura:

```javascript
{
  clients: [], // Array de IDs de todos os clientes únicos que interagiram com o servidor.
  topics: {},    // Objeto onde as chaves são nomes de tópicos (strings) e os
                 // valores são arrays de IDs de clientes inscritos naquele tópico.
  messagesToSend: [] // Array de objetos, cada um representando uma mensagem que precisa ser
                     // enviada a um cliente. Cada objeto tem a forma:
                     // { destination: clientID, message: Buffer }
}
```

*   **`clients`**: Uma lista de todos os identificadores de clientes únicos (ex: `['client1', 'client2']`). Um cliente é adicionado a esta lista na sua primeira operação de subscribe ou publish bem-sucedida.
*   **`topics`**: Um dicionário onde cada chave é o nome de um tópico (ex: `"news"`, `"sports"`) e o valor é uma lista dos IDs dos clientes inscritos nesse tópico (ex: `{"news": ["client1", "client3"]}`).
*   **`messagesToSend`**: Uma lista de mensagens que o servidor deve enviar aos clientes. Cada item na lista é um objeto com:
    *   `destination`: O ID do cliente que deve receber a mensagem.
    *   `message`: O conteúdo da mensagem (um `Buffer`) a ser enviado.

### Mensagem de Entrada (`message`)

A `message` é um `Buffer` (ou `Uint8Array`) que segue o protocolo binário definido anteriormente:

*   **Byte 0**: Tipo da mensagem (`0` para Subscribe, `1` para Publish, `2` para Unsubscribe).
*   **Bytes 1-128**: Nome do tópico (UTF-8, 128 bytes, preenchido com nulos se menor).
*   **Bytes 129 em diante**: Payload da mensagem (saudação, mensagem a ser publicada, ou despedida).

### Exemplo de Uso (Conceitual)

```javascript
const { getInitialState, handleMessage } = require('./minipub');

let currentState = getInitialState();
const clientA = 'client-a';
const clientB = 'client-b';

// Client A se inscreve no tópico 'updates'
// Mensagem de Subscribe: Tipo 0, Tópico 'updates', Saudação 'Client A joining!'
const topicA = 'updates';
const greetingA = 'Client A joining!';
const topicABuffer = Buffer.alloc(128);
topicABuffer.write(topicA, 'utf-8');
const greetingABuffer = Buffer.from(greetingA, 'utf-8');
const subscribeMessageA = Buffer.concat([Buffer.from([0]), topicABuffer, greetingABuffer]);

currentState = handleMessage(currentState, clientA, subscribeMessageA);
// currentState agora reflete clientA inscrito em 'updates'.
// currentState.messagesToSend estará vazio, pois não havia outros inscritos.

// Client B se inscreve no tópico 'updates'
const greetingB = 'Client B says hello!';
const topicBBuffer = Buffer.alloc(128);
topicBBuffer.write(topicA, 'utf-8'); // Mesmo tópico 'updates'
const greetingBBuffer = Buffer.from(greetingB, 'utf-8');
const subscribeMessageB = Buffer.concat([Buffer.from([0]), topicBBuffer, greetingBBuffer]);

currentState = handleMessage(currentState, clientB, subscribeMessageB);
// currentState.topics['updates'] agora inclui clientA e clientB.
// currentState.messagesToSend conterá uma mensagem de greetingB para clientA.
// console.log(currentState.messagesToSend);
// [{ destination: 'client-a', message: <Buffer 43 6c 69 65 ... > ('Client B says hello!') }]

// Client A publica uma mensagem no tópico 'updates'
const publishPayloadA = 'Important update for everyone!';
const publishPayloadABuffer = Buffer.from(publishPayloadA, 'utf-8');
const publishMessageA = Buffer.concat([Buffer.from([1]), topicABuffer, publishPayloadABuffer]);

currentState = handleMessage(currentState, clientA, publishMessageA);
// currentState.messagesToSend (após limpar as anteriores) conterá uma mensagem de publishPayloadA para clientB.
// console.log(currentState.messagesToSend);
// [{ destination: 'client-b', message: <Buffer 49 6d 70 6f ... > ('Important update for everyone!') }]
```

Esta função `handleMessage`, junto com `getInitialState`, forma a base para um servidor Minipub que pode ser facilmente testado e integrado.
