/**
 * Error handler for WhatsApp Shop Bot
 * Provides standardized error handling and recovery
 */

const settings = require('../settings.json');

/**
 * Handles operational errors during bot execution
 * @param {Error} error - The error object
 * @param {object} sock - The WhatsApp socket connection
 * @param {string} sender - The user's WhatsApp ID
 */
async function handleOperationalError(error, sock, sender) {
  console.error('Operational Error:', error.message);
  
  try {
    // Send friendly error message to user
    await sock.sendMessage(sender, { 
      text: settings.messages.errorMessage || 'Sorry, something went wrong. Please try again or type "menu" to restart.'
    });
  } catch (sendError) {
    console.error('Failed to send error message:', sendError);
  }
}

/**
 * Handles critical errors that might affect bot functioning
 * @param {Error} error - The error object
 */
function handleCriticalError(error) {
  console.error('CRITICAL ERROR:', error);
  // Could implement notification system here (email/SMS to admin)
}

/**
 * Logs all errors to console with additional context
 * @param {Error} error - The error object
 * @param {string} context - Where the error occurred
 */
function logError(error, context) {
  console.error(`Error in ${context}:`, {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
}

/**
 * Attempts to recover from common error scenarios
 * @param {Error} error - The error object
 * @param {object} userSession - The user's session data
 * @returns {object} Updated session if recovery performed
 */
function attemptRecovery(error, userSession) {
  // Handle common session corruption
  if (error.message.includes('session') && userSession) {
    console.log('Attempting session recovery...');
    
    // Basic session repair
    const repairedSession = {
      ...userSession,
      state: userSession.lastState || 'initial',
      lastInteraction: Date.now()
    };
    
    return repairedSession;
  }
  
  // Handle cart corruption
  if (error.message.includes('cart') && userSession) {
    console.log('Attempting cart recovery...');
    return {
      ...userSession,
      cart: [],
      state: 'main_menu',
      lastInteraction: Date.now()
    };
  }
  
  return null;
}

module.exports = {
  handleOperationalError,
  handleCriticalError,
  logError,
  attemptRecovery
};
