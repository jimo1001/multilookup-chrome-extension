/**
 * MultiLookup core script. background.js
 * @author jimo1001
 */

// global variable
const SITEINFO_REMOTE_URI_LIST = ["http://wedata.net/databases/Lookup/items.json"];
const SITEINFO_LOCAL_URI_LIST = ["/data/siteinfo.json"];

/**
 * Lookup word/text
 * 
 * @param siteinfos
 * @returns {Lookup}
 */
function Lookup(siteinfos) {
    if (!$.isArray(siteinfos)) {
        siteinfos = [siteinfos];
    }
    this.siteinfos = siteinfos;
    this.results = new Array(siteinfos.length);
    this.timeout_ids = new Array(siteinfos.length);
    this.sync = false;
}

Lookup.prototype = {
    execute: function(context, lookupFinishedCallback) {
        if (!this.siteinfos || isEmpty(this.siteinfos)) {
            console.warn("Lookup error, siteinfo is empty");
            var message = "該当する検索サイトがありませんでした";
            if (isEmpty(ConfigManager.getConfigByName("lookup_entries"))) {
                var link = ConfigManager.getOptionURL();
                message = "検索サイトが選択されていません。<a href="+link+" target='_blank'>オプションページ</a>の検索サイトの選択から検索サイトを追加選択してください";
            }
            lookupFinishedCallback.call(this, "error", { message: message }, context);
            return;
        }
        Detector.getType(context, function(types) {
            $.each(types, function(lang, type) {
                if ($.inArray("dictionary", type) !== -1) {
                    History.add(context);
                    History.save();
                    return false;
                }
            });
        });
        var self = this;
        var infos = this.siteinfos;
        var index = 0;
        var timeout_delay = ConfigManager.getConfigByName("lookup_xhr_timeout") || 5000;
        
        $.each(infos, function(index, info) {
            if (!info) return false;
            var charset = info["charset"] || "UTF-8";
            var method = info.method || "GET";
            var url = info.url;
            var data = info.data || "";
            
            // favicon of base64 text
            if ((info["icon"] === undefined) && SiteinfoManager.exist(info["id"])) {
                getFaviconFromHatenaAPI(url.replace("%s", ""), function(data) {
                    var sm = SiteinfoManager.getSiteinfo();
                    sm[info["id"]]["icon"] = data;
                    self.sync = true;
                });
            }
            
            // encoding {charset}
            var text = escapeByCharset(charset, context);
            // replace space
            if (info["space"])
                text = text.replace(/\s/mg, info["space"]);
            if (method == "POST")
                data = data.replace(/%s/, text);
            else
                url = url.replace(/%s/, text);
            
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            // xhr.overrideMimeType("text/html; charset="+charset);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
            xhr.send(data);
            xhr.onreadystatechange = function() {
                if (this.readyState == 4) {
                    if (self.timeout_ids[index] !== null)
                        window.clearTimeout(self.timeout_ids[index]);
                    var status = this.status;
                    if ((200 <= status) && (status <= 226)) {
                        var content_type = this.getResponseHeader("Content-Type");
                        if (self.isJson(content_type)) {
                            // jsonp -> json
                            this.jsonData = this.responseText.replace(/^[a-z_.-]+\((.*)\)$/ig, "$1");
                            self.successJsonCallback(this, info, url, index);
                        } else {
                            self.successDefaultCallback(this, info, url, index);
                        }
                    } else if (self.timeout_ids[index] === null) {
                        self.errorCallback(this, info, url, index, self.notice("Time Out"));
                    } else {
                        self.errorCallback(this, info, url, index, self.error(this.statusText));
                    }
                    var results = $.grep(self.results, function(n) {
                        return (n != null);
                    });
                    if (results.length >= self.siteinfos.length) {
                        if (self.sync) {
                            SiteinfoManager.save();
                            MLuManager.postSiteinfoMessage();
                        }
                        if (lookupFinishedCallback)
                            lookupFinishedCallback.call(self, "success", self.results, text);
                    }
                }
            };
            
            // set timeout
            self.timeout_ids[index] = window.setTimeout(function() {
                self.timeout_ids[index] = null;
                xhr.abort();
            }, timeout_delay);
        });
    },
    
    successJsonCallback: function(xhr, siteinfo, url, index) {
        var jsonpath = siteinfo["content-jsonpath"] || "$..*";
        
        var json = JSON.parse(xhr.jsonData);
        var result = jsonPath(json, jsonpath);
        
        if ($.isArray(result)) {
            if (result.length == 1)
                result = "<span class='json-result'>" + result[0] + "</span>";
            else {
                var t = "<ul class='json-result'>";
                $.each(result, function(i, v) {
                    t += "<li>" + v + "</li>";
                });
                t += "</ul>";
                result = t;
            }
        }
        this.results[index] = {
            url: url,
            siteinfo_id: siteinfo["id"],
            result_text: Boolean(result) ? result : this.notice("Not Found")
        };
    },
    
    successDefaultCallback: function(xhr, siteinfo, url, index) {
        var self = this;
        var html = xhr.responseText;
        var result_text;
        var result_nodes;

        // check result size
        var max_size = ConfigManager.getConfigByName("lookup_limit_result_length") || 500000;
        if (html.length > max_size)
            result_text = this.notice("Result size is too large.");
        
        if (!result_text) {
            var doc = createHTMLDocumentByString(html); // sanitize (simple)
            removeXSSRisk(doc);
            doc.documentURI = url; // set baseURI
            var content_xpath = siteinfo["content-xpath"] || "//*";
            var content_selector = siteinfo["content-selector"];
            var exclude_xpath = siteinfo["exclude-xpath"];
            var exclude_selector = siteinfo["exclude-selector"];
            if (doc) {
                result_nodes = doc.createElement("div");
                // exclude(xpath)
                if (exclude_xpath) {
                    $($x(exclude_xpath, doc)).remove();
                }
                // content
                if (content_selector) {
                    $(result_nodes).append($(content_selector, doc));
                } else {
                    $(result_nodes).append($x(content_xpath, doc));
                }
                // exclude(selector)
                if (exclude_selector) {
                    $(exclude_selector, result_nodes).remove();
                }
                if (($(result_nodes).children().length < 1) && ($(result_nodes).text().length < 2)) {
                    result_text = this.notice("Not Found");
                } else {
                    result_text = sanitize(result_nodes, "MLuResultArticle_"); // sanitize (white list)
                }
            } else {
                result_text = this.notice("Not Found");
            }
        }
        
        this.results[index] = {
            url: url,
            siteinfo_id: siteinfo["id"],
            result_text: (result_text) ? result_text : this.notice("Not Found")
        };
        delete doc;
    },
    
    errorCallback: function(xhr, siteinfo, url, index, result) {
        var r = this.error(result);
        this.results[index] = {
            url: url,
            siteinfo_id: siteinfo.id,
            result_text: r
        };
    },
    
    error: function(msg) {
        msg = msg || "Lookup Error";
        return "<span class='error'>"+msg+"</span>";
    },
    
    notice: function(msg) {
        return "<span class='notice'>"+msg+"</span>";
    },
    
    isJson: function(content_type) {
        return (content_type && (content_type.match(/^text\/javascript|^application\/json/) !== null));
    }
};


