const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const WEBSITE_URL = 'https://1nga.com';
const OUTPUT_FILE = 'database.json';
const ASSETS_DIR = path.join(__dirname, 'assets');

async function scrapeWebsite() {
  // Create assets directory
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Configure browser
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  // Main scraping logic
  try {
    console.log('Navigating to website...');
    await page.goto(WEBSITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Step 1: Scrape categories
    const categories = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.category-list a')).map((link, index) => ({
        id: index + 1,
        name: link.innerText.trim(),
        url: link.href,
        image: link.querySelector('img')?.src || null
      }));
    });

    // Step 2: Scrape products for each category
    const productData = [];
    
    for (const category of categories) {
      console.log(`Processing category: ${category.name}`);
      await page.goto(category.url, { waitUntil: 'networkidle2', timeout: 60000 });

      // Download category image
      if (category.image) {
        category.image = await downloadImage(category.image, `category_${category.id}`);
      }

      // Scrape products
      const products = await page.evaluate((currentCategory) => {
        return Array.from(document.querySelectorAll('.product-item')).map((product, index) => ({
          id: `${currentCategory.id}_${index + 1}`,
          name: product.querySelector('.product-title').innerText.trim(),
          price: parseFloat(
            product.querySelector('.product-price')
              .innerText.replace(/[^0-9.]/g, '')
          ),
          description: product.querySelector('.product-description')?.innerText.trim() || '',
          category: currentCategory.id,
          image: product.querySelector('.product-image img')?.src || null,
          specs: {
            sizes: Array.from(product.querySelectorAll('.size-option')).map(size => size.innerText.trim()),
            colors: Array.from(product.querySelectorAll('.color-swatch')).map(color => color.getAttribute('data-color'))
          }
        }));
      }, category);

      productData.push(...products);
    }

    // Save data
    const finalData = {
      categories: categories.map(c => ({ 
        id: c.id, 
        name: c.name, 
        image: c.image 
      })),
      products: productData.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        description: p.description,
        category: p.category,
        image: p.image,
        sizes: p.specs.sizes,
        colors: p.specs.colors
      }))
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
    console.log(`Scraping complete! Data saved to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('Scraping failed:', error);
  } finally {
    await browser.close();
  }
}

async function downloadImage(url, prefix) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const extension = url.split('.').pop().split('?')[0];
    const filename = `${prefix}_${Date.now()}.${extension}`;
    const filepath = path.join(ASSETS_DIR, filename);
    
    response.data.pipe(fs.createWriteStream(filepath));
    return `assets/${filename}`;
  } catch (error) {
    console.error('Failed to download image:', url);
    return null;
  }
}

// Start scraping
scrapeWebsite();