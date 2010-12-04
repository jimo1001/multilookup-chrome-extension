/**
 * MultiLookup content script.
 * @author jimo1001
 */

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
    this.infoId = result["siteinfo_id"];
    this.resultText = result["result_text"];
    this.url = result["url"];
    this.hidden = false;
    // create a element
    this.createElement();
}

Result.prototype = {
    createElement: function() {
        var self = this;
        
        this.element = $n('div', { class: "MLu_result " + SITEINFO[this.infoId]["type"] });
        var link = $n('a', {href: this.url, target: "_blank"}, SITEINFO[this.infoId]["name"]);
        var icon = (SITEINFO[this.infoId]["icon"]) ? $n('img', { src: SITEINFO[this.infoId]["icon"] }) : null;
        var title = $n('div', { class: "MLu_result_title" }, icon?[icon, link]:[link]);
        var article = $n('div', { class: "MLu_result_article" });
        title.addEventListener('click', function(evt) {
            if (!isAnchor(evt.target))
                self.toggle(article);
            evt.stopPropagation();
        }, true);
        article.innerHTML = this.resultText;
        this.element.appendChild(title);
        this.element.appendChild(article);
        return this.element;
    },
    
    removeElement: function() {
        if (this.element)
            this.element.parentNode.removeChild(this.element); 
    },
    
    getElement: function() {
        return this.element;
    },
    
    show: function(element) {
        var e = element || this.element;
        e.setAttribute('style', "display: block");
        if (!element) this.hidden = false;
    },
    
    hide: function(element) {
        var e = element || this.element;
        e.setAttribute('style', "display: none");
        if (!element) this.hidden = true;
    },
    toggle: function(element) {
        var e = element || this.elment;
        var style = e.getAttribute('style');
        var hidden = (element) ? !(style == null || style.match("display: block")) : this.hidden;
        if (hidden)
            this.show(e);
        else
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
    if (resultList)
        this.addResultList(resultList);
    else
        this.showIndicator();
}
ResultGroup.prototype = {
    getElement: function() {
        return this.element;
    },
    
    createElement: function() {
        var self = this;
        var close = $n('div', {class: "MLu_group_close"});
        close.addEventListener('click', function(evt) {
            ResultGroupFactory.remove(self.id);
            evt.stopPropagation();
        }, true);
        var title = $n('div', {class: "MLu_group_title"},
                [ $n('div', {class: "title"}, "検索文字列: "),
                  $n('div', {class: "content"}, this.context),
                  close ]);
        title.addEventListener('click', function(evt) {
            self.toggle();
            evt.stopPropagation();
        }, false); 
        this.element = $n('div', { class: "MLu_group", style: this.getGroupStyle() }, [title]);
        return this.element;
    },
    
    createCellElement: function() {
        var table = $n('div', { class: "MLu_table" });
        var result_cell_length = CONFIG["result_cell_length"] || 1;
        result_cell_length = (result_cell_length < this.results_length) ? result_cell_length : this.results_length;
        for (var i=0; i<result_cell_length; i++) {
            var cell = $n('div', { class: "MLu_cell", style: "width: "+(100/result_cell_length).toFixed(1)+"%" });
            table.appendChild(cell);
            this.cells.push({element: cell, results: [], height: 0});
        }
        this.element.appendChild(table);
    },
    
    getGroupStyle: function() {
        var position = CONFIG["result_position"] || "bottom";
        var size = CONFIG["result_size"] || "50";
        var font_size = CONFIG["font_size"] || 100;
        var font_family = CONFIG["font_family"];
        
        var style = "font-size: "+font_size+"%;";
        if (font_family)
            style += " font-family: \'"+font_family+"\';";
        
        switch(position) {
            case "top":
                return style+" top: 0; right: 0; left: 0; max-height: "+size+"%;";
            case "right":
                return style+" top: 0; right: 0; bottom: 0; max-width: "+size+"%;";
            case "bottom":
                return style+" right: 0; bottom: 0; left: 0; max-height: "+size+"%;";
            case "left":
                return style+" top: 0; bottom: 0; left: 0; max-width: "+size+"%;";
            default:
                return style+" right: 0; bottom: 0; left: 0; max-height: "+size+"%;";
        }
    },
    
    removeElement: function() {
        if (this.element)
            this.element.parentNode.removeChild(this.element);
        this.results = [];
    },
    
    addResult: function(result) {
        var self = this;
        if (this.cells.length == 0) {
            if (this.results_length == 0)
                this.results_length = 1;
            this.createCellElement();
        }
        var r = new Result(this.id, this.context, result);
        var cell = null;
        if (this.cells.length === 1)
            cell = this.cells[0];
        else {
            var height = 0;
            this.cells.forEach(function(v, i) {
                if ((i == 0) || (height > v.height)) {
                    cell = v;
                    height = v.height;
                }
            });
        }
        var e = r.getElement();
        cell.results.push(e);
        cell.element.appendChild(e);
        cell.height += e.offsetHeight;
        this.results.push(r);
        this.hideIndicator();
    },
    
    addResultList: function(results) {
        var self = this;
        if (this.cells.length == 0) {
            if (this.results_length == 0)
                results.forEach(function(v, i) { self.results_length++; });
            this.createCellElement();
        }
        for (var i=0; i<results.length; i++) {
            self.addResult(results[i]);
        }
    },
    
    addMessage: function(message, type) {
        type = type || "notice";
        var msg = $n("span", {class: "MLu_message_"+type});
        msg.innerHTML = message;
        var e = $n("div", {class: "MLu_group_message"}, [msg]);
        this.element.appendChild(e);
        this.hideIndicator();
    },
    
    show: function() {
        var self = this;
        for (var i=0; i<self.results.length; i++)
            self.results[i].show();
        this.hidden = false;
    },
    
    hide: function() {
        var self = this;
        for (var i=0; i<self.results.length; i++)
            self.results[i].hide();
        this.hidden = true;
    },
    
    toggle: function() {
        if (this.hidden)
            this.show();
        else
            this.hide();
    },
    
    showIndicator: function() {
        if (this.indicator === null) {
            this.indicator = $n('div', {class: "MLu_indicator"}, "Now loading...");
            this.element.appendChild(this.indicator);
        } else {
            if (this._hidden_indicator) {
                this.indicator.setAttribute('style', "display: block");
                this._hidden_indicator = false;
            }
        }
    },
    
    hideIndicator: function() {
        if (!this._hidden_indicator && (this.indicator !== null)) {
            this.indicator.setAttribute('style', "display: none");
            this._hidden_indicator = true;
        }
    }
};

/**
 * Factory of ResultGroup
 */
var ResultGroupFactory = {
    count: 0,
    _node: null,
    _resultGroups: [],
    
    init: function(node) {
        this.count = 0;
        this._node = node;
        this._resultGroups = [];
    },
    
    add: function(context, results) {
        var id = this.count;
        var group = new ResultGroup(id, context, results);
        this._resultGroups.push(group);
        this._node.appendChild(group.getElement());
        this.count++;
        return id;
    },

    getLastGroup: function() {
        var id = this.count-1;
        return this.getGroupById(id);
    },
    
    getGroupById: function(id) {
        if (id == undefined) { return undefined; }
        return this._resultGroups[id];
    },

    getGroup: function(id) {
        if (id == undefined) {
            return this.getLastGroup();
        } else {
            return this.getGroupById(id);
        }
    },

    remove: function(id) {
        var group = this._resultGroups[id];
        if (group) {
            group.removeElement();
            this._resultGroups[id] = null;
        }
    },
    
    removeAll: function() {
        var self = ResultGroupFactory;
        self._resultGroups.forEach(function(group, i) {
            if (group) {
                group.removeElement();
                self._resultGroups[i] = null;
            }
        });
    }
};

/**
 * MultiLookup - main method
 */
var MultiLookup = {
    node: null,
    port: null,
    loadings: 0,
    indicator: null,
    
    init: function() {
        var self = this;
        // create HTML Element
        self.initElement();
        // connect to backgound (key: MultiLookup)
        self.port = chrome.extension.connect({name:"MultiLookup"});
        self.port.postMessage({id:"siteinfo"});
        self.port.postMessage({id:"config"});
        self.port.onMessage.addListener(self.onMessage);
        self.port.onDisconnect.addListener(function(){
            self.port = null;
        });
    },
    
    initElement: function() {
        // initialize MultiLokup Element.
        if (!this.node) {
            this.node = $n('div', {id:"MultiLookup"});
            ResultGroupFactory.init(this.node);
            //KeybindFactory.init();

        }
        if (!isElementInDocument(this.node)) {
            // the node append to document.body.
            document.body.appendChild(this.node);
        }
    },

    loadedConfigCallback: function(config) {
        var self = MultiLookup;
        if (!self.node || self.node.parentNode) {
            self.initElement();
        }
        var opacity = (config["result_opacity"]) ? config["result_opacity"]/100 : 0.80;
        var theme = config["result_theme"] || "black";
        var entries = config["keybind"]["entries"] || {};
        self.node.setAttribute('style', "opacity: "+opacity);
        self.node.setAttribute('class', theme);
        window.setTimeout(function() {
            var docs = [document];
            var iframes = document.querySelectorAll("iframe");
            if (iframes && (iframes.length > 0)) {
                for (var i=0; i<iframes.length; i++) {
                    if (iframes[i].contentDocument) {
                        docs.push(iframes[i].contentDocument);
                    }
                }
            }
            for(var i=0; i<docs.length; i++) {
                var doc = docs[i];
                if (!doc) continue;
                if (doc) {
                    doc.addEventListener("mouseup", self.onMouseup, true);
                    doc.addEventListener("click", self.onClick, false);
                    if (config["enable_dblclick_lookup"]) {
                        doc.addEventListener("dblclick", self.onDblClick, true);
                    }
                }
            }
        }, 1000);
        // ShortcutKey Event
        KeybindFactory.removeAll();
        KeybindFactory.bind(window);
        // remove all results
        KeybindFactory.add(window, config["keybind"]["close"], ResultGroupFactory.removeAll, false);
        var shortcutkeys = {};
        for (var j in entries) {
            if (entries[j] && entries.hasOwnProperty(j)) {
                var key = entries[j];
                if (!shortcutkeys[key]) {
                    shortcutkeys[key] = [];
                }
                shortcutkeys[key].push(j);
            }
        }
        for (var key in shortcutkeys) {
            if (shortcutkeys.hasOwnProperty(key)) {
                self.setShortcutKey(shortcutkeys[key], key, window);
            }
        }
    },
    
    setShortcutKey: function(id, keyname, node) {
        var self = this;
        if (!node) { node = document; }
        KeybindFactory.add(node, keyname, function() {
            self.lookup(node.getSelection().toString(), id);
        }, false);
    },
    
    /**
     * the method for mouse up event.
     * @param evt
     */
    onMouseup: function(evt) {
        var self = MultiLookup;
        var node = evt ? evt.target.ownerDocument : undefined || window;
        var text = trim(node.getSelection().toString());
        var wheel = false;
        if (!text) return;
        
        // update context menu (unsupport)
        if (CONFIG["enable_context_menus"]) {
            if (evt["button"] === 0)
                self.postMessage({id: "contextmenu-update", value: text});
        }
        if (CONFIG["enable_mousewheel_lookup"]) {
            if ((evt["button"] == 1) && !isAnchor(evt.target))
                wheel = true;
        }
        
        if (!wheel && CONFIG["enable_modifier_key"]) {
            if (!evt[CONFIG["modifier_key"]]) return;
        }
        self.lookup(text);
    },
    
    onDblClick: function(evt) {
        var self = MultiLookup;
        var node = evt ? evt.target.ownerDocument : undefined || window;
        var text = trim(node.getSelection().toString());
        if (!text) return;
        self.lookup(text);
    },
    
    lookup: function(text, id) {
        if (!text) return;
        text = trim(text);
        var message = { id: "lookup", context: text };
        if (id) {
            message["siteinfo_id"] = id;
        }
        var id = ResultGroupFactory.add(text);
        message["result_id"] = id;
        this.postMessage(message);
        if (!this.node || !isElementInDocument(this.node)) {
            this.initElement();
        }
    },
    
    postMessage: function(data) {
        var self = this;
        if (!self.port) self.init();
        self.port.postMessage(data);
    },
    
    onClick: function(evt) {
        if (evt.target.tagName == 'A') return;
        if (!hasSelection(evt)) {
            ResultGroupFactory.removeAll();
        }
    },
    
    onMessage: function(msg) {
        var self = MultiLookup;
        var id = msg.id;
        var value = msg.value;
        if (!id) return false;
        switch(id) {
            case "siteinfo":
                if (value)
                    SITEINFO = value;
                break;
            case "config":
                if (value)
                    CONFIG = value;
                self.loadedConfigCallback.call(this, value);
                break;
            case "lookup":
                if (value) {
                    var status = value["status"] || "success";
                    var context = value["context"];
                    var group = ResultGroupFactory.getGroup(value["result_id"]);
                    if (group) {
                        if (status == "success") {
                            var results = isArray(value["results"]) ? value["results"] : [value["results"]];
                            group.addResultList(results);
                        } else {
                            group.addMessage(value["results"]["message"], "error");
                        }
                    }
                }
                break;
            case "lookup-begin":
                if (value) {
                    ResultGroupFactory.add(value["context"]);
                }
                break;
            default:
                console.error("unkown message id", msg);
                break;
        }
        return true;
    }
};

/* ----------------------------------------------------------------------------
 * Utilities
 * ---------------------------------------------------------------------------*/
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

/**
 * the method checks whether a anchor.
 * @return boolean if the node is anchor, return true.
 */
function isAnchor(node) {
    return ((node.nodeName === "A") || (node.parent && (node.parent.nodeName === "A")));
}

/**
 * the method checks array
 */
function isArray(obj) {
    return toString.call(obj) === "[object Array]";
}

/**
 * if a selection existed, return true.
 */
function hasSelection(evt) {
    var doc = evt ? evt.target.ownerDocument : undefined || window;
    return doc.getSelection().type === "Range"
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
 * @param childs
 * @returns a created element.
 */
function $n(name, attr, childs) {
    var ret = document.createElement(name);
    for (var k in attr) {
        if (!attr.hasOwnProperty(k)) continue;
        v = attr[k];
        if (k == "class") {
            ret.className = v;
        } else {
            ret.setAttribute(k, v);
        }
    }
    switch (typeof childs) {
        case "string": {
            ret.appendChild(document.createTextNode(childs));
            break;
        }
        case "object": {
            for (var i = 0, len = childs.length; i < len; i++) {
                var child = childs[i];
                if (typeof child == "string") {
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
    if (CONFIG["enable_trim"] === false) return text;
    return (text || "").replace(/^(\s|\u00A0)+|(\s|\u00A0)+$/g, "");
}

// via. http://d.hatena.ne.jp/amachang/20100624/1277359266
function isElementInDocument(node) {
    if (document === node) {
        return true
    }
    else if (document.compareDocumentPosition) {
        return !!(document.compareDocumentPosition(node) & 16)
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
        } while (node = node.parentNode)
        return false;
    }
}


/*------------------------------------------------------------------------------
 * Event when loaded a page.
 *----------------------------------------------------------------------------*/
if (window.top === window.self) {
    MultiLookup.init();
}

// ### EOF ###
