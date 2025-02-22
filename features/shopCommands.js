const fs = require('fs');
const { getImageAsBuffer } = require('../utils');

// Load product database
const database = require('../database.json');
const settings = require('../settings.json');

/**
 * Generates the main menu with product categories
 */
async function handleMainMenu(userName) {
  try {
    const categories = database.categories;
    let menuText = `Hello ${userName}! 👋\nWelcome to ${settings.botName}.\n\nPlease select a category by number:`;
    
    categories.forEach((category, index) => {
      menuText += `\n${index + 1}. ${category.name}`;
    });
    
    menuText += `\n\nOr type 'search' to find specific products.`;
    
    // Get the featured image for menu (first category image or default)
    const imageUrl = database.featuredImage || categories[0].image || settings.defaultImage;
    const imageBuffer = await getImageAsBuffer(imageUrl);
    
    return {
      image: imageBuffer,
      caption: menuText
    };
  } catch (error) {
    console.error('Error generating main menu:', error);
    return { text: 'Error loading menu. Please try again later.' };
  }
}

/**
 * Handles category selection and displays items
 */
async function handleCategorySelection(selection) {
  try {
    const selectionNum = !isNaN(selection) ? parseInt(selection) - 1 : -1;
    const categories = database.categories;
    
    let selectedCategory;
    if (selectionNum >= 0 && selectionNum < categories.length) {
      selectedCategory = categories[selectionNum];
    } else {
      selectedCategory = categories.find(c => c.name.toLowerCase() === selection.toLowerCase());
    }
    
    if (!selectedCategory) {
      return { 
        text: `Invalid selection. Please choose a number between 1 and ${categories.length}.`,
        success: false
      };
    }
    
    const categoryProducts = database.products.filter(p => p.category === selectedCategory.id);
    
    if (categoryProducts.length === 0) {
      return {
        text: `No products found in ${selectedCategory.name}. Please select another category.`,
        success: false
      };
    }
    
    let productList = `*${selectedCategory.name}*\n\nSelect a product by number:`;
    categoryProducts.forEach((product, index) => {
      productList += `\n${index + 1}. ${product.name} - ${settings.currency}${product.price.toFixed(2)}`;
    });
    
    const imageBuffer = await getImageAsBuffer(selectedCategory.image || settings.defaultImage);
    
    return {
      image: imageBuffer,
      caption: productList,
      success: true,
      categoryName: selectedCategory.name
    };
  } catch (error) {
    console.error('Error handling category selection:', error);
    return { text: 'Error processing category. Please try again.', success: false };
  }
}

/**
 * Handles item selection and displays details
 */
async function handleItemSelection(selection, categoryName) {
  try {
    const selectedCategory = database.categories.find(c => 
        c.name.toLowerCase() === categoryName.toLowerCase()
      );
    
    if (!selectedCategory) {
      return { text: 'Category not found. Please return to main menu.', success: false };
    }
    
    const categoryProducts = database.products.filter(p => p.category === selectedCategory.id);
    
    const selectionNum = !isNaN(selection) ? parseInt(selection) - 1 : -1;
    
    let selectedProduct;
    if (selectionNum >= 0 && selectionNum < categoryProducts.length) {
      selectedProduct = categoryProducts[selectionNum];
    } else {
      selectedProduct = categoryProducts.find(p => p.name.toLowerCase() === selection.toLowerCase());
    }
    
    if (!selectedProduct) {
      return { text: `Invalid selection. Please choose a number between 1 and ${categoryProducts.length}.`, success: false };
    }

    // ✅ Analytics Tracking (Moved Inside Function)
    try {
      const { recordInteraction } = require('../analytics');
      recordInteraction('system', 'product_view', { productId: selectedProduct.id });
    } catch (error) {
      console.error('Error recording product view analytics:', error);
    }
    
    let details = `*${selectedProduct.name}*\n`;
    details += `Price: ${settings.currency}${selectedProduct.price.toFixed(2)}\n`;
    details += `Description: ${selectedProduct.description}\n\n`;

    if (selectedProduct.sizes && selectedProduct.sizes.length > 0) {
      details += `Available Sizes: ${selectedProduct.sizes.join(', ')}\n`;
    }

    if (selectedProduct.colors && selectedProduct.colors.length > 0) {
      details += `Available Colors: ${selectedProduct.colors.join(', ')}\n`;
    }

    details += `\nTo purchase, please enter quantity, size, and color (comma separated).\nExample: "2,L,blue"`;

    const imageBuffer = await getImageAsBuffer(selectedProduct.image || settings.defaultImage);

    return {
      image: imageBuffer,
      caption: details,
      success: true,
      item: selectedProduct.id
    };
  } catch (error) {
    console.error('Error handling item selection:', error);
    return { text: 'Error processing item selection. Please try again.', success: false };
  }
}

