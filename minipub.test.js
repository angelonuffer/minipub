const { getInitialState, handleMessage } = require('./minipub');
const { TextEncoder, TextDecoder } = require('util'); // For decoding message payloads in assertions

// Helper function to create messages
function createMessage(type, topic, payloadString) {
  const topicBuffer = Buffer.alloc(128);
  const encoder = new TextEncoder();
  const topicBytes = encoder.encode(topic);
  topicBuffer.set(topicBytes); // Writes topic bytes, rest remains nulls

  const payloadBuffer = Buffer.from(payloadString, 'utf8');
  return Buffer.concat([Buffer.from([type]), topicBuffer, payloadBuffer]);
}

describe('MiniPub State Management', () => {
  let state;

  beforeEach(() => {
    state = getInitialState();
  });

  // Test initial state
  test('should return a valid initial state', () => {
    expect(state).toEqual({
      clients: [],
      topics: {},
      messagesToSend: [],
    });
  });

  // Subscribe tests
  describe('Subscribe (type 0)', () => {
    test('should allow a client to subscribe to a new topic and add client to list', () => {
      const message = createMessage(0, 'news', 'Client1 joining news');
      const newState = handleMessage(state, 'client1', message);
      expect(newState.topics.news).toContain('client1');
      expect(newState.clients).toContain('client1');
      expect(newState.messagesToSend).toEqual([]); // No one else to send greeting to
    });

    test('should send greeting message to existing subscribers when a new client subscribes', () => {
      // client1 subscribes first
      let s1 = handleMessage(state, 'client1', createMessage(0, 'sports', 'Client1 joining sports'));
      // client2 subscribes
      const greetingPayload = 'Client2 says hi to sports fans';
      const message = createMessage(0, 'sports', greetingPayload);
      const s2 = handleMessage(s1, 'client2', message);

      expect(s2.topics.sports).toContain('client1');
      expect(s2.topics.sports).toContain('client2');
      expect(s2.messagesToSend.length).toBe(1);
      expect(s2.messagesToSend[0].destination).toBe('client1');
      const decoder = new TextDecoder();
      expect(decoder.decode(s2.messagesToSend[0].message)).toBe(greetingPayload);
    });

    test('should not send greeting to self on subscribe', () => {
        // client1 subscribes to 'general'
        state = handleMessage(state, 'client1', createMessage(0, 'general', 'Client1 joining'));
        // client2 subscribes to 'general', client1 gets a greeting
        state = handleMessage(state, 'client2', createMessage(0, 'general', 'Client2 joining'));
        state.messagesToSend = []; // Clear messages

        // client1 re-subscribes (or sends another subscribe message) to 'general'
        const resubscribeGreeting = 'Client1 re-joining, should not receive this';
        const messageClient1Again = createMessage(0, 'general', resubscribeGreeting);
        const finalState = handleMessage(state, 'client1', messageClient1Again);

        // Check messages for client2 (should get the new greeting from client1)
        const client2Messages = finalState.messagesToSend.filter(m => m.destination === 'client2');
        expect(client2Messages.length).toBe(1);
        const decoder = new TextDecoder();
        expect(decoder.decode(client2Messages[0].message)).toBe(resubscribeGreeting);

        // Ensure client1 did not get a message to self from its own re-subscribe action
        const client1Messages = finalState.messagesToSend.filter(m => m.destination === 'client1');
        expect(client1Messages.length).toBe(0);
    });


    test('should handle subscribing to multiple topics', () => {
      state = handleMessage(state, 'client1', createMessage(0, 'topic1', 'hi topic1'));
      const newState = handleMessage(state, 'client1', createMessage(0, 'topic2', 'hi topic2'));
      expect(newState.topics.topic1).toContain('client1');
      expect(newState.topics.topic2).toContain('client1');
    });
  });

  // Publish tests
  describe('Publish (type 1)', () => {
    beforeEach(() => {
      // client1 and client2 subscribe to 'updates'
      state = handleMessage(state, 'client1', createMessage(0, 'updates', 'c1 joins updates'));
      state = handleMessage(state, 'client2', createMessage(0, 'updates', 'c2 joins updates'));
      // client3 subscribes to 'general'
      state = handleMessage(state, 'client3', createMessage(0, 'general', 'c3 joins general'));
      state.messagesToSend = []; // Clear setup messages
    });

    test('should send message to all clients in a topic except sender', () => {
      const publishPayload = 'Big news update!';
      const message = createMessage(1, 'updates', publishPayload);
      const newState = handleMessage(state, 'client1', message);

      expect(newState.messagesToSend.length).toBe(1);
      expect(newState.messagesToSend[0].destination).toBe('client2');
      const decoder = new TextDecoder();
      expect(decoder.decode(newState.messagesToSend[0].message)).toBe(publishPayload);
    });

    test('should not send to clients in other topics', () => {
      const message = createMessage(1, 'updates', 'Only for updates topic');
      const newState = handleMessage(state, 'client1', message);
      const destinations = newState.messagesToSend.map(m => m.destination);
      expect(destinations).not.toContain('client3');
    });

    test('should not send if no other clients are subscribed to the topic', () => {
      // client1 subscribes to 'solo'
      state = handleMessage(getInitialState(), 'client1', createMessage(0, 'solo', 'c1 joins solo'));
      state.messagesToSend = [];

      const message = createMessage(1, 'solo', 'Hello anyone?');
      const newState = handleMessage(state, 'client1', message);
      expect(newState.messagesToSend.length).toBe(0);
    });

     test('should do nothing if publishing to a non-existent topic', () => {
      const message = createMessage(1, 'ghost-topic', 'echo?');
      const newState = handleMessage(state, 'client1', message);
      expect(newState.messagesToSend.length).toBe(0);
    });
  });

  // Unsubscribe tests
  describe('Unsubscribe (type 2)', () => {
    beforeEach(() => {
      state = handleMessage(state, 'client1', createMessage(0, 'news', 'c1 joins news'));
      state = handleMessage(state, 'client2', createMessage(0, 'news', 'c2 joins news'));
      state = handleMessage(state, 'client3', createMessage(0, 'news', 'c3 joins news'));
      state.messagesToSend = []; // Clear setup messages
    });

    test('should remove client from topic and send farewell to remaining subscribers', () => {
      const farewellPayload = 'Client2 signing off from news';
      const message = createMessage(2, 'news', farewellPayload);
      const newState = handleMessage(state, 'client2', message);

      expect(newState.topics.news).not.toContain('client2');
      expect(newState.topics.news).toContain('client1');
      expect(newState.topics.news).toContain('client3');

      expect(newState.messagesToSend.length).toBe(2);
      const destinations = newState.messagesToSend.map(m => m.destination);
      expect(destinations).toContain('client1');
      expect(destinations).toContain('client3');
      const decoder = new TextDecoder();
      newState.messagesToSend.forEach(msg => {
        expect(decoder.decode(msg.message)).toBe(farewellPayload);
      });
    });

    test('should remove topic if last client unsubscribes', () => {
      // c1 and c2 subscribe to 'temp'
      let tempState = handleMessage(getInitialState(), 'client1', createMessage(0, 'temp', 'c1 joins'));
      tempState = handleMessage(tempState, 'client2', createMessage(0, 'temp', 'c2 joins'));
      tempState.messagesToSend = [];

      // c1 unsubscribes
      tempState = handleMessage(tempState, 'client1', createMessage(2, 'temp', 'c1 leaves'));
      // c2 unsubscribes
      const finalState = handleMessage(tempState, 'client2', createMessage(2, 'temp', 'c2 leaves'));

      expect(finalState.topics.temp).toBeUndefined();
    });

    test('should not send farewell if no other clients are in topic when unsubscribing', () => {
        // client1 subscribes to 'lonely'
        let lonelyState = handleMessage(getInitialState(), 'client1', createMessage(0, 'lonely', 'c1 joins'));
        lonelyState.messagesToSend = []; // Clear greeting

        const message = createMessage(2, 'lonely', 'Client1 leaving lonely');
        const newState = handleMessage(lonelyState, 'client1', message);

        expect(newState.topics.lonely).toBeUndefined(); // Topic should be removed
        expect(newState.messagesToSend.length).toBe(0); // No one to send farewell to
    });

    test('should do nothing if unsubscribing from a non-subscribed topic or non-existent topic', () => {
      const stateBefore = JSON.parse(JSON.stringify(state)); // Deep clone for comparison
      const message = createMessage(2, 'random-topic', 'Leaving non-existent topic');
      const newState = handleMessage(state, 'client4', message); // client4 is not in 'news' or any topic

      expect(newState.topics.news).toEqual(stateBefore.topics.news);
      expect(newState.clients).toEqual(stateBefore.clients); // No new client from this action
      expect(newState.messagesToSend.length).toBe(0);

      // Try unsubscribing client1 from a topic they are not in
      const message2 = createMessage(2, 'other-topic', 'Client1 leaving other-topic');
      const newState2 = handleMessage(state, 'client1', message2);
      expect(newState2.topics.news).toContain('client1'); // Still in 'news'
      expect(newState2.messagesToSend.length).toBe(0);

    });
  });

  // Test client list
   test('client list should correctly track all unique clients that interact', () => {
    state = handleMessage(state, 'userA', createMessage(0, 'general', 'UserA joins'));
    state = handleMessage(state, 'userB', createMessage(0, 'general', 'UserB joins'));
    state = handleMessage(state, 'userA', createMessage(0, 'news', 'UserA joins news too')); // userA interacts again
    // userC publishes without explicit subscribe, should still be added to known clients
    state = handleMessage(state, 'userC', createMessage(1, 'general', 'UserC posts to general'));


    expect(state.clients).toContain('userA');
    expect(state.clients).toContain('userB');
    expect(state.clients).toContain('userC');
    // Ensure unique clients
    const uniqueClients = new Set(state.clients);
    expect(state.clients.length).toBe(uniqueClients.size);
    expect(state.clients.length).toBe(3); // Based on the operations above
  });

  // Test message structure and purity
  test('handleMessage should be a pure function and not modify original state', () => {
    const originalState = getInitialState();
    const originalStateDeepClone = JSON.parse(JSON.stringify(originalState)); // For comparison
    originalStateDeepClone.clients.push('testClient'); // A known state for originalState

    const message = createMessage(0, 'purity_test', 'Testing purity');
    // Pass a clone of originalStateDeepClone to handleMessage if we want to ensure originalState is untouched
    // but the function itself should handle cloning the state it receives.
    const newState = handleMessage(originalStateDeepClone, 'clientX', message);

    // Verify originalState (or its clone passed to function) is unchanged
    expect(originalStateDeepClone.clients).toEqual(['testClient']);
    expect(originalStateDeepClone.topics).toEqual({});
    // Verify new state has changes
    expect(newState.topics.purity_test).toContain('clientX');
  });

  test('messages in messagesToSend should have correct structure and payload type (Buffer)', () => {
    state = handleMessage(state, 'sender', createMessage(0, 'chat', 'Sender joins'));
    state.messagesToSend = []; // Clear join messages
    const greetingPayload = 'Receiver says hi to sender';
    const message = createMessage(0, 'chat', greetingPayload);
    state = handleMessage(state, 'receiver', message); // receiver joins, sender gets greeting

    expect(state.messagesToSend.length).toBe(1);
    const sentMsg = state.messagesToSend[0];
    expect(sentMsg).toHaveProperty('destination', 'sender');
    expect(sentMsg).toHaveProperty('message');
    expect(sentMsg.message instanceof Buffer).toBe(true); // Check if it's a Buffer
    const decoder = new TextDecoder();
    expect(decoder.decode(sentMsg.message)).toBe(greetingPayload);
  });
});
