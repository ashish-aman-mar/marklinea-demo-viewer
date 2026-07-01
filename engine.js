/**
 * Marklinea Demo Engine — loads captured snapshots and swaps between them
 * with a cross-fade transition. Exposes showScreen + findElement for the
 * cursor/LiveKit integration.
 */

window.MarklineaEngine = {};

(function () {
  const container = document.getElementById('demo-container');
  const overlay = document.getElementById('swap-overlay');
  const screenLabel = document.getElementById('screen-label');

  // Cache fetched snapshots so repeat visits are instant
  const cache = {};

  // Explicit screen-key → filename map. Keys not listed here default to <key>.html.
  const SNAPSHOT_FILES = {
    'login':           'login.html',
    'dashboard':       'dashboard.html',
    'detail':          'detail.html',
    'settings':        'settings.html',
    'zoho-leads':      'zoho-leads-list.html',
    'zoho-contacts':   'zoho-contacts-list.html',
    'zoho-deals':      'zoho-deals-list.html',
    'zoho-dashboard':  'zoho-dashboard.html',
  };

  async function fetchSnapshot(screenId) {
    if (cache[screenId]) return cache[screenId];

    const filename = SNAPSHOT_FILES[screenId] || `${screenId}.html`;
    const resp = await fetch(`snapshots/${filename}`);
    if (!resp.ok) throw new Error(`Snapshot not found: ${screenId}`);
    const html = await resp.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const styles = Array.from(doc.querySelectorAll('style'))
      .map((s) => s.outerHTML)
      .join('\n');

    const body = doc.body ? doc.body.innerHTML : '';

    cache[screenId] = { styles, body };
    return cache[screenId];
  }

  async function showScreen(screenId) {
    const t0 = performance.now();
    const snapshot = await fetchSnapshot(screenId);

    // Cross-fade: fade out old content, swap, fade in
    container.classList.add('fade-out');
    await new Promise(r => setTimeout(r, 120));  // brief fade-out

    container.innerHTML = snapshot.styles + snapshot.body;

    // Zoho frames: lock outer scroll, allow horizontal on the real grid container
    const isZoho = screenId.startsWith('zoho-');
    if (isZoho) {
      container.style.overflow = 'hidden';
      container.style.maxHeight = '100%';
      // Kill any remaining splash/watermark elements
      container.querySelectorAll(
        '.dummy_Body, .left-menu-loader, .crmAppTopPanelIniLoader, ' +
        '.nextgen-logoloader, #exptRptInProgress, .AmpmnewValues, ' +
        'crm-oldui-deprecation-banner, crm-nextgenui-onboarding-banner'
      ).forEach(el => el.remove());
      scrollLocked = true;
      // Find the real grid scroll container in the DOM snapshot
      gridScrollEl = container.querySelector('lyte-exptable')
        || container.querySelector('[data-zcqa="listViewTable"]')
        || container.querySelector('.lvListBodyScroll')
        || container.querySelector('[data-zcqa="KanbanView"]');
    } else {
      container.style.overflow = '';
      container.style.maxHeight = '';
      scrollLocked = false;
      gridScrollEl = null;
    }

    // Neutralize injected forms
    container.querySelectorAll('button[type="submit"]').forEach(b => {
      b.setAttribute('type', 'button');
    });
    container.querySelectorAll('form').forEach(f => {
      f.setAttribute('action', 'javascript:void(0)');
      f.setAttribute('onsubmit', 'return false');
      f.addEventListener('submit', e => e.preventDefault());
      f.submit = () => {};
    });

    // Highlight active nav item in sidebar
    container.querySelectorAll('[data-nav]').forEach(el => {
      if (el.classList.contains('sidebar-link')) {
        // Toy-app sidebar links
        el.classList.toggle('active', el.dataset.nav === screenId);
      }
      // Zoho sidebar tabs — add a visible highlight
      if (el.dataset.nav && el.dataset.nav.startsWith('zoho-')) {
        el.classList.toggle('demo-highlight', el.dataset.nav === screenId);
      }
    });

    container.classList.remove('fade-out');  // fade in

    const t1 = performance.now();
    const ms = (t1 - t0).toFixed(1);

    overlay.textContent = `swap: ${ms} ms`;
    overlay.classList.add('visible');
    screenLabel.textContent = screenId;

    overlay.classList.remove('flash');
    void overlay.offsetWidth;
    overlay.classList.add('flash');
  }

  // Find an element by data-nav or data-demo-target (case-insensitive label match)
  function findElement(target) {
    if (!target) return null;
    const t = target.toLowerCase().trim();

    // Try data-demo-target first
    const byTarget = container.querySelector(`[data-demo-target="${t}"]`);
    if (byTarget) return byTarget;

    // Try data-nav
    const byNav = container.querySelector(`[data-nav="${t}"]`);
    if (byNav) return byNav;

    // Try data-zcqa (Zoho's stable QA test IDs)
    const byZcqa = container.querySelector(`[data-zcqa="${t}"]`);
    if (byZcqa) return byZcqa;

    // Fuzzy: try sidebar links by text content
    const links = container.querySelectorAll('.sidebar-link, .link, [data-nav]');
    for (const el of links) {
      if (el.textContent.toLowerCase().trim().includes(t)) return el;
    }

    return null;
  }

  // Event delegation — intercept clicks on data-nav elements
  container.addEventListener('click', function (e) {
    e.preventDefault();
    let el = e.target;
    while (el && el !== container) {
      if (el.dataset && el.dataset.nav) {
        showScreen(el.dataset.nav);
        return;
      }
      el = el.parentElement;
    }
  });

  container.addEventListener('submit', function (e) {
    e.preventDefault();
    const btn = e.submitter;
    if (btn && btn.dataset && btn.dataset.nav) {
      showScreen(btn.dataset.nav);
    }
  });

  // Scroll handling for Zoho frames: block vertical, allow horizontal on grid
  let scrollLocked = false;
  let gridScrollEl = null;
  container.addEventListener('wheel', function (e) {
    if (!scrollLocked) return;
    // If the grid has horizontal overflow, forward horizontal scroll to it
    if (gridScrollEl && gridScrollEl.scrollWidth > gridScrollEl.clientWidth) {
      // Shift+wheel or trackpad horizontal = deltaX; plain wheel = deltaY
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (dx !== 0) {
        gridScrollEl.scrollLeft += dx;
        e.preventDefault();
        return;
      }
    }
    // Block all other scroll (vertical)
    e.preventDefault();
  }, { passive: false });
  container.addEventListener('touchmove', function (e) {
    if (scrollLocked) e.preventDefault();
  }, { passive: false });

  // Expose for LiveKit handler
  window.MarklineaEngine.showScreen = showScreen;
  window.MarklineaEngine.findElement = findElement;

  // Load login screen on start
  showScreen('login');
})();
