// Reads one post (article[data-testid="tweet"]) from X's page into a plain object.
(function (root) {
  'use strict';

  const clean = (s) => String(s || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();

  function permalink(article) {
    for (const a of article.querySelectorAll('a[href*="/status/"]')) {
      if (!a.querySelector('time')) continue;
      const m = (a.getAttribute('href') || '').match(/^\/([^/]+)\/status\/(\d+)/);
      if (m) return { handle: m[1], id: m[2], url: 'https://x.com' + m[0] };
    }
    return null;
  }

  // The quoted post sits in a nested role="link" container with its own text.
  function quoteContainer(article) {
    for (const el of article.querySelectorAll('div[role="link"]')) {
      if (el.querySelector('[data-testid="tweetText"]') || el.querySelector('[data-testid="User-Name"]')) return el;
    }
    return null;
  }

  function extractPost(article) {
    const link = permalink(article);
    if (!link) return null;

    const quote = quoteContainer(article);
    const texts = [...article.querySelectorAll('[data-testid="tweetText"]')];
    const main = texts.find((t) => !quote || !quote.contains(t));
    const quoted = quote ? quote.querySelector('[data-testid="tweetText"]') : null;

    const links = [];
    for (const a of article.querySelectorAll('[data-testid="tweetText"] a[href], [data-testid="card.wrapper"] a[href]')) {
      const text = clean(a.innerText).replace(/\s+/g, '');
      const href = a.getAttribute('href') || '';
      if (!text || href.startsWith('/hashtag') || /^[@#$]/.test(text)) continue;
      links.push({ text, href });
    }

    // X Articles have their own title element; link cards and article previews
    // contribute whatever text they show, minus the reply/like/view counts.
    const outside = (el) => !quote || !quote.contains(el);
    const titleEl = [...article.querySelectorAll('[data-testid="twitter-article-title"]')].find(outside);
    const articleTitle = titleEl ? clean(titleEl.innerText).slice(0, 300) : '';
    const counts = new Set([...article.querySelectorAll('[role="group"]')].flatMap((g) => g.innerText.split('\n').map((x) => x.trim())));
    const cardEls = [...article.querySelectorAll('[data-testid="card.wrapper"], [data-testid*="article" i]')].filter(
      (el) => outside(el) && el !== titleEl && !el.contains(article.querySelector('[role="group"]'))
    );
    const cardText = clean(
      cardEls
        .map((el) => el.innerText)
        .join('\n')
        .split('\n')
        .filter((line) => !counts.has(line.trim()) && line.trim() !== articleTitle)
        .join('\n')
    ).slice(0, 1500);

    const nameEl = article.querySelector('[data-testid="User-Name"]');
    const name = nameEl ? clean(nameEl.innerText).split('\n')[0] : '';

    return {
      id: link.id,
      handle: link.handle,
      url: link.url,
      name,
      text: main ? clean(main.innerText).slice(0, 4000) : '',
      quoteText: quoted ? clean(quoted.innerText).slice(0, 1500) : '',
      articleTitle,
      cardText,
      links: links.slice(0, 12),
      hasVideo: !!article.querySelector('[data-testid="videoPlayer"], video'),
      imageCount: article.querySelectorAll('[data-testid="tweetPhoto"] img').length,
    };
  }

  root.CapExtract = { extractPost };
})(globalThis);