/**
 * @param url
 * @returns boolean
 */
function getFaviconFromHatenaAPI(url, callback) {
    var api = "http://favicon.hatena.ne.jp/?url=";
    url = api + url;
    loadBase64TextImage(url, function(data) {
        var type = this.getResponseHeader("Content-Type");
        if (type == "text/html") data = "";
        if (data != "")
            data = "data:" + type + ";base64," + data;
        if (callback)
            callback.call(this, data);
    });
    return true;
}

/**
 * @param html_text HTML text
 * @param url
 * @returns boolean
 */
function getFaviconFromHTML(url, html_text, callback) {
    var icon_url = null;
    var links = html_text.match(/<link.*(\/?>|<\/link>)$/img);
    if (links === null) return null;
    links = $(links.join(""));
    links.each(function() {
        var rel = $(this).attr("rel");
        if (rel !== undefined && /(?:icon)/.test(rel)) {
            icon_url = completeURL($(this).attr("href"), url);
            return false;
        }
    });
    if (!icon_url)
        icon_url = getURLtoHost(url) + "/favicon.ico";
    loadBase64TextImage(icon_url, function(data) {
        var type = this.getResponseHeader("Content-Type");
        if (data != "") {
            data = "data:" + type + ";base64," + data;
        }
        if (callback) {
            callback.call(this, data);
        }
    });
    return true;
}

