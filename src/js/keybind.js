/**
 * MultiLookup keybind.js
 * @author jimo1001
 */


/**
 * Entity of Keybind
 * @param element a DOM element
 * @param key shortcut key (e.x. Control + y -> C-y)
 * @param callback a callback function
 * @param force execute the callback even where at the input/textarea
 */
function Keybind(element, key, callback, force) {
    this.element = element;
    this.key = key;
    this.callback = callback;
    this.force = (force === undefined) ? false : force;
}
Keybind.prototype.execute = function(evt) {
    if (!this.force)
        if (isForm(evt.target)) return;
    this.callback.call(this.element, evt, this);
};

/**
 * Factory of Keybind
 */
var KeybindFactory = {
    _binding_elements: [],
    _type: 'keydown',
    _binds: [],
    keys: {
        9: "TAB",
        27: "ESC",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "Left",
        38: "Up",
        39: "Right",
        40: "Down",
        45: "Insert",
        46: "Delete",
        112: "F1",
        113: "F2",
        114: "F3",
        115: "F4",
        116: "F5",
        117: "F6",
        118: "F7",
        119: "F8",
        120: "F9",
        121: "F10",
        122: "F11",
        123: "F12"
    },
    skeys: {
        8: "BS",
        10: "RET",
        13: "RET",
        32: "SPC"
    },
    mkeys: {
        'altKey': "A",
        'ctrlKey': "C",
        'metaKey': "M",
        'shiftKey': "S"
    },

    init: function() {
        if (this._binding_elements && (this._binding_elements.length > 0))
            this.unbind();
        this.bind();
    },

    bind: function(elem) {
        if (!elem) elem = window;
        if (elem in this._binding_elements) return;
        elem.addEventListener(this._type, this._listener, false);
        this._binding_elements.push(elem);
    },

    unbind: function(elem) {
        var listeners = this._listeners;
        if (listeners === null) return;
        this._binding_elements.forEach(function(e, i) {
            if ((elem === e) || !elem) {
                e.removeEventListener(this._type, this._listener, false);
                delete this._binding_elements[i];
            }
        });
    },

    _listener: function(evt) {
        var self = KeybindFactory;
        var key = self.getKeyname(evt);
        if (key === "") return;
        self._binds.forEach(function(sk) {
            if ((sk.key === key) && ((sk.element === evt.target) || (/^(?:\[object DOMWindow\]|\[object HTMLDocument\])$/.test(sk.element.toString())))) {
                sk.execute(evt);
            }
        });
    },

    add: function(element, key, callback, force) {
        var keybind = new Keybind(element, key, callback, force);
        this._binds.push(keybind);
        return keybind;
    },

    getKeybinds: function() {
        return this._binds;
    },

    getKeyname: function(evt, isModiferKey) {
        var key = [], k = '';
        var mkeys = this.mkeys;
        for (mk in mkeys) {
            if (evt[mk] && mkeys.hasOwnProperty(mk)) {
                if (isModiferKey) return mk;
                if ((mk == "metaKey") && (evt["ctrlKey"] === true))
                    continue;
                key.push(this.mkeys[mk]);
            }
        }
        if (isModiferKey) return "";
        if (evt.which) {
            k = this.skeys[evt.which] || this.keys[evt.which] || String.fromCharCode(evt.which).toLowerCase();
        } else if (evt.keyCode) {
            k = this.keys[evt.keyCode];
        }

        if (/^(?:[a-zA-Z0-9]+)$/.test(k)) {
            key.push(key.length ? '-'+k : k);
            return key.join('');
        } else {
            return "";
        }

    },

    remove: function(keybind) {
        if (keybind) {
            this._binds = this._binds.filter(function(bind, index, array) {
                return (keybind != bind);
            });
        }
    },

    removeAll: function() {
        this._binds.forEach(function(bind) {
            delete bind;
        });
        this._binds = [];
    },

    removeByKeyname: function(element, key) {
        this._binds = this._binds.filter(function(keybind, index, array) {
            return (!(keybind.element == element && keybind.key == key));
        });
    }
};

/**
 * the method checks whether a input field or a textarea.
 * @return boolean if the node is input or textarea, return true.
 */
function isForm(node) {
    return /^(?:input|textarea)$/.test(node.nodeName.toLowerCase());
}
