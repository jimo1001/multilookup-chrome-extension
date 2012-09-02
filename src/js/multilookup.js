// -*- coding: utf-8; mode: js2; -*-
/**
 * MultiLookup content script.
 * http://www.simplivillage.com/trac/wiki/ChromeExtension/MultiLookup
 *
 * (c) 2011, jimo1001
 * Released under the New BSD License.
 */

/* ----------------------------------------------------------------------------
 * Utilities
 * ---------------------------------------------------------------------------*/

(function () {

  var keybinds = {},
  // object DOMWindow
  root = this,
  previous_keybinds = null,
  // keybinds variables
  binding_elements = [],
  pool = [],
  key_event = 'keydown',
  key_codes = {
    9 : 'TAB',
    27 : 'ESC',
    33 : 'PageUp',
    34 : 'PageDown',
    35 : 'End',
    36 : 'Home',
    37 : 'Left',
    38 : 'Up',
    39 : 'Right',
    40 : 'Down',
    45 : 'Insert',
    46 : 'Delete',
    112 : 'F1',
    113 : 'F2',
    114 : 'F3',
    115 : 'F4',
    116 : 'F5',
    117 : 'F6',
    118 : 'F7',
    119 : 'F8',
    120 : 'F9',
    121 : 'F10',
    122 : 'F11',
    123 : 'F12'
  },
  skey_codes = {
    8 : 'BS',
    10 : 'RET',
    13 : 'RET',
    32 : 'SPC'
  },
  modifier_keys = {
    'altKey' : 'A',
    'ctrlKey' : 'C',
    'metaKey' : 'M',
    'shiftKey' : 'S'
  };
  if (!root && typeof window) {
    root = window;
  }
  previous_keybinds = (root && root.keybinds) || {};
  // set global
  root.keybinds = keybinds;
  keybinds.noConflict = function () {
    root.keybinds = previous_keybinds;
    return keybinds;
  };

  /**
   * the method checks whether a input field or a textarea.
   * @return {boolean} if the node is input or textarea, return true.
   * @param {Element} node a DOM Element(HTMLElement/HTMLDocument/DOMWindow)
   */
  function isInputable(node) {
    return !!node.nodeName.toLowerCase().match(/^(?:input|textarea)$/);
  }
  keybinds.isInputable = isInputable;

  /**
   * Keybind entity
   * @constructor
   * @param {object} element a DOM Element (HTMLElement/HTMLDocument/DOMWindow)
   * @param {string} key the key string (e.x. Control + y -> C-y)
   * @param {function} callback a callback function
   * @param {boolean} force force execute the callback even where at the input/textarea
   */
  function Keybind(element, key, callback, force) {
    this.element = element;
    this.key = key;
    this.callback = callback;
    this.force = (force === undefined) ? false : force;

    this.execute = function (evt) {
      if (!this.force) {
        if (isInputable(evt.target)) { return; }
      }
      this.callback.call(this.element, evt, this);
    };
    this.toString = function () {
      return '[object Keybind]';
    };
  }
  keybinds.Keybind = Keybind;

  /**
   * create Keybind object.
   * @return {object} the own object(keybinds)
   * @param {object} element a DOM Element (HTMLElement/HTMLDocument/DOMWindow)
   * @param {string} key the key string (e.x. Control + y -> C-y)
   * @param {function} callback a callback function
   * @param {boolean} force force execute the callback even where at the input/textarea
   */
  function add(element, key, callback, force) {
    if (element && key) {
      pool.push(new Keybind(element, key, callback, force));
    }
    return keybinds;
  }
  keybinds.add = add;

  /**
   * return Keybind objects.
   * @return {Array} the list of Keybind objects.
   * @param {Element} element a DOM Element(HTMLElement/HTMLDocument/DOMWindow)
   * @param {string} key the key string (e.x. Control + y -> C-y)
   */
  function getKeybinds(element, key) {
    var binds = [], i = 0;
    if ((!element && !key) || (!pool || pool.length < 1)) {
      return pool;
    }
    if (typeof element === 'string') {
      key = element;
      element = undefined;
    }
    for (i = 0; i < pool.length; i += 1) {
      if (((key === undefined) || (pool[i].key === key)) &&
          ((element === undefined) || (pool[i].element === element))) {
        binds.push(pool[i]);
      }
    }
    return binds;
  }
  keybinds.getKeybinds = getKeybinds;

  /**
   * get a key from KeyboardEvent(keydown etc..)
   * @return {string} the key string (Ctrol + y -> 'C-y')
   * @param {KeyboardEvent} evt a KeyboardEvent object
   * @param {boolean} isModifierKey if a getting key is a modifier key only, the attribute is ture.
   */
  function getKeyFromEvent(evt, isModifierKey) {
    var key = [], k = '', mk = null;
    for (mk in modifier_keys) {
      if (modifier_keys.hasOwnProperty(mk) && evt[mk]) {
        if (isModifierKey) {
          return mk;
        }
        if (!((mk === 'metaKey') && (evt.ctrlKey === true))) {
          key.push(modifier_keys[mk]);
        }
      }
    }
    if (isModifierKey) {
      return undefined;
    }
    if (evt.which) {
      k = skey_codes[evt.which] || key_codes[evt.which] || String.fromCharCode(evt.which).toLowerCase();
    } else if (evt.keyCode) {
      k = key_codes[evt.keyCode];
    }

    if (k.match(/^(?:[a-zA-Z0-9]+)$/)) {
      key.push(key.length ? '-' + k : k);
      return key.join('');
    } else {
      return undefined;
    }
  }
  keybinds.getKeyFromEvent = getKeyFromEvent;

  /**
   * get a key string.
   * @return {string} the key string (Control + y -> 'C-y')
   * @param {Element} element a DOM Element(optional, default:window)
   * @param {function} callback (required)
   * @param {boolean} isModifierKey if a getting key is a modifier key only, the attribute is ture.
   */
  function getKey(element, callback, isModifierKey) {
    if (typeof element === 'function') {
      if (callback !== undefined) {
        isModifierKey = callback;
      }
      callback = element;
      element = root.window;
    }
    if (!element || (typeof callback !== 'function')) {
      return undefined;
    }
    element.addEventListener('keydown', function (evt) {
      var key = getKeyFromEvent(evt, !!isModifierKey);
      callback.call(element, key, evt);
    }, false);
  }
  keybinds.getKey = getKey;

  /**
   * remove a Keybind from Keybind object.
   * @param {object} keybind a Keybind object
   */
  function remove(keybind) {
    if (keybind) {
      pool = pool.filter(function (kb) {
        return (keybind !== kb);
      });
    }
  }
  keybinds.remove = remove;

  /**
   * remove a Keybind from a Element and a key
   * @param {Element} element a DOM Element
   * @param {string} key the key string (e.x. Control + y -> C-y)
   */
  function removeByKey(key, element) {
    pool = pool.filter(function (kb) {
      return (!((!element || kb.element === element) && kb.key === key));
    });
  }
  keybinds.removeByKey = removeByKey;

  /**
   * remove all Keybinds
   */
  function removeAll() {
    var i = 0;
    if (!pool || pool.length === 0) {
      return;
    }
    for (i = 0; i < pool.length; i += 1) {
      delete pool[i];
    }
  }
  keybinds.removeAll = removeAll;

  function listener(evt) {
    var key = getKeyFromEvent(evt), i = 0;
    if (!key) {
      return;
    }
    for (i = 0; i < pool.length; i += 1) {
      if ((pool[i].key === key) &&
          ((pool[i].element === evt.target) ||
           (pool[i].element.toString().match(/^(?:\[object (DOM)?Window\]|\[object (HTML)?Document\])$/)))) {
        pool[i].execute(evt);
      }
    }
  }

  /**
   * @param {Element} element add event the DOM Element (default: window)
   */
  function bind(element) {
    var i = 0;
    element = element || root.window || null;
    if (binding_elements === null) {
      binding_elements = [];
    }
    if (!element) {
      return;
    }
    for (i = 0; i < binding_elements.length; i += 1) {
      if (element === binding_elements[i]) {
        return;
      }
    }
    element.addEventListener(key_event, listener, false);
    binding_elements.push(element);
    return keybinds;
  }
  keybinds.bind = bind;

  /**
   * @param {Element} element remove event the DOM Element(HTMLELement/HTMLDocument/DOMWindow)
   */
  function unbind(element) {
    var i = 0;
    if (!binding_elements || (binding_elements.length === 0)) {
      return;
    }
    for (i = 0; i < binding_elements.length; i += 1) {
      if ((element === binding_elements[i]) || !element) {
        binding_elements[i].removeEventListener(key_event, listener, false);
        delete binding_elements[i];
      }
    }
    return keybinds;
  }
  keybinds.unbind = unbind;

  /**
   * initialize
   */
  function init() {
    if (binding_elements && (binding_elements.length > 0)) {
      unbind();
    }
    bind();
    return keybinds;
  }
  keybinds.init = init;

  init();

}());