/**
 * @param url
 * @param callback
 */
function loadBase64TextImage(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.overrideMimeType('text/plain;charset=x-user-defined');
    xhr.send(null);
    xhr.onreadystatechange = function() {
        if (this.readyState == 4) {
            if ((200 <= this.status) && (this.status <= 226)) {
                var data = this.responseText;
                var bytes = [];
                for (var i = 0; i < data.length; i++) {
                    bytes[i] = (data.charCodeAt(i) & 0xff);
                }
                callback.call(this, btoa(String.fromCharCode.apply(String, bytes)));
            } else {
                callback.call(this, "");
            }
        }
    }
}

/**
 * Google Suggest API
 */
var Suggest = {
    url: "http://www.google.com/complete/search?callback=callback&q=%s",
    
    getList: function(context, callback) {
        var query = this.url.replace("%s", encodeURI(context));
        var xhr = new XMLHttpRequest();
        xhr.open("GET", query, true);
        xhr.send();
        xhr.onreadystatechange = function() {
            if (this.readyState === 4) {
                if ((200 <= this.status) && (this.status <= 226)) {
                    eval(this.responseText);
                }
            }
        }
    }
};

/**
 * Google Detect API
 */
var Detector = {
    url: "http://ajax.googleapis.com/ajax/services/language/detect?v=1.0&callback=callback&q=%s",
    
    getLanguageByRegexp: function(context) {
        context = $.trim(context);
        if (!context) return [];
        var langRegexp = ConfigManager.getConfigByName("lang_regexp") || [];
        var lang =  [];
        if (!isEmpty(langRegexp)) {
            $.each(langRegexp, function(i, v) {
                var re = new RegExp(v);
                if (re.test(context)) lang.push(i);
            });
        }
        return lang;
    },
    
    getLanguageByAPI: function(context, callback) {
        var query = this.url.replace("%s", encodeURI(context));
        this._xhr(query, function(data) {
            var confidence = data.responseData.confidence;
            var lang = data.responseData.language;
            if (confidence > 0.05) {
                lang = [lang];
            } else {
                var tmp = ["en"];
                if ($.inArray(lang, tmp) === -1) {
                    tmp.push(lang);
                }
                lang = tmp;
            }
            callback.call(this, lang);
        });
    },

    getLanguage: function(context, callback) {
        var enable_api = ConfigManager.getConfigByName("enable_language_detect_api");
        if (enable_api) {
            this.getLanguageByAPI(context, function(langs) {
                callback.call(this, langs);
            });
        } else {
            var langs = this.getLanguageByRegexp(context);
            callback.call(this, langs);
        }
    },

    getType: function(context, langs, callback) {
        var self = this, types = {};
        var cexp = ConfigManager.getConfigByName("content_regexp") || {};
        if ($.isFunction(langs)) {
            callback = langs;
            langs = null;
        }
        if (!langs) {
            return this.getLanguage(context, function(langs) {
                if (langs) {
                    self.getType(context, langs, callback);
                }
            });
        }
        for (var i=0; i<langs.length; i++) {
            var lang = langs[i];
            if (!cexp[lang]) { continue; }
            $.each(cexp[lang], function(type, regexp) {
                if (regexp && context.match(regexp)) {
                    if (!types[lang]) {
                        types[lang] = [];
                    }
                    types[lang].push(type);
                }
            });
        }
        callback.call(this, types);
    },

    getSiteinfo: function(context, args, callback) {
        var langs, types = {}, siteinfo;
        if (!$.isFunction(callback) && $.isFunction(args)) {
            callback = args;
        }
        if (!callback) { return; }
        if (args) {
            langs = args.lang;
            siteinfo = args.siteinfo;
        }
        var self = this;
        context = $.trim(context);
        if (!context) { return; }
        var cexp = ConfigManager.getConfigByName("content_regexp") || {};
        
        if (!langs) {
            return this.getLanguage(context, function(lang) {
                self.getSiteinfo(context, {lang: lang, siteinfo: siteinfo}, callback);
            });
        }
        if (!siteinfo) {
            var entries = ConfigManager.getConfigByName("lookup_entries") || [];
            if (isEmpty(entries)) { return callback.call(this, [], langs); }
            siteinfo = SiteinfoManager.getSiteinfoById(entries);
        }
        for (var i=0; i<langs.length; i++) {
            var lang = langs[i];
            if (!cexp[lang]) { continue; }
            $.each(cexp[lang], function(type, regexp) {
                if (regexp && context.match(regexp)) {
                    if (!types[lang]) {
                        types[lang] = [];
                    }
                    types[lang].push(type);
                }
            });
        }
        siteinfo = $.grep(siteinfo, function(v, i) {
            if (v == undefined) {
                return false;
            }
            var regexp = "";
            // if content-regexp exist in siteinfo, using the regexp. 
            regexp = v["content-regexp"];
            if (regexp) {
                var re = new RegExp(regexp);
                return (re.test(context));
            }
            // non exist content-regexp
            if (v["src-lang"]) {
                if (!isEmpty(langs)) {
                    var type = v["type"];
                    for (var j=0; j<langs.length; j++) {
                        var lang = langs[j];
                        if (!v["src-lang"].match(lang) || !types[lang]) {
                            continue;
                        }
                        return (types[lang] && ($.inArray(type, types[lang]) !== -1));
                    }
                }
                if ($.isArray(langs) && ($.inArray(v["src-lang"], langs) === -1)) {
                    return false;
                }
            }
            return true;
        });
        callback.call(this, siteinfo, langs, types);
    },
    
    _xhr: function(query, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", query, true);
        xhr.send();
        xhr.onreadystatechange = function() {
            if (this.readyState === 4) {
                if ((200 <= this.status) && (this.status <= 226)) {
                    eval(this.responseText);
                }
            }
        }
    }
}

