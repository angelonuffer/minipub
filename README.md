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
