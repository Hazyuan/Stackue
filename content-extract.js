// Content script injected into pages to extract meaningful text info
(() => {
  const info = {};

  // 1. document.title
  info.docTitle = document.title || '';

  // 2. og:title / og:description
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  info.ogTitle = ogTitle ? ogTitle.content : '';
  info.ogDescription = ogDesc ? ogDesc.content : '';

  // 3. meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  info.metaDescription = metaDesc ? metaDesc.content : '';

  // 4. First meaningful heading (h1, then h2)
  const h1 = document.querySelector('h1');
  info.h1 = h1 ? h1.innerText.trim().slice(0, 200) : '';
  if (!info.h1) {
    const h2 = document.querySelector('h2');
    info.h2 = h2 ? h2.innerText.trim().slice(0, 200) : '';
  }

  // 5. Try to find the first user message / main content snippet
  //    This covers chat UIs like Gemini, ChatGPT, Claude etc.
  //    Look for common patterns of user messages
  const selectors = [
    // Gemini
    '.query-text',
    '.user-query',
    '[data-message-author-role="user"]',
    '.conversation-turn [data-message-author-role="user"]',
    // ChatGPT
    '[data-message-author-role="user"] .markdown',
    // Claude
    '.human-turn .message-content',
    // Generic: first significant paragraph
    'article p',
    'main p',
    '.content p',
  ];

  info.firstContent = '';
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.innerText.trim();
      if (text.length > 5) {
        info.firstContent = text.slice(0, 300);
        break;
      }
    }
  }

  // 6. If still nothing useful, grab first visible text block
  if (!info.firstContent && !info.h1 && !info.ogTitle) {
    const paras = document.querySelectorAll('p, [role="heading"], .title, [class*="title"]');
    for (const p of paras) {
      const text = p.innerText.trim();
      if (text.length > 10 && text.length < 500) {
        info.firstContent = text.slice(0, 300);
        break;
      }
    }
  }

  return info;
})();