/**
 * Siteinfo
 */
var SiteinfoManager = {
    siteinfo: null,
    required_param: ["id", "name", "url", "type", "src-lang"],
    init: function(callback) {
        this.loadSiteinfo();
        if (!this.siteinfo || (this.siteinfo == "null") || isEmpty(this.siteinfo)) {
            this.importSiteinfoFromLocal(callback);
            return;
        }
        if (callback)
            callback.call(this);
    },
    
    removeCache: function() {
        delete localStorage["siteinfo"];
        this.siteinfo = null;
    },
    
    loadSiteinfo: function() {
        var cacheinfo = localStorage["siteinfo"];
        if (cacheinfo)
            this.siteinfo = JSON.parse(cacheinfo);
        return this.siteinfo;
    },
    
    getSiteinfo: function() {
        return this.siteinfo;
    },
    
    getSiteinfoById: function(ids) {
        var self = this;
        var siteinfo = [];
        if (!$.isArray(ids))
            ids = [ids];
        for (var i=0; i<ids.length; i++) {
            siteinfo.push(self.siteinfo[ids[i]]);
        }
        return siteinfo;
    },
    
    exist: function(id) {
        if (this.siteinfo[id])
            return true;
        return false;
    },
    
    setSiteinfo: function(aSiteinfo) {
        if (!this.siteinfo) this.siteinfo = {};
        var id;
        var s = (typeof aSiteinfo === "string") ? JSON.parse(aSiteinfo) : aSiteinfo;
        if ((s["data"] !== undefined) && (typeof(s["data"]) !== "string")) {
            var t_s = s["data"];
            $.each(s, function(k, v) {
                if (k !== "data") t_s[k] = s[k];
            });
            s = t_s;
        }
        id = s["id"] || s["resource_url"] || s["name"];
        if (!id) return false;
        
        // set id. the id is encoded base64.
        id = (!this.siteinfo[id]) ? btoa(encodeURI(id)) : id;
        s["id"] = id;
        s["updated_at"] = (function(){
            var d = s["updated_at"] || new Date();
            var date = (d instanceof Date) ? d : new Date(d);
            if (date.toString() === "Invalid Date") {
                var m = d.match(/^(\d{4})\-(\d{2})\-(\d{2})T(\d{2}):(\d{2}):(\d{2}).*$/);
                if (m && (m.length === 7)) {
                    date = new Date(m[1], m[2], m[3], m[4], m[5], m[6]);
                } else {
                    date = new Date();
                }
            }
            return date;
        })();
        var cached_siteinfo = this.siteinfo[id];
        if (cached_siteinfo && cached_siteinfo["updated_at"]) {
            var updated_at = (function() {
                var u = cached_siteinfo["updated_at"];
                return (u instanceof Date) ? u : new Date(u);
            })();
            if (updated_at > s["updated_at"]) {
                // console.info("cached siteinfo [", cached_siteinfo, "] is newer than the imported siteinfo [", s, "]");
                return true;
            }
        }
        
        var has_required = true;
        $.each(this.required_param, function(i, v) {
            if (!s[v]) {
                has_required = false;
                console.warn(v+" is undefined in siteinfo");
            }
        });
        if (has_required) {
            this.siteinfo[id] = s;
            return true;
        } else {
            return false;
        }
    },
    
    setSiteinfoList: function(siteinfos) {
        if (!$.isArray(siteinfos)) {
            console.warn("the argument is not supported", siteinfos);
            return false;
        }
        var self = this;
        var result = false;
        $.each(siteinfos, function(i, siteinfo) {
            result = self.setSiteinfo(siteinfo);
        });
        return result;
    },
    
    importSiteinfoFromRemote: function(callback) {
        this._importSiteinfo(SITEINFO_REMOTE_URI_LIST, callback);
    },
    
    importSiteinfoFromLocal: function(callback) {
        this._importSiteinfo(SITEINFO_LOCAL_URI_LIST, callback);
    },
    
    _importSiteinfo: function(urls, callback) {
        var self = this;
        if(!$.isArray(urls) || urls.length < 1) return;
        
        for (var i=0; i<urls.length; i++) {
            var url = urls[i];
            if (!url) continue;
            var xhr = new XMLHttpRequest();
            xhr.url = url;
            xhr.open('GET', url, true);
            xhr.send();
            xhr.onreadystatechange = function() {
                if (xhr.readyState == 4) {
                    var s = JSON.parse(xhr.responseText);
                    if (!s) { return; }
                    var result = true;
                    if ($.isArray(s)) {
                        result = self.setSiteinfoList(s);
                    } else if (s instanceof Object) {
                        result = self.setSiteinfo(s);
                    }
                    // for debug
                    // if (result) {
                    //     console.info("a siteinfo import successful from", this.url);
                    // } else {
                    //     console.warn("a siteinfo import error from", this.url);
                    // }
                    // save siteinfo
                    if (i == (urls.length - 1)) {
                        self.save();
                    }
                    if (callback) {
                        callback.call(this, result);
                    }
                }
            }
        }
    },
    
    save: function() {
        var s = '';
        if (this.siteinfo == null)
            return false;
        if (typeof this.siteinfo == "object")
            s = JSON.stringify(this.siteinfo);
        else
            s = this.siteinfo;
        localStorage["siteinfo"] = s;
        // console.info("saved siteinfo", this.siteinfo);
    }
};

