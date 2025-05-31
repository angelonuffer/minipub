// minipub.js
function getInitialState() {
  return {
    clients: [], // list of all unique client IDs that have interacted
    topics: {},    // keys are topic strings, values are arrays of client IDs
    messagesToSend: [] // array of { destination: clientID, message: Buffer }
  };
}

function handleMessage(state, client, message) {
  // Deep clone state to ensure purity
  // Correct approach for deep cloning with Buffers:
  const newState = {
    clients: [...state.clients],
    topics: {},
    messagesToSend: state.messagesToSend.map(msg => ({
      destination: msg.destination,
      // Assuming msg.message is already a Buffer or acts like one for this step.
      // If it's stringified in JSON, this needs to be Buffer.from(msg.message.data) if msg.message was a Buffer
      // or handle it as a string if the interpretation is that messages become strings in the state.
      // Given the problem, they should remain binary.
      // For now, let's assume message content in messagesToSend will be passed through as is.
      message: msg.message
    }))
  };
  for (const topic in state.topics) {
    newState.topics[topic] = [...state.topics[topic]];
  }


  if (!(message instanceof Uint8Array) && !(message instanceof Buffer)) {
    // This check is important if the message comes from a source that might not provide a Buffer directly.
    // For testing, we'll likely pass Buffers.
    console.error("Message is not a Buffer or Uint8Array");
    return newState; // Or throw an error
  }

  const messageType = message[0];
  // Use TextDecoder for robust UTF-8 decoding, and trim null characters.
  const topicDecoder = new TextDecoder('utf-8');
  // Extract topic (128 bytes after the type byte)
  const topicString = topicDecoder.decode(message.subarray(1, 1 + 128)).replace(/\0/g, '').trim();
  // Payload is the rest of the message after the topic
  const payload = message.subarray(1 + 128); // This is a Buffer/Uint8Array

  switch (messageType) {
    case 0: // Subscribe
      {
        // Add client to global client list if not already present
        if (!newState.clients.includes(client)) {
          newState.clients.push(client);
        }

        const greetingMessage = payload; // Payload is the greeting message
        if (!newState.topics[topicString]) {
          newState.topics[topicString] = [];
        }
        const topicClients = newState.topics[topicString];
        // Send greeting to existing subscribers
        topicClients.forEach(existingClient => {
          if (existingClient !== client) {
            newState.messagesToSend.push({ destination: existingClient, message: greetingMessage });
          }
        });
        // Add client to topic if not already subscribed
        if (!topicClients.includes(client)) {
          topicClients.push(client);
        }
      }
      break;
    case 1: // Publish
      {
        // Add client to global client list if not already present,
        // as publishing implies activity.
        if (!newState.clients.includes(client)) {
          newState.clients.push(client);
        }

        const publishMessage = payload; // Payload is the message to publish
        const topicClients = newState.topics[topicString];
        if (topicClients) {
          topicClients.forEach(subscribedClient => {
            if (subscribedClient !== client) { // Do not send to self
              newState.messagesToSend.push({ destination: subscribedClient, message: publishMessage });
            }
          });
        }
      }
      break;
    case 2: // Unsubscribe
      {
        const farewellMessage = payload; // Payload is the farewell message
        const topicClients = newState.topics[topicString];
        if (topicClients) {
          const clientIndex = topicClients.indexOf(client);
          if (clientIndex > -1) {
            // Announce farewell to others *before* removing the client from the list for this topic
            topicClients.forEach(subscribedClient => {
              if (subscribedClient !== client) {
                newState.messagesToSend.push({ destination: subscribedClient, message: farewellMessage });
              }
            });
            // Remove client from topic
            topicClients.splice(clientIndex, 1);
            // Optional: Clean up topic if empty
            if (topicClients.length === 0) {
              delete newState.topics[topicString];
            }
          }
        }
      }
      break;
    default:
      // Unknown message type, maybe log an error or ignore
      console.warn(`Unknown message type: ${messageType}`);
  }
  return newState;
}

// Export for use in Node.js environment (e.g., tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getInitialState, handleMessage };
}
