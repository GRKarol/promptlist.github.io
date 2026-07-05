/* Promptbook — accordion, clipboard copy, global search.
   Reads content from window.PROMPT_DATA (assets/prompts.js). No build step. */
(function () {
  'use strict';

  var DATA = (window.PROMPT_DATA && window.PROMPT_DATA.topics) || [];

  function slugify(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function highlight(text, query) {
    var esc = escapeHtml(text);
    if (!query) return esc;
    var idx = esc.toLowerCase().indexOf(escapeHtml(query).toLowerCase());
    if (idx === -1) return esc;
    var q = escapeHtml(query);
    return esc.slice(0, idx) + '<mark>' + esc.slice(idx, idx + q.length) + '</mark>' + esc.slice(idx + q.length);
  }

  function snippet(text, query, radius) {
    radius = radius || 70;
    var idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '');
    var start = Math.max(0, idx - radius);
    var end = Math.min(text.length, idx + query.length + radius);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  /* ---------- INDEX PAGE: topic grid ---------- */

  function renderIndexGrid() {
    var grid = document.querySelector('[data-role="topic-grid"]');
    if (!grid) return;
    grid.innerHTML = DATA.map(function (topic) {
      var count = topic.subtopics.reduce(function (sum, st) { return sum + st.prompts.length; }, 0);
      return (
        '<a class="card" href="topics/' + topic.slug + '.html" data-slug="' + topic.slug + '">' +
        '<div class="tape"></div>' +
        '<h2>' + escapeHtml(topic.title) + '</h2>' +
        '<p>' + escapeHtml(topic.description) + '</p>' +
        '<span class="count">' + count + ' prompts</span>' +
        '</a>'
      );
    }).join('');
  }

  function filterGrid(query) {
    var grid = document.querySelector('[data-role="topic-grid"]');
    if (!grid) return;
    var q = query.trim().toLowerCase();
    var cards = grid.querySelectorAll('.card');
    if (!q) {
      grid.classList.remove('filtered');
      cards.forEach(function (c) { c.classList.remove('no-match'); });
      return;
    }
    grid.classList.add('filtered');
    var matchingSlugs = {};
    runSearch(query).forEach(function (r) { matchingSlugs[r.topicSlug] = true; });
    cards.forEach(function (c) {
      c.classList.toggle('no-match', !matchingSlugs[c.getAttribute('data-slug')]);
    });
  }

  /* ---------- TOPIC PAGE: subtopic accordion ---------- */

  function renderTopicPage(slug) {
    var list = document.querySelector('[data-role="subtopic-list"]');
    if (!list) return;
    var topic = DATA.filter(function (t) { return t.slug === slug; })[0];
    if (!topic) {
      list.innerHTML = '<div class="no-results">This topic could not be loaded.</div>';
      return;
    }

    document.querySelectorAll('[data-role="topic-title"]').forEach(function (el) { el.textContent = topic.title; });
    document.querySelectorAll('[data-role="topic-desc"]').forEach(function (el) { el.textContent = topic.description; });
    if (topic.title) document.title = topic.title + ' — Promptbook';

    list.innerHTML = topic.subtopics.map(function (st, sti) {
      var stSlug = slugify(st.name);
      var prompts = st.prompts.map(function (p, pi) {
        var promptId = stSlug + '-' + (pi + 1);
        return (
          '<div class="prompt-card" id="prompt-' + promptId + '">' +
          '<button type="button" class="prompt-header" aria-expanded="false">' +
          '<span class="title">' + escapeHtml(p.title) + '</span>' +
          '<span class="toggle"></span>' +
          '</button>' +
          '<div class="prompt-body">' +
          '<p>' + escapeHtml(p.text) + '</p>' +
          '<button type="button" class="copy-btn">📋 Copy prompt</button>' +
          '</div>' +
          '</div>'
        );
      }).join('');
      return (
        '<section class="subtopic" id="subtopic-' + stSlug + '" data-index="' + sti + '">' +
        '<button type="button" class="subtopic-header" aria-expanded="false">' +
        '<span class="subtopic-name">' + escapeHtml(st.name) + '</span>' +
        '<span class="toggle"></span>' +
        '</button>' +
        '<div class="subtopic-body">' + prompts + '</div>' +
        '</section>'
      );
    }).join('');

    list.dataset.topicSlug = slug;

    if (location.hash.length > 1) openHashTarget();
  }

  function openHashTarget() {
    var hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    var el = document.getElementById(hash);
    if (!el) return;

    var subtopic = el.classList.contains('subtopic') ? el : el.closest('.subtopic');
    if (subtopic) {
      subtopic.classList.add('open');
      subtopic.classList.remove('filtered-out');
      var sh = subtopic.querySelector('.subtopic-header');
      if (sh) sh.setAttribute('aria-expanded', 'true');
    }
    if (el.classList.contains('prompt-card')) {
      el.classList.add('open');
      var ph = el.querySelector('.prompt-header');
      if (ph) ph.setAttribute('aria-expanded', 'true');
    }
    setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }

  /* ---------- Local live filter (topic page) ---------- */

  function applyLocalFilter(query) {
    var list = document.querySelector('[data-role="subtopic-list"]');
    if (!list) return;
    var q = query.trim().toLowerCase();
    var container = list.parentElement;
    var noResults = container.querySelector('.no-results');
    var subtopics = list.querySelectorAll('.subtopic');
    var anyVisible = false;

    subtopics.forEach(function (sub) {
      var nameEl = sub.querySelector('.subtopic-name');
      var name = nameEl ? nameEl.textContent.toLowerCase() : '';
      var cards = sub.querySelectorAll('.prompt-card');

      if (!q) {
        sub.classList.remove('filtered-out', 'open');
        var subHeader = sub.querySelector('.subtopic-header');
        if (subHeader) subHeader.setAttribute('aria-expanded', 'false');
        cards.forEach(function (card) {
          card.classList.remove('open', 'filtered-out');
          var ph = card.querySelector('.prompt-header');
          if (ph) ph.setAttribute('aria-expanded', 'false');
        });
        return;
      }

      var nameMatch = name.indexOf(q) !== -1;
      var subtopicHasMatch = nameMatch;

      cards.forEach(function (card) {
        var bodyP = card.querySelector('.prompt-body p');
        var text = bodyP ? bodyP.textContent.toLowerCase() : '';
        var textMatch = text.indexOf(q) !== -1;
        card.classList.toggle('filtered-out', !nameMatch && !textMatch);
        var ph = card.querySelector('.prompt-header');
        if (textMatch && !nameMatch) {
          card.classList.add('open');
          if (ph) ph.setAttribute('aria-expanded', 'true');
          subtopicHasMatch = true;
        } else if (nameMatch) {
          card.classList.remove('open');
          if (ph) ph.setAttribute('aria-expanded', 'false');
        }
      });

      sub.classList.toggle('filtered-out', !subtopicHasMatch);
      var subHeader2 = sub.querySelector('.subtopic-header');
      if (subtopicHasMatch) {
        sub.classList.add('open');
        if (subHeader2) subHeader2.setAttribute('aria-expanded', 'true');
        anyVisible = true;
      }
    });

    if (q && !anyVisible) {
      if (!noResults) {
        noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.textContent = 'No prompts in this topic match your search.';
        container.insertBefore(noResults, list.nextSibling);
      }
    } else if (noResults) {
      noResults.remove();
    }
  }

  /* ---------- Accordion click delegation ---------- */

  document.addEventListener('click', function (e) {
    var subtopicHeader = e.target.closest && e.target.closest('.subtopic-header');
    if (subtopicHeader) {
      var subtopic = subtopicHeader.closest('.subtopic');
      var isOpen = subtopic.classList.toggle('open');
      subtopicHeader.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      return;
    }
    var promptHeader = e.target.closest && e.target.closest('.prompt-header');
    if (promptHeader) {
      var card = promptHeader.closest('.prompt-card');
      var isOpenP = card.classList.toggle('open');
      promptHeader.setAttribute('aria-expanded', isOpenP ? 'true' : 'false');
    }
  });

  /* ---------- Copy to clipboard ----------
     Runs synchronously inside the click handler (no await before the
     clipboard call) so iOS Safari treats it as a direct user gesture. */

  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (err) { /* no-op: clipboard unavailable */ }
    document.body.removeChild(ta);
    cb();
  }

  document.addEventListener(
    'click',
    function (e) {
      var btn = e.target.closest && e.target.closest('.copy-btn');
      if (!btn) return;
      e.stopPropagation();
      var card = btn.closest('.prompt-card');
      var p = card && card.querySelector('.prompt-body p');
      var text = p ? p.textContent : '';

      var onCopied = function () {
        var original = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = '✓ Copied';
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.innerHTML = original;
        }, 1500);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onCopied, function () { fallbackCopy(text, onCopied); });
      } else {
        fallbackCopy(text, onCopied);
      }
    },
    true
  );

  /* ---------- Global search index ---------- */

  var SEARCH_INDEX = null;

  function buildSearchIndex() {
    var index = [];
    DATA.forEach(function (topic) {
      topic.subtopics.forEach(function (st) {
        var stSlug = slugify(st.name);
        st.prompts.forEach(function (p, pi) {
          index.push({
            topicSlug: topic.slug,
            topicTitle: topic.title,
            subtopicName: st.name,
            subtopicSlug: stSlug,
            promptId: stSlug + '-' + (pi + 1),
            promptTitle: p.title,
            text: p.text
          });
        });
      });
    });
    return index;
  }

  function runSearch(query) {
    if (!SEARCH_INDEX) SEARCH_INDEX = buildSearchIndex();
    var q = query.trim().toLowerCase();
    if (!q) return [];
    var seen = {};
    var results = [];
    SEARCH_INDEX.forEach(function (item) {
      var nameMatch = item.subtopicName.toLowerCase().indexOf(q) !== -1;
      var titleMatch = item.promptTitle.toLowerCase().indexOf(q) !== -1;
      var textMatch = item.text.toLowerCase().indexOf(q) !== -1;
      if (!nameMatch && !titleMatch && !textMatch) return;
      var specificPrompt = (titleMatch || textMatch) && !nameMatch;
      var dedupeKey = nameMatch && !specificPrompt
        ? item.topicSlug + '|' + item.subtopicSlug + '|name'
        : item.topicSlug + '|' + item.subtopicSlug + '|' + item.promptId;
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;
      results.push({
        topicSlug: item.topicSlug,
        topicTitle: item.topicTitle,
        subtopicSlug: item.subtopicSlug,
        subtopicName: item.subtopicName,
        promptId: specificPrompt ? item.promptId : null,
        promptTitle: specificPrompt ? item.promptTitle : '',
        snippet: textMatch ? item.text : '',
        matchedText: textMatch
      });
    });
    return results.slice(0, 30);
  }

  function currentTopicSlug() {
    var list = document.querySelector('[data-role="subtopic-list"]');
    return list ? list.dataset.topicSlug : null;
  }

  function resultHref(r, onIndex) {
    var anchor = r.promptId ? 'prompt-' + r.promptId : 'subtopic-' + r.subtopicSlug;
    var base = onIndex ? 'topics/' + r.topicSlug + '.html' : r.topicSlug + '.html';
    return base + '#' + anchor;
  }

  function renderSearchResults(query) {
    var wrap = document.querySelector('[data-role="search-wrap"]');
    var resultsEl = document.querySelector('[data-role="search-results"]');
    if (!wrap || !resultsEl) return;

    var onIndex = !!document.querySelector('[data-role="topic-grid"]');
    var curSlug = currentTopicSlug();

    if (!query.trim()) {
      wrap.classList.remove('searching');
      resultsEl.innerHTML = '';
      return;
    }

    var results = runSearch(query);
    if (!onIndex && curSlug) {
      results = results.filter(function (r) { return r.topicSlug !== curSlug; });
    }

    if (results.length === 0) {
      if (onIndex) {
        wrap.classList.add('searching');
        resultsEl.innerHTML = '<div class="search-empty">No prompts match &ldquo;' + escapeHtml(query) + '&rdquo;.</div>';
      } else {
        wrap.classList.remove('searching');
        resultsEl.innerHTML = '';
      }
      return;
    }

    wrap.classList.add('searching');
    var heading = !onIndex ? '<div class="search-empty" style="text-align:left;font-weight:600;">Also in other topics</div>' : '';
    resultsEl.innerHTML = heading + results.map(function (r) {
      var snippetText = r.matchedText ? snippet(r.snippet, query) : '';
      return (
        '<a class="search-result" href="' + resultHref(r, onIndex) + '">' +
        '<span class="r-topic">' + escapeHtml(r.topicTitle) + ' / ' + escapeHtml(r.subtopicName) + '</span>' +
        '<span class="r-name">' + (r.promptTitle ? highlight(r.promptTitle, query) : highlight(r.subtopicName, query)) + '</span>' +
        (snippetText ? '<span class="r-snippet">' + highlight(snippetText, query) + '</span>' : '') +
        '</a>'
      );
    }).join('');
  }

  function initSearch() {
    var input = document.querySelector('[data-role="search-input"]');
    var wrap = document.querySelector('[data-role="search-wrap"]');
    var clearBtn = document.querySelector('[data-role="search-clear"]');
    if (!input || !wrap) return;

    input.addEventListener('input', function () {
      var q = input.value;
      wrap.classList.toggle('has-value', q.length > 0);
      renderSearchResults(q);
      filterGrid(q);
      applyLocalFilter(q);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        input.value = '';
        wrap.classList.remove('has-value', 'searching');
        renderSearchResults('');
        filterGrid('');
        applyLocalFilter('');
        input.focus();
      });
    }

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) wrap.classList.remove('searching');
    });
  }

  /* ---------- Init ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    renderIndexGrid();
    if (document.body.dataset.topic) renderTopicPage(document.body.dataset.topic);
    initSearch();
    window.addEventListener('hashchange', openHashTarget);
  });
})();
