(function () {
  'use strict';

  const section = document.getElementById('section-explore');
  if (!section) return;

  const api = window.launcherAPI || {};
  const PAGE_SIZE = 20;
  const KEY_TAB = 'lc_explore_tab';
  const KEY_INSTANCE = 'lc_explore_instance';

  const TYPES = [
    { id: 'mod', label: 'Mods', icon: 'package' },
    { id: 'modpack', label: 'Modpacks', icon: 'box' },
    { id: 'resourcepack', label: 'Texturas', icon: 'palette' },
    { id: 'shader', label: 'Shaders', icon: 'sparkles' }
  ];
  const SORTS = [
    { id: 'relevance', label: 'Relevancia' },
    { id: 'downloads', label: 'Descargas' },
    { id: 'follows', label: 'Seguidores' },
    { id: 'newest', label: 'Recientes' },
    { id: 'updated', label: 'Actualizados' }
  ];
  const VALID_TYPES = TYPES.map((t) => t.id);
  const VALID_SORTS = SORTS.map((s) => s.id);

  const el = {};
  let type = VALID_TYPES.indexOf(readStore(KEY_TAB)) !== -1 ? readStore(KEY_TAB) : 'mod';
  let sort = 'relevance';
  let selectedInstanceId = readStore(KEY_INSTANCE) || '';
  let instances = [];
  let hits = [];
  let offset = 0;
  let total = 0;
  let query = '';
  let requestId = 0;
  let loading = false;
  let loadingMore = false;
  let built = false;
  let initialized = false;
  let wasActive = false;
  let debounceTimer = null;

  let overlay = null;
  let drawer = null;
  let drawerBody = null;
  let closeButton = null;
  let drawerOpen = false;
  let lastFocused = null;
  let detailToken = 0;

  let activeModpackCard = null;
  const progressTimers = new Map();

  function readStore(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in hardened contexts.
    }
  }

  function esc(value) {
    if (value === null || value === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value).replace(/[&<>"']/g, (ch) => map[ch]);
  }

  function ico(name, extraClass) {
    return typeof window.LCIcon === 'function' ? window.LCIcon(name, extraClass || '') : '';
  }

  function toast(options) {
    try {
      if (typeof window.showToast === 'function') window.showToast(options);
    } catch {
      // Notifications are cosmetic and must never break the page.
    }
  }

  async function call(name, payload) {
    if (typeof api[name] !== 'function') throw new Error('La API del launcher no está disponible.');
    return api[name](payload);
  }

  function errorMessage(err) {
    if (err && err.message) return String(err.message);
    if (typeof err === 'string' && err) return err;
    return 'Inténtalo de nuevo en unos segundos.';
  }

  function safeHref(value) {
    const url = String(value === null || value === undefined ? '' : value).trim();
    return /^https?:\/\/[^\s]+$/i.test(url) ? esc(url) : '';
  }

  function compact(value) {
    const number = Number(value);
    const n = Number.isFinite(number) && number > 0 ? number : 0;
    if (n >= 1000000) return partOf(n / 1000000) + ' M';
    if (n >= 1000) return partOf(n / 1000) + ' mil';
    return String(Math.floor(n));
  }

  function partOf(value) {
    return (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10).toString().replace('.', ',');
  }

  function formatDownloads(value) {
    return compact(value);
  }

  function renderInlineMarkdown(raw) {
    const source = String(raw === null || raw === undefined ? '' : raw).replace(/\u0000/g, '');
    const tokens = [];
    const stash = (html) => {
      tokens.push(html);
      return '\u0000' + (tokens.length - 1) + '\u0000';
    };

    let text = source.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt, url) => {
      const href = safeHref(url);
      if (!href) return esc(alt || '');
      return stash('<img class="ex-md-img-inline" src="' + href + '" alt="' + esc(alt || '') + '" loading="lazy" referrerpolicy="no-referrer">');
    });

    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, url) => {
      const href = safeHref(url);
      if (!href) return esc(label);
      return stash('<a class="ex-md-link" href="' + href + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>');
    });

    // Escaping before any inline transform guarantees API content can never inject markup.
    text = esc(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

    return text.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || '');
  }

  function renderMarkdown(raw) {
    const lines = String(raw === null || raw === undefined ? '' : raw).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let paragraph = [];
    let list = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      out.push('<p class="ex-md-p">' + renderInlineMarkdown(paragraph.join(' ')) + '</p>');
      paragraph = [];
    };
    const flushList = () => {
      if (!list) return;
      out.push('<' + list.tag + ' class="ex-md-list">' + list.items.map((item) => '<li>' + renderInlineMarkdown(item) + '</li>').join('') + '</' + list.tag + '>');
      list = null;
    };

    lines.forEach((line) => {
      const text = line.trim();
      if (!text) {
        flushParagraph();
        flushList();
        return;
      }

      const heading = /^(#{1,6})\s+(.*)$/.exec(text);
      if (heading) {
        flushParagraph();
        flushList();
        out.push('<h4 class="ex-md-h">' + renderInlineMarkdown(heading[2]) + '</h4>');
        return;
      }

      const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(text);
      if (image) {
        flushParagraph();
        flushList();
        const href = safeHref(image[2]);
        if (href) out.push('<figure class="ex-md-figure"><img class="ex-md-img" src="' + href + '" alt="' + esc(image[1] || '') + '" loading="lazy" referrerpolicy="no-referrer"></figure>');
        return;
      }

      const bullet = /^[-*+]\s+(.*)$/.exec(text);
      if (bullet) {
        flushParagraph();
        if (!list || list.tag !== 'ul') {
          flushList();
          list = { tag: 'ul', items: [] };
        }
        list.items.push(bullet[1]);
        return;
      }

      const numbered = /^\d+[.)]\s+(.*)$/.exec(text);
      if (numbered) {
        flushParagraph();
        if (!list || list.tag !== 'ol') {
          flushList();
          list = { tag: 'ol', items: [] };
        }
        list.items.push(numbered[1]);
        return;
      }

      flushList();
      paragraph.push(text);
    });

    flushParagraph();
    flushList();
    return out.join('');
  }

  function ensureBuilt() {
    if (built) return;
    built = true;

    section.innerHTML =
      '<div class="ex-page">' +
        '<header class="ex-header">' +
          '<h2 class="ex-title">Explorar</h2>' +
          '<p class="ex-subtitle">Mods, modpacks, texturas y shaders de Modrinth</p>' +
        '</header>' +
        '<div class="ex-toolbar">' +
          '<div class="ex-tabs" role="tablist" aria-label="Tipo de contenido">' +
            TYPES.map((item) =>
              '<button type="button" role="tab" class="ex-tab' + (item.id === type ? ' active' : '') +
              '" data-type="' + item.id + '" aria-selected="' + (item.id === type) + '">' +
              ico(item.icon) + ' ' + item.label + '</button>'
            ).join('') +
          '</div>' +
          '<div class="ex-controls">' +
            '<div class="ex-field ex-field-search">' +
              '<label for="ex-search">Buscar</label>' +
              '<div class="ex-search-wrap">' +
                ico('search', 'ex-search-icon') +
                '<input id="ex-search" class="ex-input" type="search" placeholder="Nombre del proyecto" autocomplete="off">' +
              '</div>' +
            '</div>' +
            '<div class="ex-field">' +
              '<label for="ex-sort">Ordenar por</label>' +
              '<select id="ex-sort" class="ex-select">' +
                SORTS.map((item) => '<option value="' + item.id + '">' + item.label + '</option>').join('') +
              '</select>' +
            '</div>' +
            '<div class="ex-field ex-field-instance"' + (type === 'modpack' ? ' hidden' : '') + '>' +
              '<label for="ex-instance-select">Instancia</label>' +
              '<select id="ex-instance-select" class="ex-select"></select>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="ex-results" class="ex-grid" aria-live="polite"></div>' +
        '<div class="ex-more-wrap">' +
          '<button id="ex-more" class="ex-more" type="button" hidden>' + ico('refresh-cw') + ' Cargar más</button>' +
        '</div>' +
      '</div>';

    el.tabs = section.querySelector('.ex-tabs');
    el.search = section.querySelector('#ex-search');
    el.sort = section.querySelector('#ex-sort');
    el.instance = section.querySelector('#ex-instance-select');
    el.instanceField = section.querySelector('.ex-field-instance');
    el.grid = section.querySelector('#ex-results');
    el.more = section.querySelector('#ex-more');
    el.sort.value = sort;

    el.tabs.addEventListener('click', (event) => {
      const button = event.target.closest('.ex-tab');
      if (!button || button.dataset.type === type) return;
      type = button.dataset.type;
      writeStore(KEY_TAB, type);
      el.tabs.querySelectorAll('.ex-tab').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      el.instanceField.hidden = type === 'modpack';
      runSearch();
    });

    el.search.addEventListener('input', () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(runSearch, 350);
    });
    el.search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      window.clearTimeout(debounceTimer);
      runSearch();
    });

    el.sort.addEventListener('change', () => {
      sort = VALID_SORTS.indexOf(el.sort.value) !== -1 ? el.sort.value : 'relevance';
      runSearch();
    });
    el.instance.addEventListener('change', () => {
      selectedInstanceId = el.instance.value || '';
      writeStore(KEY_INSTANCE, selectedInstanceId);
      runSearch();
    });
    el.more.addEventListener('click', loadMore);
    el.grid.addEventListener('click', onGridClick);
    el.grid.addEventListener('keydown', onGridKeydown);

    ensureDrawer();
    setupProgressEvents();
    populateInstances();
  }

  function onGridClick(event) {
    const action = event.target.closest('.ex-action');
    if (action) {
      event.stopPropagation();
      handleAction(action);
      return;
    }
    if (event.target.closest('.ex-retry')) {
      runSearch();
      return;
    }
    // Disabled buttons do not receive clicks, so a click on the install area without an instance lands here.
    if (event.target.closest('.ex-action-wrap')) {
      toast({ type: 'warning', title: 'Elige una instancia', message: 'Selecciona una instancia arriba para instalar.' });
      return;
    }
    const card = event.target.closest('.ex-card');
    if (card && card.dataset.id) openDetail(card.dataset.id);
  }

  function onGridKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('button, a, select, input')) return;
    const card = event.target.closest('.ex-card');
    if (!card || !card.dataset.id) return;
    event.preventDefault();
    openDetail(card.dataset.id);
  }

  async function activate() {
    ensureBuilt();
    if (initialized) {
      refreshInstances();
      return;
    }
    initialized = true;
    try {
      await refreshInstances();
    } catch {
      // refreshInstances handles its own failures.
    }
    runSearch();
  }

  async function refreshInstances() {
    let list = [];
    try {
      const result = await call('listInstances');
      list = Array.isArray(result) ? result : [];
    } catch (err) {
      toast({ type: 'error', title: 'No se pudieron cargar las instancias', message: esc(errorMessage(err)) });
    }
    instances = list;
    populateInstances();
  }

  function populateInstances() {
    if (!el.instance) return;
    const valid = new Set(instances.map((instance) => String(instance.id)));
    if (selectedInstanceId && !valid.has(selectedInstanceId)) {
      selectedInstanceId = '';
      writeStore(KEY_INSTANCE, '');
    }
    const loaderNames = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
    const options = ['<option value="">Elige una instancia</option>'].concat(instances.map((instance) =>
      '<option value="' + esc(instance.id) + '">' +
      esc(instance.name) + ' · ' + esc(instance.minecraft_version) + ' · ' +
      esc(loaderNames[instance.mod_loader] || instance.mod_loader || 'Desconocido') +
      '</option>'
    ));
    el.instance.innerHTML = options.join('');
    el.instance.value = selectedInstanceId;
  }

  function buildParams(atOffset) {
    query = el.search ? el.search.value.trim() : '';
    const params = {
      query: query,
      projectType: type,
      sort: sort,
      offset: atOffset,
      limit: PAGE_SIZE
    };
    const instance = instances.find((item) => String(item.id) === selectedInstanceId);
    if (instance && type !== 'modpack') {
      params.mcVersion = instance.minecraft_version;
      params.loader = instance.mod_loader;
    }
    return params;
  }

  function renderSkeletons() {
    el.grid.innerHTML = new Array(8).fill(0).map(() =>
      '<div class="ex-card ex-skeleton-card" aria-hidden="true">' +
        '<div class="ex-skeleton-top">' +
          '<div class="ex-skeleton ex-skeleton-icon"></div>' +
          '<div class="ex-skeleton-lines"><div class="ex-skeleton"></div><div class="ex-skeleton ex-skeleton-short"></div></div>' +
        '</div>' +
        '<div class="ex-skeleton"></div>' +
        '<div class="ex-skeleton ex-skeleton-short"></div>' +
        '<div class="ex-skeleton-footer"><div class="ex-skeleton ex-skeleton-pill"></div><div class="ex-skeleton ex-skeleton-button"></div></div>' +
      '</div>'
    ).join('');
    el.more.hidden = true;
  }

  function renderEmpty() {
    const term = query.trim();
    el.grid.innerHTML =
      '<div class="ex-state">' +
        '<span class="ex-state-icon">' + ico('search') + '</span>' +
        '<h3 class="ex-state-title">No encontramos resultados para ' + (term ? '«' + esc(term) + '»' : 'esta búsqueda') + '</h3>' +
        '<p class="ex-state-text">Prueba con otras palabras o cambia los filtros.</p>' +
      '</div>';
    el.more.hidden = true;
  }

  function renderError() {
    el.grid.innerHTML =
      '<div class="ex-state ex-state-error">' +
        '<span class="ex-state-icon">' + ico('alert-triangle') + '</span>' +
        '<h3 class="ex-state-title">No pudimos cargar los resultados</h3>' +
        '<p class="ex-state-text">Revisa tu conexión e inténtalo de nuevo.</p>' +
        '<button class="ex-retry" type="button">' + ico('refresh-cw') + ' Reintentar</button>' +
      '</div>';
    el.more.hidden = true;
  }

  function renderCard(hit) {
    const id = String(hit.id || hit.slug || '');
    const title = String(hit.title || 'Proyecto sin título');
    const iconUrl = safeHref(hit.icon);
    const iconHtml = iconUrl
      ? '<img class="ex-card-icon" src="' + iconUrl + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="ex-card-icon ex-card-icon-placeholder">' + ico('package') + '</span>';
    const tags = (Array.isArray(hit.categories) ? hit.categories : []).slice(0, 3)
      .map((category) => '<span class="ex-pill">' + esc(category) + '</span>').join('');
    const noInstance = type !== 'modpack' && !instances.some((instance) => String(instance.id) === selectedInstanceId);
    const actionLabel = type === 'modpack' ? 'Crear instancia' : 'Instalar';

    return '<article class="ex-card" role="button" tabindex="0" data-id="' + esc(id) +
      '" aria-label="Ver detalles de ' + esc(title) + '">' +
      '<div class="ex-card-top">' + iconHtml +
        '<div class="ex-card-heading">' +
          '<h3 class="ex-card-title">' + esc(title) + '</h3>' +
          '<p class="ex-card-author">' + (hit.author ? 'por ' + esc(hit.author) : 'Autor desconocido') + '</p>' +
        '</div>' +
      '</div>' +
      '<p class="ex-card-desc">' + esc(hit.description || 'Sin descripción.') + '</p>' +
      (tags ? '<div class="ex-card-tags">' + tags + '</div>' : '') +
      '<div class="ex-card-foot">' +
        '<span class="ex-card-downloads">' + ico('download') + ' ' + formatDownloads(hit.downloads) + ' descargas</span>' +
        '<span class="ex-action-wrap"' + (noInstance ? ' title="Elige una instancia"' : '') + '>' +
          '<button class="ex-action" type="button"' + (noInstance ? ' disabled title="Elige una instancia"' : '') + '>' + actionLabel + '</button>' +
        '</span>' +
      '</div>' +
      '<div class="ex-progress" hidden>' +
        '<div class="ex-progress-bar"><div class="ex-progress-fill"></div></div>' +
        '<span class="ex-progress-text"></span>' +
      '</div>' +
    '</article>';
  }

  function renderResults() {
    if (!hits.length) {
      renderEmpty();
      return;
    }
    el.grid.innerHTML = hits.map(renderCard).join('');
    el.more.hidden = hits.length >= total;
    el.more.disabled = false;
    el.more.innerHTML = ico('refresh-cw') + ' Cargar más';
  }

  async function runSearch() {
    const token = ++requestId;
    progressTimers.forEach((timer) => window.clearTimeout(timer));
    progressTimers.clear();
    loading = true;
    loadingMore = false;
    hits = [];
    offset = 0;
    total = 0;
    renderSkeletons();

    try {
      const result = await call('modrinthSearch', buildParams(0));
      if (token !== requestId) return;
      if (!result || result.success === false) throw new Error((result && result.error) || 'Búsqueda sin resultados válidos');
      hits = Array.isArray(result.hits) ? result.hits : [];
      total = Number(result.total) || hits.length;
      offset = hits.length;
      renderResults();
    } catch (err) {
      if (token !== requestId) return;
      renderError();
    } finally {
      if (token === requestId) loading = false;
    }
  }

  async function loadMore() {
    if (loading || loadingMore || hits.length >= total) return;
    const token = requestId;
    loadingMore = true;
    el.more.disabled = true;
    el.more.innerHTML = ico('loader', 'ex-spin') + ' Cargando...';

    try {
      const result = await call('modrinthSearch', buildParams(offset));
      if (token !== requestId) return;
      if (!result || result.success === false) throw new Error((result && result.error) || 'No se pudieron cargar más resultados');
      const incoming = Array.isArray(result.hits) ? result.hits : [];
      const seen = new Set(hits.map((hit) => String(hit.id)));
      incoming.forEach((hit) => {
        const id = String(hit.id);
        if (!seen.has(id)) {
          seen.add(id);
          hits.push(hit);
        }
      });
      total = Number(result.total) || total;
      offset = hits.length;
      renderResults();
    } catch (err) {
      if (token === requestId) {
        toast({ type: 'error', title: 'No se pudieron cargar más resultados', message: esc(errorMessage(err)) });
      }
    } finally {
      if (token === requestId) {
        loadingMore = false;
        el.more.disabled = false;
        el.more.innerHTML = ico('refresh-cw') + ' Cargar más';
      }
    }
  }

  function handleAction(button) {
    const card = button.closest('.ex-card');
    if (!card || button.disabled) return;
    const hit = hits.find((item) => String(item.id || item.slug || '') === card.dataset.id);
    if (!hit) return;
    if (type === 'modpack') installModpack(hit, card, button);
    else installContent(hit, card, button);
  }

  function setActionState(button, state) {
    const isPack = type === 'modpack';
    const label = state === 'loading'
      ? (isPack ? 'Creando...' : 'Instalando...')
      : state === 'done'
        ? (isPack ? 'Creada' : 'Instalado')
        : (isPack ? 'Crear instancia' : 'Instalar');
    button.dataset.state = state;
    button.disabled = state !== 'idle';
    button.innerHTML = state === 'loading'
      ? ico('loader', 'ex-spin') + ' ' + label
      : state === 'done'
        ? ico('check') + ' ' + label
        : label;
  }

  async function installContent(hit, card, button) {
    const instance = instances.find((item) => String(item.id) === selectedInstanceId);
    if (!instance) {
      toast({ type: 'warning', title: 'Elige una instancia', message: 'Selecciona una instancia antes de instalar.' });
      return;
    }
    setActionState(button, 'loading');
    try {
      const result = await call('modrinthInstall', {
        instanceId: instance.id,
        projectId: hit.id,
        projectType: type
      });
      if (!result || result.success === false) throw new Error((result && result.error) || 'Error al instalar');
      const installed = Array.isArray(result.installed) ? result.installed : [];
      setActionState(button, 'done');
      toast({
        type: 'success',
        title: 'Instalado en ' + esc(instance.name),
        message: installed.length ? installed.map(esc).join(', ') : 'No se descargaron archivos nuevos.'
      });
    } catch (err) {
      setActionState(button, 'idle');
      toast({ type: 'error', title: 'No se pudo instalar', message: esc(errorMessage(err)) });
    }
  }

  async function installModpack(hit, card, button) {
    setActionState(button, 'loading');
    activeModpackCard = card;
    showCardProgress(card, 0, 0, 'Preparando modpack...');
    try {
      const result = await call('importModpack', { projectId: hit.id, name: hit.title });
      if (!result || result.success === false) throw new Error((result && result.error) || 'Error al crear la instancia');
      const name = result.instance && result.instance.name ? result.instance.name : hit.title;
      setActionState(button, 'done');
      showCardProgress(card, 1, 1, 'Instancia creada');
      toast({ type: 'success', title: 'Instancia creada: ' + esc(name), message: 'Ya puedes jugarla desde la sección Instancias.' });
      const timer = window.setTimeout(() => {
        progressTimers.delete(card);
        hideCardProgress(card);
      }, 1600);
      progressTimers.set(card, timer);
      refreshInstances();
    } catch (err) {
      setActionState(button, 'idle');
      hideCardProgress(card);
      toast({ type: 'error', title: 'No se pudo crear la instancia', message: esc(errorMessage(err)) });
    } finally {
      if (activeModpackCard === card) activeModpackCard = null;
    }
  }

  function showCardProgress(card, current, totalItems, text) {
    const box = card.querySelector('.ex-progress');
    if (!box) return;
    const done = Number(current) || 0;
    const all = Number(totalItems) || 0;
    const percent = all > 0 ? Math.min(100, Math.round((done / all) * 100)) : 0;
    box.hidden = false;
    box.querySelector('.ex-progress-fill').style.width = percent + '%';
    box.querySelector('.ex-progress-text').textContent = text ||
      (all > 0 ? 'Descargando ' + done + ' de ' + all + ' (' + percent + '%)' : 'Descargando modpack...');
  }

  function hideCardProgress(card) {
    const box = card.querySelector('.ex-progress');
    if (box) box.hidden = true;
  }

  function setupProgressEvents() {
    if (typeof api.onProgress !== 'function') return;
    try {
      // The modpack importer reports file names, so progress belongs to the card being installed.
      api.onProgress((data) => {
        if (!data || data.type !== 'modpack') return;
        const card = activeModpackCard;
        if (!card || !card.isConnected || card.querySelector('.ex-action').dataset.state !== 'loading') return;
        const current = Number(data.current) || 0;
        const totalItems = Number(data.total) || 0;
        const label = totalItems > 0
          ? 'Descargando ' + current + ' de ' + totalItems
          : 'Descargando modpack...';
        showCardProgress(card, current, totalItems, label);
      });
    } catch {
      // Progress is optional feedback; installs still report success or failure.
    }
  }

  function ensureDrawer() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'ex-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<aside class="ex-drawer" role="dialog" aria-modal="true" aria-labelledby="ex-drawer-title" tabindex="-1">' +
        '<header class="ex-drawer-head">' +
          '<h2 class="ex-drawer-title" id="ex-drawer-title">Detalles</h2>' +
          '<button type="button" class="ex-icon-btn ex-drawer-close" aria-label="Cerrar detalles">' + ico('x') + '</button>' +
        '</header>' +
        '<div class="ex-drawer-body" id="ex-drawer-body"></div>' +
      '</aside>';
    document.body.appendChild(overlay);
    drawer = overlay.querySelector('.ex-drawer');
    drawerBody = overlay.querySelector('#ex-drawer-body');
    closeButton = overlay.querySelector('.ex-drawer-close');

    closeButton.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeDrawer();
    });
    drawerBody.addEventListener('click', (event) => {
      const retry = event.target.closest('.ex-retry[data-detail-id]');
      if (retry) {
        openDetail(retry.getAttribute('data-detail-id'));
        return;
      }
      const link = event.target.closest('.ex-link');
      if (!link || typeof api.openExternal !== 'function') return;
      const url = link.getAttribute('data-url') || '';
      if (!/^https?:\/\//i.test(url)) return;
      try {
        api.openExternal(url);
      } catch {
        toast({ type: 'error', title: 'No se pudo abrir el enlace', message: 'Inténtalo de nuevo.' });
      }
    });
  }

  function openDrawer() {
    if (drawerOpen) return;
    drawerOpen = true;
    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.addEventListener('keydown', onDrawerKeydown, true);
    window.requestAnimationFrame(() => closeButton.focus());
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    detailToken++;
    overlay.hidden = true;
    document.removeEventListener('keydown', onDrawerKeydown, true);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  }

  function onDrawerKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(drawer.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      .filter((node) => node.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      drawer.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function openDetail(id) {
    if (!id) return;
    const token = ++detailToken;
    openDrawer();
    drawerBody.innerHTML =
      '<div class="ex-drawer-loading">' + ico('loader', 'ex-spin') + ' Cargando detalles...</div>';

    try {
      const result = await call('modrinthProject', id);
      if (token !== detailToken || !drawerOpen) return;
      if (!result || result.success === false || !result.project) {
        throw new Error((result && result.error) || 'No se pudo cargar el proyecto');
      }
      renderDetail(result.project);
    } catch (err) {
      if (token !== detailToken || !drawerOpen) return;
      drawerBody.innerHTML =
        '<div class="ex-state ex-state-error">' +
          '<span class="ex-state-icon">' + ico('alert-triangle') + '</span>' +
          '<h3 class="ex-state-title">No pudimos cargar los detalles</h3>' +
          '<p class="ex-state-text">' + esc(errorMessage(err)) + '</p>' +
          '<button class="ex-retry" type="button" data-detail-id="' + esc(id) + '">' + ico('refresh-cw') + ' Reintentar</button>' +
        '</div>';
    }
  }

  function renderDetail(project) {
    const title = String(project.title || 'Proyecto sin título');
    const iconUrl = safeHref(project.icon);
    const iconHtml = iconUrl
      ? '<img class="ex-detail-icon" src="' + iconUrl + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="ex-detail-icon ex-card-icon-placeholder">' + ico('package') + '</span>';

    const linkDefs = [
      { key: 'source', label: 'Fuente', icon: 'external-link' },
      { key: 'wiki', label: 'Wiki', icon: 'list' },
      { key: 'discord', label: 'Discord', icon: 'sparkles' }
    ];
    const links = linkDefs
      .map((item) => ({ ...item, url: safeHref(project[item.key]) }))
      .filter((item) => item.url);
    const linksHtml = links.length
      ? '<section class="ex-detail-section"><h3 class="ex-section-label">Enlaces</h3><div class="ex-link-row">' +
        links.map((item) =>
          '<button type="button" class="ex-link" data-url="' + item.url + '">' + ico(item.icon) + ' ' + item.label + '</button>'
        ).join('') + '</div></section>'
      : '';

    const gallery = (Array.isArray(project.gallery) ? project.gallery : []).map(safeHref).filter(Boolean);
    const galleryHtml = gallery.length
      ? '<section class="ex-detail-section"><h3 class="ex-section-label">Galería</h3><div class="ex-gallery">' +
        gallery.map((url) =>
          '<img class="ex-gallery-img" src="' + url + '" alt="Imagen de ' + esc(title) + '" loading="lazy" referrerpolicy="no-referrer">'
        ).join('') + '</div></section>'
      : '';

    const pills = (values, limit) => (Array.isArray(values) ? values : []).slice(0, limit)
      .map((value) => '<span class="ex-pill">' + esc(value) + '</span>').join('');
    const loaders = pills(project.loaders, 8);
    // Newest releases first; snapshots and pre-releases are noise here.
    const versions = pills((project.gameVersions || []).filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v)).reverse(), 8);
    const metaHtml = (loaders || versions)
      ? '<section class="ex-detail-section">' +
        (loaders ? '<h3 class="ex-section-label">Cargadores</h3><div class="ex-pill-row">' + loaders + '</div>' : '') +
        (versions ? '<h3 class="ex-section-label">Versiones</h3><div class="ex-pill-row">' + versions + '</div>' : '') +
        '</section>'
      : '';

    drawerBody.innerHTML =
      '<div class="ex-detail-head">' + iconHtml +
        '<div class="ex-detail-heading">' +
          '<h3 class="ex-detail-title">' + esc(title) + '</h3>' +
          '<p class="ex-detail-desc">' + esc(project.description || 'Sin descripción.') + '</p>' +
          '<span class="ex-detail-downloads">' + ico('download') + ' ' + formatDownloads(project.downloads) + ' descargas</span>' +
        '</div>' +
      '</div>' +
      linksHtml + galleryHtml + metaHtml +
      '<section class="ex-detail-section"><h3 class="ex-section-label">Descripción</h3>' +
        '<div class="ex-md">' + renderMarkdown(project.body) + '</div></section>';
  }

  const observer = new MutationObserver(() => {
    const active = section.classList.contains('active');
    if (active && !wasActive) {
      wasActive = true;
      activate();
    } else if (!active && wasActive) {
      wasActive = false;
      closeDrawer();
    }
  });
  observer.observe(section, { attributes: true, attributeFilter: ['class'] });

  if (section.classList.contains('active')) {
    wasActive = true;
    activate();
  }
})();