/**
 * Preference
 */
var ConfigManager = {
    config: null,
    default_config_uri: "/conf/default.json",
    manifest_uri: "/manifest.json",
    option_uri: "html/options.html",
    
    init: function(callback) {
        var self = this;
        
        if (!this.load()) {
            this.getDefaultConfig(function(config) {
                self.config = config;
                self.save();
                if (callback) { callback.call(this, config) };
            });
            return "default";
        }
        
        this.getExtVersion(function(version) {
            var current = self.config["version"] || "0.0.1";
            if (version > current) {
                self.config["version"] = version;
                self.updateBatch(current);
                self.save();
            }
        });
        
        if (callback) {
            callback.call(this, this.config);
        }
        return "strage";
    },
    
    updateBatch: function(old_version) {
        var self = this;
        
        if (old_version < "0.3.1") {
            this.getDefaultConfig(function(config) {
                self.config["lang_regexp"] = config["lang_regexp"];
                self.config["lookup_entries"] = [];
                self.save();
            });
        }
    },
    
    removeCache: function() {
        delete localStorage["config"];
        this.config = null;
    },
    
    getConfig: function() {
        return this.config;
    },
    
    getConfigByName: function(name) {
        if (!this.config) { return undefined; }
        else { return this.config[name]; }
    },
    
    save: function(config) {
        this.config = config || this.config;
        var t = JSON.stringify(this.config);
        localStorage["config"] = t;
    },
    
    load: function() {
        var config = localStorage["config"];
        if (config && config != "null") {
            this.config = JSON.parse(config);
            return true;
        } else {
            return false;
        }
    },
    
    getExtVersion: function(callback) {
        var self = this;
        var uri = this.manifest_uri;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', uri, true);
        xhr.send();
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4) {
                var manifest = JSON.parse(xhr.responseText);
                callback.call(this, manifest["version"]);
            }
        }
    },
    
    getDefaultConfig: function(callback) {
        var self = this;
        var uri = this.default_config_uri;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', uri, true);
        xhr.send();
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4) {
                var config = JSON.parse(xhr.responseText);
                callback.call(this, config);
            }
        }
    },
    
    getOptionURL: function(uri) {
        if (!uri)
            uri = this.option_uri;
        return chrome.extension.getURL(uri);
    },
    
    openOptionPage: function() {
        var self = this;
        
        chrome.tabs.getAllInWindow(null, function(tabs) {
            var exist = false;
            if (tabs && tabs.length > 0) {
                for (var i=0; i<tabs.length; i++) {
                    var tab = tabs[i];
                    if (tab.url === self.getOptionURL()) {
                        chrome.tabs.update(tab.id, {selected: true});
                        exist = true;
                        break;
                    }
                }
            }
            if (exist) return;
            chrome.tabs.getSelected(null, function (tab) {
                var properties = {};
                properties["url"] = self.option_uri;
                if (tab !== undefined)
                    properties["index"] = tab.index + 1;
                chrome.tabs.create(properties);
            });
        });
    }
};

