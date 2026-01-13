
// GA4 E-commerce wiring + Cart management
(function () {
  const CURRENCY_DEFAULT = 'INR';
  const LS_KEY = 'demo_cart_v2';   // current key
  const LS_OLD = 'demo_cart_v1';   // old key


  // (Optional) migrate old cart once
  
// Migrate old cart if present
(function migrateOldCart(){
  try {
    const newRaw = localStorage.getItem('demo_cart_v2');
    if (!newRaw) {
      const oldRaw = localStorage.getItem('demo_cart_v1');
      if (oldRaw) {
        localStorage.setItem('demo_cart_v2', oldRaw);
        console.info('Migrated demo_cart_v1 → demo_cart_v2');
      }
    }
  } catch(e) { /* ignore */ }
})();


  // variant key helper
  function variantKey(variant) {
    if (!variant) return '{}';
    const keys = Object.keys(variant).sort();
    const obj = {}; keys.forEach(k => obj[k] = variant[k]);
    return JSON.stringify(obj);
  }
  function createLineId(sku, variant) {
    const vk = variantKey(variant);
    return `${sku}#${vk}#${Date.now()}_${Math.floor(Math.random()*100000)}`;
  }

  window.Cart = {
    get(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '{"items":[]}'); } catch(e){ return {items:[]}; } },
    add(sku, qty, variant){
      const c = this.get();
      const vk = variantKey(variant);
      const existing = c.items.find(x => x.sku === sku && variantKey(x.variant) === vk);
      if (existing) existing.qty += qty;
      else c.items.push({ id: createLineId(sku, variant), sku, qty, variant: variant || null });
      localStorage.setItem(LS_KEY, JSON.stringify(c));
    },
    update(lineId, qty){
      const c = this.get();
      const it = c.items.find(x => x.id === lineId);
      if (it) it.qty = qty;
      localStorage.setItem(LS_KEY, JSON.stringify(c));
    },
    remove(lineId){
      const c = this.get();
      c.items = c.items.filter(x => x.id !== lineId);
      localStorage.setItem(LS_KEY, JSON.stringify(c));
    },
    clear(){ localStorage.setItem(LS_KEY, JSON.stringify({items:[]})); },
    ga4Items(){
      const c = this.get();
      return c.items.map(line => {
        const p = window.CATALOG[line.sku];
        return { item_id: p.sku, item_name: p.name, item_category: p.category, price: p.price, currency: p.currency || 'INR', quantity: line.qty };
      });
    }
  };



  function readLS() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{"items":[]}'); }
    catch (e) { return { items: [] }; }
  }
  function writeLS(cart) { localStorage.setItem(LS_KEY, JSON.stringify(cart)); }

  // Helper: normalize variant object to a stable string key
  function variantKey(variant) {
    if (!variant) return '{}';
    // sort keys for stable match
    const keys = Object.keys(variant).sort();
    const obj = {};
    keys.forEach(k => obj[k] = variant[k]);
    return JSON.stringify(obj);
  }

  // Create a lineId (unique per line)
  function createLineId(sku, variant) {
    const vk = variantKey(variant);
    return `${sku}#${vk}#${Date.now()}_${Math.floor(Math.random()*100000)}`;
  }

  window.Cart = {
    get() { return readLS(); },

    // add(sku, qty, variant) — if same sku+variant exists, increase qty; else push a new line
    add(sku, qty, variant) {
      const c = readLS();
      const vk = variantKey(variant);
      const existing = c.items.find(x => x.sku === sku && variantKey(x.variant) === vk);
      if (existing) {
        existing.qty += qty;
      } else {
        c.items.push({ id: createLineId(sku, variant), sku, qty, variant: variant || null });
      }
      writeLS(c);
    },

    // update line by id
    update(lineId, qty) {
      const c = readLS();
      const it = c.items.find(x => x.id === lineId);
      if (it) { it.qty = qty; }
      writeLS(c);
    },

    // remove line by id
    remove(lineId) {
      const c = readLS();
      c.items = c.items.filter(x => x.id !== lineId);
      writeLS(c);
    },

    clear() { writeLS({ items: [] }); },

    // Map to GA4 items
    ga4Items() {
      const c = readLS();
      return c.items.map(line => {
        const p = window.CATALOG[line.sku];
        return {
          item_id: p.sku,
          item_name: p.name,
          item_category: p.category,
          price: p.price,
          currency: p.currency || CURRENCY_DEFAULT,
          quantity: line.qty,
          // Optional: include variant info in item_name or add custom params if you want
          // item_variant: variantKey(line.variant)
        };
      });
    }
  };

  // ---------------- GA4 helpers ----------------
  window.pushEvent = function(evtName, payload){
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: evtName }, payload || {}));
  };

  function getProductsFromGrid() {
    const cards = document.querySelectorAll('article.product');
    return Array.from(cards).map(card => {
      const price = Number(card.dataset.price || '0');
      const currency = card.dataset.currency || CURRENCY_DEFAULT;
      return {
        item_id: card.dataset.sku,
        item_name: card.dataset.name,
        item_category: card.dataset.category,
        price: price,
        currency: currency
      };
    });
  }

  function pushViewItemListIfCategory() {
    const pageCategory = window.digitalData?.page?.category?.primaryCategory;
    const isCategory = ['t-shirts', 'sneakers', 'backpacks'].includes((pageCategory || '').toLowerCase());
    if (!isCategory) return;
    const items = getProductsFromGrid();
    window.pushEvent('view_item_list', { item_list_name: pageCategory, items });
  }

  function bindSelectItem() {
    document.querySelectorAll('.product-link').forEach(link => {
      link.addEventListener('click', function () {
        const card = this.closest('article.product'); if (!card) return;
        const item = {
          item_id: card.dataset.sku,
          item_name: card.dataset.name,
          item_category: card.dataset.category,
          price: Number(card.dataset.price || '0'),
          currency: card.dataset.currency || CURRENCY_DEFAULT
        };
        window.pushEvent('select_item', { item_list_name: window.digitalData?.page?.category?.primaryCategory || 'unknown', items: [item] });
      });
    });
  }

  // Category grid "Add to Cart" (no variants here)
  function bindAddToCartFromGrid() {
    document.querySelectorAll('.add-to-cart').forEach(btn => {
      btn.addEventListener('click', function () {
        const card = this.closest('article.product'); if (!card) return;
        
        const sku = card.dataset.sku;
        window.Cart.add(sku, 1, null); // variant null on category tiles

        const qty = 1;
        const item = window.CATALOG ? window.CATALOG[sku] : null;
        if (item) { window.Cart.add(sku, qty, null); }
        window.pushEvent('add_to_cart', {
          items: [{
            item_id: card.dataset.sku,
            item_name: card.dataset.name,
            item_category: card.dataset.category,
            price: Number(card.dataset.price || '0'),
            currency: card.dataset.currency || CURRENCY_DEFAULT,
            quantity: qty
          }]
        });
        const el = document.getElementById('cart-summary');
        if (el) {
          const current = Number(el.dataset.total || '0');
          const newTotal = current + (Number(card.dataset.price || '0'));
          el.dataset.total = String(newTotal);
          el.textContent = `Cart total: ₹${newTotal}`;
        }
      });
    });
  }

  function bindCheckoutButtons() {
    const beginBtn = document.getElementById('begin-checkout');
    if (beginBtn) {
      beginBtn.addEventListener('click', function () {
        window.pushEvent('begin_checkout', { items: window.Cart.ga4Items() });
      });
    }
    const purchaseBtn = document.getElementById('complete-purchase');
    if (purchaseBtn) {
      purchaseBtn.addEventListener('click', function () {
        const transactionId = 'TXN_' + Date.now();
        const items = window.Cart.ga4Items();
        let total = 0;
        items.forEach(i => total += (i.price || 0) * (i.quantity || 1));
        window.pushEvent('purchase', { transaction_id: transactionId, currency: CURRENCY_DEFAULT, value: total, items });
        window.Cart.clear();
      });
    }
  }

  function bindForms() {
    const signup = document.getElementById('signup-form');
    if (signup) {
      signup.addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(signup);
        window.pushEvent('sign_up', { method: formData.get('signup_method') || 'email' });
        alert('Sign up event pushed (demo).');
      });
    }
    const contact = document.getElementById('contact-form');
    if (contact) {
      contact.addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(contact);
        window.pushEvent('generate_lead', { lead_type: 'contact', subject: formData.get('subject') });
        alert('Lead event pushed (demo).');
      });
    }
  }

  function bindOutboundLinksAndCTAs() {
    document.querySelectorAll('a.outbound-link').forEach(a => {
      a.addEventListener('click', function () {
        window.pushEvent('outbound_click', { link_url: this.href, link_domain: new URL(this.href).hostname });
      });
    });
    document.querySelectorAll('.cta').forEach(btn => {
      btn.addEventListener('click', function () {
        window.pushEvent('cta_click', { cta_location: this.dataset.ctaLocation || 'unknown', cta_id: this.id || '' });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    pushViewItemListIfCategory();
    bindSelectItem();
    bindAddToCartFromGrid();
    bindCheckoutButtons();
    bindForms();
    bindOutboundLinksAndCTAs();
  });
})();