/**
 * the method checks whether a anchor.
 * @return boolean if the node is anchor, return true.
 */
function isAnchor(node) {
  return ((node.nodeName === 'A') || (node.parent && (node.parent.nodeName === 'A')));
}

/**
 * the method checks array
 */
function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]';
}

/**
 * if a selection existed, return true.
 */
function hasSelection(evt) {
  var doc = window;
  if (evt) {
      doc = evt.target.ownerDocument || window;
  }
  return doc.getSelection().type === 'Range';
}

/**
 * get elements by CSS id
 */
function $() {
  return document.getElementById.apply(document, arguments);
}

/**
 * create a element added attributes.
 * @param name
 * @param attr
 * @param children
 * @returns a created element.
 */
function $n(name, attr, children) {
  var ret = document.createElement(name);
  var v, k, i, len;
  for (k in attr) {
    if (attr.hasOwnProperty(k)) {
      v = attr[k];
      if (k === 'class') {
        ret.className = v;
      } else {
        ret.setAttribute(k, v);
      }
    }
  }
  if (children) {
    switch (typeof children) {
    case 'string':
      ret.appendChild(document.createTextNode(children));
      break;
    case 'object':
      for (i = 0, len = children.length; i < len; i++) {
        var child = children[i];
        if (typeof child === 'string') {
          ret.appendChild(document.createTextNode(child));
        } else {
          ret.appendChild(child);
        }
      }
      break;
    }
  }
  return ret;
}