var History = {
    _enabled: null,
    _histories: [],

    enabled: function() {
        this._enabled = ConfigManager.getConfigByName("enable_history") || true;
        return this._enabled;
    },

    add: function(text) {
        if (!this.enabled()) { return; }
        var histories = this._histories;
        var limit = ConfigManager.getConfigByName("history_limit") || 30;
        var length = histories.length;
        while (length > limit) {
            histories.pop();
            length--;
        }
        if ($.inArray(text, histories) !== -1) {
            histories = $.grep(histories, function(n, i) {
                return (text !== n);
            });
        }
        if (histories.length == limit) {
            histories.pop();
        }
        histories.unshift(text);
        this._histories = histories;
    },

    get: function() {
        return this._histories;
    },

    save: function() {
        if (!this.enabled()) { return; }
        localStorage["histories"] = JSON.stringify(this._histories);
    },

    load: function() {
        if (!this.enabled()) { return; }
        var h = localStorage["histories"];
        if (h) {
            this._histories = JSON.parse(h) || [];
        }
    }
};

/**
 * main
 */
var MLuManager = {
    ports: [],
    contextmenus: [],
    
    init: function() {
        var self = this;
        var from = ConfigManager.init(function() {
            if (ConfigManager.getConfigByName("enable_auto_update")) {
                SiteinfoManager.init(function() {
                    SiteinfoManager.importSiteinfoFromRemote(self._loadedSiteinfoCallback);
                });
            } else {
                SiteinfoManager.init(self._loadedSiteinfoCallback);
            }
            // initialize History
            History.load();
        });
        if (from === "default") {
            ConfigManager.openOptionPage();
        }
        chrome.extension.onConnect.addListener(self._onConnect);
        chrome.extension.onRequest.addListener(self._onRequest);
    },
    
    _loadedSiteinfoCallback: function() {
        var enableContextMenus = ConfigManager.getConfigByName("enable_context_menus");
        if (enableContextMenus) {
            MLuManager.updateDefaultContextMenu();
        }
    },
    
    _onConnect: function(port) {
        var self = MLuManager;
        self.ports.push(port);
        port.onMessage.addListener(self._onMessage);
        port.onDisconnect.addListener(function(port) {
            self.ports = $.grep(self.ports, function(n, i) {
                return (n !== port);
            });
        });
    },
    
    _onRequest: function(request, sender, callback) {
        var self = MLuManager;
        self.lookup(request["context"], null, function(results) {
            callback.call(this, results);
        });
    },
    
    _onMessage: function(message, port) {
        var self = MLuManager;
        console.assert(port.name == "MultiLookup");
        
        if (!message.id) {
            console.error("the message has none id", message);
        }
        
        switch (message.id) {
            case 'lookup':
                self.postLookupMessage(message, port);
                break;
            case 'siteinfo':
                self.postSiteinfoMessage(port);
                break;
            case 'config':
                self.postConfigMessage(port);
                break;
            case 'contextmenu-update':
                self.updateContextMenuForKeyword(message.value);
                break;
            default:
                console.warn(message.id, "is unkown id");
                break;
        }
        return true;
    },
    
    postLookupMessage: function(message, port) {
        if (!message || !port) return;
        var context = message.context;
        var id = message["siteinfo_id"] || null;
        this.lookup(context, id, function(results) {
            if (message["result_id"] != undefined) {
                results["value"]["result_id"] = message["result_id"];
            }
            port.postMessage(results);
        });
    },
    
    postConfigMessage: function(port) {
        var self = MLuManager;
        // sync max count
        var max = 5;
        var ports = [];
        if (!port)
            ports = self.ports;
        else
            ports.push(port);
        if (isEmpty(ports)) return;
        var value = ConfigManager.getConfig();
        var count = 0;
        for(var i=1; i<=max; i++) {
            var n = ports.length - i;
            if (ports[n] == undefined) break;
            ports[n].postMessage({id: "config", value: value});
            count++;
        }
        // console.info("synchronized configuration. count:", count);
    },
    
    postSiteinfoMessage: function(port) {
        var self = MLuManager;
        // sync max count
        var max = 5;
        var ports = [];
        if (!port) {
            ports = self.ports;
        } else {
            ports.push(port);
        }
        if (isEmpty(ports)) return;
        var value = SiteinfoManager.getSiteinfo();
        var count = 0;
        for (var i=1; i<=max; i++) {
            var n = ports.length - i;
            if (ports[n] == undefined) break;
            ports[n].postMessage({id: "siteinfo", value: value});
            count++;
        }
        // console.info("synchronized siteinfo. count:", count);
    },
    
    lookup: function(context, ids, callback) {
        var siteinfo = null;
        var limit = ConfigManager.getConfigByName("lookup_limit_length") || 1200;
        if (context.length > limit) {
            message = "検索文字列長の上限("+limit+")を超えています";
            callback.call(this, {id: "lookup", value: {status: "error", results: { message: message }, context: context}});
            return;
        }
        var exec = function(siteinfo) {
            var lookup = new Lookup(siteinfo);
            lookup.execute(context, function(status, results, context) {
                var d = {
                    id: "lookup",
                    value: {
                        status: status,
                        results: results,
                        context: context
                    }
                };
                callback.call(this, d);
            });
        };
        if (ids) {
            siteinfo = SiteinfoManager.getSiteinfoById(ids);
            exec(siteinfo);
        } else {
            Detector.getSiteinfo(context, function(siteinfo, lang) {
                exec(siteinfo);
            });
        }
    },
    
    lookupShowResult: function(context, ids, tab) {
        var self = MLuManager;
        var port = null;
        if (!tab) {
            return chrome.tabs.getSelected(null, function(currentTab) {
                if (currentTab) {
                    self.lookupShowResult(context, ids, currentTab);
                }
            });
        }
        for (var i=0; i<self.ports.length; i++) {
            if (self.ports[i]["tab"]["id"] === tab["id"]) {
                port = self.ports[i]; break;
            }
        }
        port.postMessage( { id: "lookup-begin", value: { context: context } } );
        self.lookup(context, ids, function(r) {
            var port = null;
            for (var i=0; i<self.ports.length; i++) {
                if (self.ports[i]["tab"]["id"] === tab["id"]) {
                    port = self.ports[i]; break;
                }
            }
            if (port) {
                port.postMessage(r);
            }
        });
    },
    
    updateContextMenuForKeyword: function(text) {
        if (this.contextmenus.length > 0) {
            $.each(this.contextmenus, function(i, v) {
                chrome.contextMenus.remove(v);
            });
            this.contextmenus = [];
        }
        var enabled = ConfigManager.getConfigByName("enable_context_menus");
        if (enabled)
            this.createContextMenuForKeyword(text);
    },
    
    createContextMenuForKeyword: function(text) {
        var self = this;
        if (!text) return;
        if (!chrome.contextMenus) return;
        var entries = ConfigManager.getConfigByName("entries") || [];
        if (isEmpty(entries)) return [];
        
        var siteinfo = SiteinfoManager.getSiteinfoById(entries);
        Detector.getSiteinfo(text, {siteinfo: siteinfo}, function(selected, lang) {
            if (!selected) return;
            var sp = chrome.contextMenus.create( {type: "separator", contexts: ["selection"] });
            var lookup_entries = ConfigManager.getConfigByName("lookup_entries");
            self.contextmenus.push(sp);
            $.each(selected, function(i, v) {
                var id = chrome.contextMenus.create({
                    type: "checkbox",
                    checked: ($.inArray(v["id"], lookup_entries) !== -1) ? true : false,
                    title: v["name"],
                    contexts: ["selection"],
                    onclick: function(info, tab) {
                        self.lookupShowResult(info.selectionText, v["id"], tab);
                    }
                });
                self.contextmenus.push(id);
            });
        });
    },
    
    updateDefaultContextMenu: function() {
        chrome.contextMenus.removeAll();
        this.contextmenus = [];
        var enabled = ConfigManager.getConfigByName("enable_context_menus");
        if (enabled)
            this.createDefaultContextMenu();
    },
    
    createDefaultContextMenu: function() {
        var self = MLuManager;
        if (!chrome.contextMenus) return;
        var entries = ConfigManager.getConfigByName("entries") || [];
        var preference = chrome.contextMenus.create({
            title: "MultiLookup - 設定",
            contexts: ["page"],
            onclick: function(info, tab) {
                ConfigManager.openOptionPage();
            }
        });
        
        if (!entries || (entries.length < 1)) return;
        var top = chrome.contextMenus.create({
            title: chrome.i18n.getMessage("all") || "All",
            contexts: ["selection"]
        });
        
        // auto detect
        chrome.contextMenus.create({
            title: chrome.i18n.getMessage("autoDetect") || "Auto",
            contexts: ["selection"],
            onclick: function(info, tab) {
                self.lookupShowResult(info.selectionText, null, tab);
            }
        });
        var menus = {};
        $.each(entries, function(i, id) {
            var site = SiteinfoManager.getSiteinfoById(id)[0];
            if (site === undefined) return;
            
            var type = site["type"];
            
            if (!menus[site["type"]]) {
                var title = chrome.i18n.getMessage(type) || type;
                menus[type] = chrome.contextMenus.create({
                    title: title,
                    contexts: ["selection"],
                    parentId: top
                });
            }
            
            chrome.contextMenus.create({
                title: site["name"] + "\t( " + site["src-lang"] + (site["res-lang"] ? (" -> " + site["res-lang"]) : "") + " )",
                contexts: ["selection"],
                parentId: menus[type],
                onclick: function(info, tab) {
                    self.lookupShowResult(info.selectionText, id, tab);
                }
            });
        });
    },

    setBrowserAction: function() {
        chrome.browserAction.setIcon({path: "/img/popup.png"});
        chrome.browserAction.setPopup({popup: "/html/popup.html"});
        chrome.browserAction.setTitle({title: "MultiLookup"});
    }
};

$(document).ready(function() {
    MLuManager.init();
});
