const fs = require('fs');
const https = require('https');
const path = require('path');

/**
 * Manages user sessions and data persistence
 */
function sessionManager(jid) {
  const sessionPath = path.join(__dirname, 'user_sessions', `${jid}.json`);
  
  return {
    save: (data) => {
      try {
        fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));
        return true;
      } catch (error) {
        console.error('Error saving session:', error);
        return false;
      }
    },
    
    load: () => {
      try {
        if (fs.existsSync(sessionPath)) {
          return JSON.parse(fs.readFileSync(sessionPath));
        }
        return null;
      } catch (error) {
        console.error('Error loading session:', error);
        return null;
      }
    },
    
    delete: () => {
      try {
        if (fs.existsSync(sessionPath)) {
          fs.unlinkSync(sessionPath);
        }
        return true;
      } catch (error) {
        console.error('Error deleting session:', error);
        return false;
      }
    }
  };
}

/**
 * Sets up or retrieves user session
 */
async function setupUserSession(jid) {
  const session = sessionManager(jid);
  let userSession = session.load();
  
  if (!userSession) {
    userSession = {
      state: 'initial',
      cart: [],
      lastInteraction: Date.now(),
      lastState: 'initial'
    };
    session.save(userSession);
  }
  
  return userSession;
}

/**
 * Updates user session data
 */
async function updateUserSession(jid, data) {
  const session = sessionManager(jid);
  return session.save(data);
}

/**
 * Gets current user session
 */
async function getUserSession(jid) {
  const session = sessionManager(jid);
  return session.load();
}

/**
 * Fetches an image from URL and returns buffer
 */
async function getImageAsBuffer(url) {
  return new Promise((resolve, reject) => {
    // If URL is not provided or invalid, return null
    if (!url || !url.startsWith('http')) {
      resolve(null);
      return;
    }

    https.get(url, (response) => {
      const chunks = [];
      
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      response.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      response.on('error', (error) => {
        console.error('Error fetching image:', error);
        resolve(null);
      });
    }).on('error', (error) => {
      console.error('Error fetching image:', error);
      resolve(null);
    });
  });
}

/**
 * Creates directory if it doesn't exist
 */
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

// Create necessary directories
ensureDirectoryExists(path.join(__dirname, 'sessions'));
ensureDirectoryExists(path.join(__dirname, 'user_sessions'));

module.exports = {
  sessionManager,
  setupUserSession,
  getUserSession,
  updateUserSession,
  getImageAsBuffer
};