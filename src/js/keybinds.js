// -*- coding: utf-8 -*-
/**
 * the script is a simple JavaScript library for keyboard shortcut.
 * the keybinds is a factory class of Keybind[s](shortcutkey[s])
 *
 * Usage:
 * - add Keybind(Control+y)
 *   keybinds.add(element, 'C-y', function (event, [object Keybind]) { ... }, false)
 *                 .add(element, 'C-x', function (event, [object Keybind]) { ... }, false);
 * - remove Keybind
 *   keybinds.remove([object Keybind]);
 *   or
 *   keybinds.removeByKey('C-y');
 *   or
 *   keybinds.removeByKey('C-y', element);
 * - get key
 *   var textform = document.getElementById('text-form');
 *   keybinds.getKey(textform, function (key, event) { ... });
 * - get Keybinds
 *   - all keybinds
 *     var keybinds = keybinds.getKeybinds();
 *   - by key
 *     var keybinds = keybinds.getKeybinds('C-y');
 *   - by element
 *     var keybinds = keybinds.getKeybinds(window);
 *   - by key and element
 *     var keybinds = keybinds.getKeybinds('C-y', window);
 */

(function () {

  var keybinds = {},
  // object DOMWindow
      root = this,
      previous_keybinds = null,
  // keybinds variables
      binding_elements = null,
      pool = [],
      key_event = 'keydown',
      key_codes = {
        9: 'TAB',
        27: 'ESC',
        33: 'PageUp',
        34: 'PageDown',
        35: 'End',
        36: 'Home',
        37: 'Left',
        38: 'Up',
        39: 'Right',
        40: 'Down',
        45: 'Insert',
        46: 'Delete',
        112: 'F1',
        113: 'F2',
        114: 'F3',
        115: 'F4',
        116: 'F5',
        117: 'F6',
        118: 'F7',
        119: 'F8',
        120: 'F9',
        121: 'F10',
        122: 'F11',
        123: 'F12'
      },
      skey_codes = {
        8: 'BS',
        10: 'RET',
        13: 'RET',
        32: 'SPC'
      },
      modifier_keys = {
        'altKey': 'A',
        'ctrlKey': 'C',
        'metaKey': 'M',
        'shiftKey': 'S'
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
    return !!node.nodeName.match(/^(?:input|textarea)$/i);
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
        if (isInputable(evt.target)) {
          return;
        }
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

  if (binding_elements === null) {
    init();
  }

}());