function trim(text) {
  return (text || '').replace(/^(\s|\u00A0)+|(\s|\u00A0)+$/g, '');
}

// via. http://d.hatena.ne.jp/amachang/20100624/1277359266
function isElementInDocument(node) {
  if (document === node) {
    return true;
  }
  else if (document.compareDocumentPosition) {
    return !!(document.compareDocumentPosition(node) & 16);
  }
  else if (document.documentElement.contains) {
    var el = document.documentElement;
    return el === node || el.contains(node);
  }
  else {
    do {
      if (node === document) {
        return true;
      }
      node = node.parentNode;
    } while (node);
    return false;
  }
}

/* ----------------------------------------------------------------------------
 * Multilookup functions
 * ---------------------------------------------------------------------------*/
(function () {
  //global variables
  var SITEINFO = [];
  var CONFIG = {};

  /**
   * Entity of Lookup Result
   */
  function Result(id, context, result) {
    this.id = id;
    this.context = context;
    this.element = null;
    this.article_element = null;
    this.height = 0;
    this.info_id = result.siteinfo_id;
    this.result_text = result.result_text;
    this.url = result.url;
    this.hidden = false;
    // create a element
    this.createElement();
  }

  Result.prototype.createElement = function () {
    var self = this;

    this.element = $n('div', { 'class': 'MLu_result ' + SITEINFO[this.info_id].type }, null);
    var link = $n('a', { href: this.url, target: '_blank' }, SITEINFO[this.info_id].name);
    var icon = (SITEINFO[this.info_id].icon) ? $n('img', { src: SITEINFO[this.info_id].icon }, null) : null;
    var title = $n('div', { 'class': 'MLu_result_title' }, icon ? [icon, link] : [link]);
    var article = $n('div', { 'class': 'MLu_result_article' }, null);
    title.addEventListener('click', function (evt) {
      if (!isAnchor(evt.target)) {
        self.toggle(article);
      }
      evt.stopPropagation();
    }, true);
    article.innerHTML = this.result_text;
    article.style.opacity = 0;
    this.element.appendChild(title);
    this.element.appendChild(article);
    this.article_element = article;
    window.setTimeout(function () {
      self.height = article.offsetHeight;
      article.style.maxHeight = self.height + 'px';
      article.style.opacity = 1;
      article.style.display = 'block';
      window.setTimeout(function () {
        article.style.webkitTransitionProperty = 'all';
      }, 100);
    }, 100);
    return this.element;
  };

  Result.prototype.removeElement = function () {
    if (this.element) {
      this.element.parentNode.removeChild(this.element);
    }
  };

  Result.prototype.getElement = function () {
    return this.element;
  };

  Result.prototype.show = function (element) {
    var self = this;
    var e = element || this.article_element;
    e.style.display = 'block';
    window.setTimeout(function () {
      e.style.opacity = 1;
      e.style.maxHeight = self.height + 'px';

    }, 100);
    if (!element) {
      this.hidden = false;
    }
  };

  Result.prototype.hide = function (element) {
    var e = element || this.article_element;
    e.style.maxHeight = '0';
    e.style.opacity = 0;
    window.setTimeout(function () {
      e.style.display = 'none';
    }, 500);
    if (!element) {
      this.hidden = true;
    }
  };
  Result.prototype.toggle = function (element) {
    var e = element || this.article_element;
    var style = e.getAttribute('style');
    var hidden = (element) ? !(style === null || style.match('display: block')) : this.hidden;
    if (hidden) {
      this.show(e);
    } else {
      this.hide(e);
    }
  };

  /**
   * Entity of Lookup ResultGroup
   */
  function ResultGroup(id, context, resultList) {
    this.id = id;
    this.context = context;
    this.element = null;
    this.cells = [];
    this.results = [];
    this.results_length = 0;
    this.hidden = false;
    this.indicator = null;
    this._hidden_indicator = false;

    this.createElement();
    if (resultList) {
      this.addResultList(resultList);
    } else {
      this.showIndicator();
    }
  }
  ResultGroup.prototype.getElement = function () {
    return this.element;
  };

  ResultGroup.prototype.createElement = function () {
    var self = this;
    var close = $n('div', { 'class': 'MLu_group_close' }, void(0));
    close.addEventListener('click', function (evt) {
      ResultGroupFactory.remove(self.id);
      evt.stopPropagation();
    }, true);
    var title = $n('div', { 'class': 'MLu_group_title' },
                   [ $n('div', { 'class': 'title' }, 'Search Text: '),
                     $n('div', { 'class': 'content' }, this.context),
                     close ]);
    title.addEventListener('click', function (evt) {
      self.toggle();
      evt.stopPropagation();
    }, false);
    this.element = $n('div', { 'class': 'MLu_group', style: this.getGroupStyle() }, [title]);
    return this.element;
  };

  ResultGroup.prototype.createCellElement = function () {
    var table = $n('div', { 'class': 'MLu_table' }, void(0)), i;
    var result_cell_length = CONFIG.result_cell_length || 1;
    result_cell_length = (result_cell_length < this.results_length) ? result_cell_length : this.results_length;
    for (i = 0; i < result_cell_length; i++) {
      var cell = $n('div', { 'class': 'MLu_cell', style: 'width: ' + (100 / result_cell_length).toFixed(1) + '%' }, void(0));
      table.appendChild(cell);
      this.cells.push({element: cell, results: [], height: 0});
    }
    this.element.appendChild(table);
  };

  ResultGroup.prototype.getGroupStyle = function () {
    var position = CONFIG.result_position || 'bottom';
    var size = CONFIG.result_size || 50;
    var font_size = CONFIG.font_size || 100;
    var font_family = CONFIG.font_family;
    var style = 'font-size: ' + font_size + '%;';
    if (font_family) {
      style += ' font-family: \"' + font_family + '\";';
    }
    switch (position) {
    case 'top':
      return style + ' top: 0; right: 0; left: 0; max-height: ' + size + '%;';
    case 'right':
      return style + ' top: 0; right: 0; bottom: 0; max-width: ' + size + '%;';
    case 'bottom':
      return style + ' right: 0; bottom: 0; left: 0; max-height: ' + size + '%;';
    case 'left':
      return style + ' top: 0; bottom: 0; left: 0; max-width: ' + size + '%;';
    default:
      return style + ' right: 0; bottom: 0; left: 0; max-height: ' + size + '%;';
    }
  };

  ResultGroup.prototype.removeElement = function () {
    var e = this.element;
    if (e) {
      e.style.opacity = '0';
      window.setTimeout(function () {
        e.parentNode.removeChild(e);
      }, 500);
    }
    this.results = [];
  };

  ResultGroup.prototype.addResult = function (result) {
    if (this.cells.length === 0) {
      if (this.results_length === 0) {
        this.results_length = 1;
      }
      this.createCellElement();
    }
    var r, cell = null, height = 0, e;
    r = new Result(this.id, this.context, result);
    cell = null;
    if (this.cells.length === 1) {
      cell = this.cells[0];
    } else {
      height = 0;
      this.cells.forEach(function (v, i) {
        if ((i === 0) || (height > v.height)) {
          cell = v;
          height = v.height;
        }
      });
    }
    e = r.getElement();
    cell.results.push(e);
    cell.element.appendChild(e);
    cell.height += e.offsetHeight;
    this.results.push(r);
    this.hideIndicator();
  };

  ResultGroup.prototype.addResultList = function (results) {
    var self = this, i;
    if (this.cells.length === 0) {
      if (this.results_length === 0) {
        results.forEach(function () {
          self.results_length++;
        });
      }
      this.createCellElement();
    }
    for (i = 0; i < results.length; i++) {
      self.addResult(results[i]);
    }
  };

  ResultGroup.prototype.addMessage = function (message, type) {
    type = type || 'notice';
    var msg = null, e = null;
    msg = $n('span', { 'class': 'MLu_message_' + type }, void(0));
    msg.innerHTML = message;
    e = $n('div', { 'class': 'MLu_group_message' }, [msg]);
    this.element.appendChild(e);
    this.hideIndicator();
  };

  ResultGroup.prototype.show = function () {
    var self = this, i;
    for (i = 0; i < self.results.length; i++) {
      self.results[i].show();
    }
    this.hidden = false;
  };

  ResultGroup.prototype.hide = function () {
    var self = this, i;
    for (i = 0; i < self.results.length; i++) {
      self.results[i].hide();
    }
    this.hidden = true;
  };

  ResultGroup.prototype.toggle = function () {
    if (this.hidden) {
      this.show();
    } else {
      this.hide();
    }
  };

  ResultGroup.prototype.showIndicator = function () {
    if (this.indicator === null) {
      this.indicator = $n('div', { 'class': 'MLu_indicator' }, 'Now loading...');
      this.element.appendChild(this.indicator);
    } else {
      if (this._hidden_indicator) {
        this.indicator.setAttribute('style', 'display: block');
        this._hidden_indicator = false;
      }
    }
  };

  ResultGroup.prototype.hideIndicator = function () {
    if (!this._hidden_indicator && (this.indicator !== null)) {
      this.indicator.setAttribute('style', 'display: none');
      this._hidden_indicator = true;
    }
  };

  /**
   * Factory of ResultGroup
   */
  var ResultGroupFactory = {
    count: 0,
    _node: null,
    _resultGroups: [],

    init: function (node) {
      this.count = 0;
      this._node = node;
      this._resultGroups = [];
    },

    add: function (context, results) {
      var id = this.count, group, e;
      group = new ResultGroup(id, context, results);
      e = group.getElement();
      this._resultGroups.push(group);
      this._node.appendChild(e);
      this.count++;
      window.setTimeout(function () {
        e.style.opacity = '1';
      }, 100);
      return id;
    },

    getLastGroup: function () {
      var id = this.count - 1;
      return this.getGroupById(id);
    },

    getGroupById: function (id) {
      if (id === undefined) {
        return undefined;
      }
      return this._resultGroups[id];
    },

    getGroup: function (id) {
      if (id === undefined) {
        return this.getLastGroup();
      } else {
        return this.getGroupById(id);
      }
    },

    remove: function (id) {
      var group = this._resultGroups[id];
      if (group) {
        group.removeElement();
        this._resultGroups[id] = null;
      }
    },

    removeAll: function () {
      var self = ResultGroupFactory,
          group = null;
      if (!self._resultGroups) {
          return;
      }
      for (var i = 0, len = self._resultGroups.length; i < len; i++) {
        group = self._resultGroups[i];
        if (group) {
          group.removeElement();
          self._resultGroups[i] = null;
        }
      }
    }
  };

  /**
   * MultiLookup - main method
   */
  (function () {
    var node = null, port = null, loadings = 0, indicator = null;

    function init() {
      // create HTML Element
      initElement();
      // connect to backgound (key: MultiLookup)
      port = chrome.extension.connect({name:'MultiLookup'});
      port.postMessage({id:'siteinfo'});
      port.postMessage({id:'config'});
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(function () {
        port = null;
      });
    }

    function initElement() {
      // initialize MultiLokup Element.
      if (!node) {
        node = $n('div', {id: 'MultiLookup'}, void(0));
        ResultGroupFactory.init(node);
      }
      if (!isElementInDocument(node)) {
        // the node append to document.body.
        document.body.appendChild(node);
      }
    }

    function loadedConfigCallback(config) {
      var opacity = 0.80, theme = 'black', entries = {};
      if (!node || node.parentNode) {
        initElement();
      }
      opacity = (config.result_opacity) ? config.result_opacity / 100 : opacity;
      theme = config.result_theme || theme;
      entries = config.keybind.entries || entries;
      node.setAttribute('style', 'opacity: ' + opacity);
      node.setAttribute('class', theme);
      setTimeout(function () {
        var docs = [document], doc, i, j, iframes;
        iframes = document.querySelectorAll('iframe');
        if (iframes && (iframes.length > 0)) {
          for (i = 0; i < iframes.length; i++) {
            if (iframes[i].contentDocument) {
              docs.push(iframes[i].contentDocument);
            }
          }
        }
        for (j = 0; j < docs.length; j++) {
          doc = docs[j];
          if (doc) {
            doc.addEventListener('mouseup', onMouseup, true);
            doc.addEventListener('click', onClick, false);
            if (config.enable_dblclick_lookup) {
              doc.addEventListener('dblclick', onDblClick, true);
            }
          }
        }
      }, 1000);
      // ShortcutKey Event
      keybinds.removeAll();
      keybinds.bind(window);
      // remove all results
      keybinds.add(window, config.keybind.close, ResultGroupFactory.removeAll, false);
      var shortcutkeys = {}, key, j;
      for (j in entries) {
        if (entries.hasOwnProperty(j) && entries[j]) {
          key = entries[j];
          if (!shortcutkeys[key]) {
            shortcutkeys[key] = [];
          }
          shortcutkeys[key].push(j);
        }
      }
      for (key in shortcutkeys) {
        if (shortcutkeys.hasOwnProperty(key)) {
          setShortcutKey(shortcutkeys[key], key, window);
        }
      }
    }

    function setShortcutKey(id, keyname, node) {
      if (!node) {
        node = document;
      }
      keybinds.add(node, keyname, function () {
        lookup(node.getSelection().toString(), id);
      }, false);
    }

    /**
     * the method for mouse up event.
     * @param evt
     */
    function onMouseup(evt) {
      var node = window, text, wheel = false, undef;
      if (evt) {
        node = evt.target.ownerDocument || node;
      }
      text = trim(node.getSelection().toString());
      if (!text) {
        return;
      }
      var enable_middle_click_lookup = CONFIG.enable_middle_click_lookup;
      var enable_context_menus = CONFIG.enable_context_menus;

      // update context menu (unsupport)
      if (enable_context_menus || (enable_context_menus === undef)) {
        if (evt.button === 0) {
          postMessage({id: 'contextmenu-update', value: text});
        }
      }

      if (enable_middle_click_lookup || (enable_middle_click_lookup === undef)) {
        if ((evt.button === 1) && !isAnchor(evt.target)) {
          wheel = true;
        }
      }

      if (!wheel && CONFIG.enable_modifier_key) {
        if (!evt[CONFIG.modifier_key]) {
          return;
        }
      }
      lookup(text);
    }

    function onDblClick(evt) {
      var node = window, text;
      if (evt) {
        node = evt.target.ownerDocument || node;
      }
      text = trim(node.getSelection().toString());
      if (!text) {
        return;
      }
      lookup(text);
    }

    function lookup(text, id) {
      if (!text) {
        return;
      }
      text = trim(text);
      var message = { id: 'lookup', context: text };
      if (id) {
        message.siteinfo_id = id;
      }
      id = ResultGroupFactory.add(text);
      message.result_id = id;
      postMessage(message);
      if (!node || !isElementInDocument(node)) {
        initElement();
      }
    }

    function postMessage(data) {
      if (!port) {
        init();
      }
      port.postMessage(data);
    }

    function onClick(evt) {
      if (evt.target.tagName === 'A') {
        return;
      }
      if (!hasSelection(evt)) {
        ResultGroupFactory.removeAll();
      }
    }

    function onMessage(msg) {
      var id = msg.id;
      var value = msg.value;
      if (!id) {
        return false;
      }
      switch (id) {
      case 'siteinfo':
        if (value) {
          SITEINFO = value;
        }
        break;
      case 'config':
        if (value) {
          CONFIG = value;
        }
        loadedConfigCallback(value);
        break;
      case 'lookup':
        if (value) {
          var status = value.status || 'success';
          var context = value.context;
          var group = ResultGroupFactory.getGroup(value.result_id);
          if (group) {
            if (status === 'success') {
              var results = isArray(value.results) ? value.results : [value.results];
              group.addResultList(results);
            } else {
              group.addMessage(value.results.message, 'error');
            }
          }
        }
        break;
      case 'lookup-begin':
        if (value) {
          ResultGroupFactory.add(value.context);
        }
        break;
      default:
        console.error('unkown message id', msg);
        break;
      }
      return true;
    }

    // Event when loaded a page.
    if (window.top === window.self) {
      init();
    }
  }());
}());

// ### EOF ###
