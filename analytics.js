const fs = require('fs');
const path = require('path');

// Analytics file path
const ANALYTICS_FILE = path.join(__dirname, 'analytics_data.json');

// Initialize analytics file if it doesn't exist
function initializeAnalytics() {
  if (!fs.existsSync(ANALYTICS_FILE)) {
    const initialData = {
      interactions: [],
      productViews: {},
      cartActions: {},
      checkouts: [],
      searches: [],
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Load analytics data
function loadAnalytics() {
  try {
    if (!fs.existsSync(ANALYTICS_FILE)) {
      initializeAnalytics();
    }
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE));
  } catch (error) {
    console.error('Error loading analytics:', error);
    return null;
  }
}

// Save analytics data
function saveAnalytics(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving analytics:', error);
    return false;
  }
}

/**
 * Record a user interaction
 * @param {string} userId - User identifier or 'system' for system events
 * @param {string} action - Type of interaction
 * @param {Object} details - Additional details about the interaction
 */
function recordInteraction(userId, action, details = {}) {
  try {
    const analytics = loadAnalytics();
    if (!analytics) return false;

    const interaction = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      details
    };

    // Add to general interactions
    analytics.interactions.push(interaction);

    // Update specific metrics based on action type
    switch (action) {
      case 'product_view':
        const productId = details.productId;
        if (!analytics.productViews[productId]) {
          analytics.productViews[productId] = 0;
        }
        analytics.productViews[productId]++;
        break;

      case 'cart_add':
        const cartProductId = details.productId;
        if (!analytics.cartActions[cartProductId]) {
          analytics.cartActions[cartProductId] = {
            additions: 0,
            totalQuantity: 0
          };
        }
        analytics.cartActions[cartProductId].additions++;
        analytics.cartActions[cartProductId].totalQuantity += (details.quantity || 1);
        break;

      case 'checkout':
        analytics.checkouts.push({
          timestamp: new Date().toISOString(),
          userId,
          items: details.items,
          total: details.total
        });
        break;

      case 'search':
        analytics.searches.push({
          timestamp: new Date().toISOString(),
          keyword: details.keyword,
          resultsCount: details.resultsCount
        });
        break;
    }

    // Trim old interactions if needed (keep last 1000)
    if (analytics.interactions.length > 1000) {
      analytics.interactions = analytics.interactions.slice(-1000);
    }

    return saveAnalytics(analytics);
  } catch (error) {
    console.error('Error recording interaction:', error);
    return false;
  }
}

/**
 * Get analytics report
 * @param {string} reportType - Type of report ('daily', 'weekly', 'monthly')
 * @param {Date} startDate - Start date for the report
 */
function getAnalyticsReport(reportType = 'daily', startDate = new Date()) {
  try {
    const analytics = loadAnalytics();
    if (!analytics) return null;

    // Calculate date range
    const endDate = new Date(startDate);
    let startDateTime;
    switch (reportType) {
      case 'weekly':
        startDateTime = new Date(startDate.setDate(startDate.getDate() - 7));
        break;
      case 'monthly':
        startDateTime = new Date(startDate.setMonth(startDate.getMonth() - 1));
        break;
      default: // daily
        startDateTime = new Date(startDate.setHours(0, 0, 0, 0));
    }

    // Filter interactions within date range
    const filteredInteractions = analytics.interactions.filter(interaction => {
      const interactionDate = new Date(interaction.timestamp);
      return interactionDate >= startDateTime && interactionDate <= endDate;
    });

    // Generate report
    return {
      period: {
        start: startDateTime.toISOString(),
        end: endDate.toISOString()
      },
      summary: {
        totalInteractions: filteredInteractions.length,
        uniqueUsers: new Set(filteredInteractions.map(i => i.userId)).size,
        productViews: Object.values(analytics.productViews).reduce((a, b) => a + b, 0),
        cartAdditions: Object.values(analytics.cartActions)
          .reduce((total, action) => total + action.additions, 0),
        checkouts: analytics.checkouts.length,
        searches: analytics.searches.length
      },
      topProducts: Object.entries(analytics.productViews)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5),
      recentSearches: analytics.searches.slice(-5)
    };
  } catch (error) {
    console.error('Error generating analytics report:', error);
    return null;
  }
}

// Initialize analytics file on module load
initializeAnalytics();

module.exports = {
  initializeAnalytics,
  recordInteraction,
  getAnalyticsReport
};