function normalizeIncomingMessage(message) {
  if (
    !message ||
    typeof message !== "object" ||
    typeof message.v !== "string" ||
    typeof message.type !== "string" ||
    !message.payload ||
    typeof message.payload !== "object" ||
    Array.isArray(message.payload)
  ) {
    return message;
  }

  return {
    ...message.payload,
    type: message.type,
    ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
    ...(message.sequence === undefined ? {} : { sequence: message.sequence }),
  };
}

function withEnvelopeCompatibility(HandlerClass) {
  return class EnvelopeCompatibleHandler extends HandlerClass {
    handleMessage(socket, message) {
      return super.handleMessage(socket, normalizeIncomingMessage(message));
    }
  };
}

module.exports = { normalizeIncomingMessage, withEnvelopeCompatibility };