/**
 * Handles cart display and checkout options
 */
async function handleCart(cart) {
  try {
    if (!cart || cart.length === 0) {
      return { text: 'Your cart is empty. Please add items to your cart.' };
    }
    
    const products = database.products;
    let cartText = '*Your Shopping Cart*\n\n';
    let total = 0;
    
    cart.forEach((item, index) => {
      const product = products.find(p => p.id === item.item);
      if (product) {
        const itemTotal = product.price * item.quantity;
        total += itemTotal;
        cartText += `${index + 1}. ${product.name}\nQty: ${item.quantity}, Size: ${item.size}, Color: ${item.color}\nPrice: ${settings.currency}${itemTotal.toFixed(2)}\n\n`;
      }
    });
    
    cartText += `*Total: ${settings.currency}${total.toFixed(2)}*\n\n`;
    cartText += 'Type "checkout" to proceed with payment or "continue" to add more items.';
    
    const imageBuffer = await getImageAsBuffer(settings.cartImage || settings.defaultImage);

    return {
      image: imageBuffer,
      caption: cartText
    };
  } catch (error) {
    console.error('Error handling cart:', error);
    return { text: 'Error displaying cart. Please try again.' };
  }
}

/**
 * Handles checkout process
 */
async function handleCheckout(cart, userName) {
  try {
    if (!cart || cart.length === 0) {
      return { text: 'Your cart is empty. Please add items to your cart.' };
    }
    
    const products = database.products;
    let checkoutText = `*Checkout Summary for ${userName}*\n\n`;
    let total = 0;
    
    cart.forEach((item) => {
      const product = products.find(p => p.id === item.item);
      if (product) {
        const itemTotal = product.price * item.quantity;
        total += itemTotal;
        checkoutText += `${product.name} (${item.quantity}x) - ${settings.currency}${itemTotal.toFixed(2)}\n`;
      }
    });
    
    checkoutText += `\n*Total Amount: ${settings.currency}${total.toFixed(2)}*\n\n`;
    checkoutText += `Payment Method: ${settings.paymentMethod}\n\n`;
    checkoutText += 'Type "confirm" to complete your order or "cancel" to return to main menu.';
    
    const imageBuffer = await getImageAsBuffer(settings.checkoutImage || settings.defaultImage);

    return {
      image: imageBuffer,
      caption: checkoutText
    };
  } catch (error) {
    console.error('Error handling checkout:', error);
    return { text: 'Error processing checkout. Please try again.' };
  }
}


// Add this function to your existing shopCommands.js
async function handleSearch(query) {
    try {
      const results = database.products.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase())
      );
  
      if (results.length === 0) {
        return { 
          text: `No products found for "${query}". Try different keywords or type "menu" to return.`,
          success: false
        };
      }
  
      let resultText = `Search Results for "${query}":\n\n`;
      results.forEach((product, index) => {
        resultText += `${index + 1}. ${product.name} - ${settings.currency}${product.price.toFixed(2)}\n`;
      });
  
      return {
        text: resultText,
        success: true,
        results: results.map(p => p.id)
      };
    } catch (error) {
      console.error('Search error:', error);
      return { text: 'Search failed. Please try again.', success: false };
    }
  }
  
  // exports

  module.exports = {
    handleMainMenu,
    handleCategorySelection,
    handleItemSelection,
    handleCart,
    handleCheckout,
    handleSearch 
  };