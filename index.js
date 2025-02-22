const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { sessionManager, setupUserSession, getUserSession, updateUserSession } = require('./utils');
const { handleMainMenu, handleCategorySelection, handleItemSelection, handleCart, handleCheckout, handleSearch } = require('./features/shopCommands');
const settings = require('./settings.json');

// Ensure necessary directories exist
const dirs = ['./sessions', './user_sessions', './features', './assets'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function connectToWhatsApp() {
  // Load authentication state properly
  const { state, saveCreds } = await useMultiFileAuthState('sessions');

  // Create WhatsApp connection
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Scan the QR code below to login:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed due to', lastDisconnect?.error);

      if (shouldReconnect) {
        connectToWhatsApp();
      }
    }

    if (connection === 'open') {
      console.log('WhatsApp connection established!');
      console.log(`Bot ${settings.botName} is now online`);
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      if (message.key.fromMe || !message.message) continue;

      const sender = message.key.remoteJid;
      const senderName = message.pushName || 'User';
      const messageContent = message.message.conversation || 
                            (message.message.extendedTextMessage && 
                             message.message.extendedTextMessage.text) || '';

      // Begin typing indicator
      await sock.sendPresenceUpdate('composing', sender);

      // Initialize or get user session
      const userSession = await setupUserSession(sender);

      // Wait for "typing" effect (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        let response;

        // Handle menu command FIRST
        if (messageContent.toLowerCase() === 'menu') {
          await updateUserSession(sender, {
            state: 'main_menu',
            currentCategory: null,
            currentItem: null,
            cart: []
          });
          response = await handleMainMenu(senderName);
          await sock.sendMessage(sender, response);
          continue;
        }

        // Handle returning users
        if (userSession.lastInteraction && 
            Date.now() - userSession.lastInteraction > 3600000 && 
            userSession.lastState !== 'initial') {
          await sock.sendMessage(sender, { text: `Welcome back ${senderName}! Would you like to continue where you left off or start over?\n1. Continue\n2. Start Over` });
          userSession.tempState = 'returning';
          await updateUserSession(sender, userSession);
          continue;
        }

        if (userSession.tempState === 'returning') {
          if (messageContent === '1' || messageContent.toLowerCase() === 'continue') {
            userSession.tempState = null;
          } else {
            userSession.state = 'initial';
            userSession.cart = [];
            userSession.tempState = null;
          }
          await updateUserSession(sender, userSession);
        }

        // Process user state
        switch (userSession.state) {
          case 'initial':
            response = await handleMainMenu(senderName);
            userSession.state = 'main_menu';
            break;

          case 'main_menu':
            if (messageContent.toLowerCase() === 'search') {
              await sock.sendMessage(sender, { text: 'Please enter a keyword to search for products:' });
              userSession.state = 'searching';
            } else {
              const categoryResponse = await handleCategorySelection(messageContent);
              response = categoryResponse;
              if (categoryResponse.success) {
                userSession.state = 'category_selected';
                userSession.currentCategory = categoryResponse.categoryName;
              }
            }
            break;

          case 'searching':
            response = await handleSearch(messageContent);
            userSession.state = 'search_results';
            break;

          case 'search_results':
          case 'category_selected':
            response = await handleItemSelection(messageContent, userSession.currentCategory);
            if (response.success) {
              userSession.state = 'item_selected';
              userSession.currentItem = response.item;
            }
            break;

          case 'item_selected':
            const [quantity, size, color] = messageContent.split(',').map(item => item.trim());
            
            if (!quantity || isNaN(parseInt(quantity))) {
              await sock.sendMessage(sender, { text: 'Please specify quantity, size, and color (e.g. "2,L,blue"):' });
              break;
            }

            if (!userSession.cart) userSession.cart = [];
            userSession.cart.push({
              item: userSession.currentItem,
              quantity: parseInt(quantity),
              size: size || 'Standard',
              color: color || 'Default'
            });

            response = await handleCart(userSession.cart);
            userSession.state = 'cart';
            break;

          case 'cart':
            if (messageContent.toLowerCase() === 'checkout') {
              response = await handleCheckout(userSession.cart, senderName);
              userSession.state = 'checkout';
            } else if (messageContent.toLowerCase() === 'continue') {
              response = await handleMainMenu(senderName);
              userSession.state = 'main_menu';
            }
            break;

          case 'checkout':
            if (messageContent.toLowerCase() === 'confirm') {
              await sock.sendMessage(sender, { 
                text: `Thank you for your order, ${senderName}! Your payment of ${settings.currency}${calculateTotal(userSession.cart)} has been processed successfully.\n\nYour order will be delivered in 3-5 business days.`
              });
              userSession.cart = [];
              userSession.state = 'initial';

              setTimeout(async () => {
                response = await handleMainMenu(senderName);
                userSession.state = 'main_menu';
                await updateUserSession(sender, userSession);
                await sock.sendMessage(sender, response);
              }, 2000);
            } else if (messageContent.toLowerCase() === 'cancel') {
              await sock.sendMessage(sender, { text: 'Order canceled. Returning to main menu.' });
              response = await handleMainMenu(senderName);
              userSession.state = 'main_menu';
            }
            break;

          default:
            response = await handleMainMenu(senderName);
            userSession.state = 'main_menu';
        }

        userSession.lastInteraction = Date.now();
        userSession.lastState = userSession.state;
        await updateUserSession(sender, userSession);

        if (response) {
          await sock.sendMessage(sender, response);
        }

      } catch (error) {
        console.error('Error processing message:', error);
        await sock.sendMessage(sender, { 
          text: 'Sorry, I encountered an error processing your request. Please try again or type "menu" to return to the main menu.'
        });
      }
    }
  });

  return sock;
}

// Start the bot
connectToWhatsApp().then(sock => {
  if (!sock) {
    console.error("Failed to initialize WhatsApp bot.");
  }
});

// Helper function to calculate cart total
function calculateTotal(cart) {
  const products = require('./database.json').products;
  return cart.reduce((total, item) => {
    const product = products.find(p => p.id === item.item);
    return total + (product ? product.price * item.quantity : 0);
  }, 0).toFixed(2);
}