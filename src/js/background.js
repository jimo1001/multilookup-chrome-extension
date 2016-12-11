// -*- coding: utf-8 -*-
/**
 * MultiLookup core script. background.js
 * http://www.simplivillage.com/trac/wiki/ChromeExtension/MultiLookup
 *
 * (c) 2011 - 2013, jimo1001
 * Released under the New BSD License.
 * http://www.freebsd.org/ja/copyright/freebsd-license.html
 */

(function (global, $) {
  'use strict';

  var chrome = global.chrome,
      console = global.console,
      JSON = global.JSON,
      localStorage = global.localStorage,
      jsonPath = global.jsonPath,
      utils = global.multilookup.utils,
      isEmpty = utils.isEmpty,
      _ = utils.getLocalizedMessage,
      encode = utils.encode,
      createHTMLDocumentByString = utils.createHTMLDocumentByString,
      removeXSSRisk = utils.removeXSSRisk,
      $x = utils.$x;

  var multilookup = {
    /**
     * Lookup word/text
     *
     * @param siteinfos a list of SITEINFO
     * @returns Lookup Lookup Object
     */
    Lookup: function (siteinfos) {
      if (!$.isArray(siteinfos)) {
        siteinfos = [siteinfos];
      }
      this.siteinfos = siteinfos;
      this.results = new Array(siteinfos.length);
      this.timeout_ids = new Array(siteinfos.length);
      this.sync = false;

      this.execute = function (context, lookupFinishedCallback) {
        if (!this.siteinfos || isEmpty(this.siteinfos)) {
          console.warn("Lookup error, siteinfo is empty");
          var message = _("background_error_not_such_siteinfo");
          if (isEmpty(multilookup.config.getValue("lookup_entries", []))) {
            var link = multilookup.config.getOptionURL();
            message = _("background_error_no_lookup_entry", link);
          }
          lookupFinishedCallback.call(this, "error", { message: message }, context);
          return;
        }
        multilookup.detector.getType(context, function (types) {
          $.each(types, function (lang, type) {
            if ($.inArray("dictionary", type) !== -1) {
              multilookup.history.add(context);
              multilookup.history.save();
              return false;
            }
          });
        });
        var self = this;
        var infos = this.siteinfos;
        var timeout_delay = multilookup.config.getValue("lookup_xhr_timeout", 5000);
        var ready_result_length = 0;

        $.each(infos, function (index, info) {
          if (!info) {
            return false;
          }
          var charset = info.charset || "UTF-8";
          var method = info.method || "GET";
          var url = info.url;
          var data = info.data || "";

          // favicon of base64 text
          if ((info.icon === undefined) && multilookup.siteinfo.exist(info.id)) {
            multilookup.favicon.getFaviconFromHatenaAPI(url.replace("%s", ""), function (data) {
              var sm = multilookup.siteinfo.getSiteinfo();
              sm[info.id].icon = data;
              self.sync = true;
            });
          }

          // encoding {charset}
          var text = encode(context, charset);
          // replace space
          if (info.space) {
            text = text.replace(/\s/mg, info.space);
          }
          if (method === "POST") {
            data = data.replace(/%s/, text);
          } else {
            url = url.replace(/%s/, text);
          }
          var xhr = new XMLHttpRequest();
          xhr.open(method, url, true);
          // xhr.overrideMimeType("text/html; charset="+charset);
          xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
          xhr.send(data);
          xhr.onreadystatechange = function () {
            if (this.readyState === 4) {
              ready_result_length++;
              if (self.timeout_ids[index] !== null) {
                window.clearTimeout(self.timeout_ids[index]);
              }
              var status = this.status;
              if ((200 <= status) && (status <= 226)) {
                var content_type = this.getResponseHeader("Content-Type");
                if (self.isJson(content_type)) {
                  // jsonp -> json
                  this.jsonData = this.responseText.replace(/^[a-z_.\-]+\((.*)\)$/ig, "$1");
                  self.successJsonCallback(this, info, url, index);
                } else {
                  self.successDefaultCallback(this, info, url, index);
                }
              } else if (self.timeout_ids[index] === null) {
                self.errorCallback(this, info, url, index, self.notice("Time Out"));
              } else {
                self.errorCallback(this, info, url, index, self.error(this.statusText));
              }
              var results = $.grep(self.results, function (n) {
                return (n !== null);
              });
              if (ready_result_length === self.siteinfos.length) {
                if (self.sync) {
                  multilookup.siteinfo.save();
                  multilookup.management.postSiteinfoMessage();
                }
                if (lookupFinishedCallback) {
                  lookupFinishedCallback.call(self, "success", self.results, text);
                }
              }
            }
          };

          // set timeout
          self.timeout_ids[index] = window.setTimeout(function () {
            self.timeout_ids[index] = null;
            xhr.abort();
          }, timeout_delay);
        });
      };

      this.successJsonCallback = function (xhr, siteinfo, url, index) {
        var jsonpath = siteinfo["content-jsonpath"] || "$..*";

        var json = JSON.parse(xhr.jsonData);
        var result = jsonPath(json, jsonpath);

        if ($.isArray(result)) {
          if (result.length === 1) {
            result = "<span class='json-result'>" + result[0] + "</span>";
          } else {
            var t = "<ul class='json-result'>";
            $.each(result, function (i, v) {
              t += "<li>" + v + "</li>";
            });
            t += "</ul>";
            result = t;
          }
        }
        this.results[index] = {
          url: url,
          siteinfo_id: siteinfo.id,
          result_text: Boolean(result) ? result : this.notice("Not Found")
        };
      };

      this.successDefaultCallback = function (xhr, siteinfo, url, index) {
        var html = xhr.responseText;
        var result_text;
        var result_nodes;

        // check result size
        var max_size = multilookup.config.getValue("lookup_limit_result_length", 500000);
        if (html.length > max_size) {
          result_text = this.notice("Result size is too large.");
        }
        if (!result_text) {
          var doc = createHTMLDocumentByString(html); // sanitize (simple)
          removeXSSRisk(doc);
          var content_xpath = siteinfo["content-xpath"] || "//*";
          var content_selector = siteinfo["content-selector"];
          var exclude_xpath = siteinfo["exclude-xpath"];
          var exclude_selector = siteinfo["exclude-selector"];
          if (doc) {
            // set baseURI
            var base = doc.createElement('base');
            base.href = url;
            doc.head.appendChild(base);
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
              result_text = utils.sanitize(result_nodes, "MLuResultArticle_"); // sanitize (white list)
            }
          } else {
            result_text = this.notice("Not Found");
          }
        }

        this.results[index] = {
          url: url,
          siteinfo_id: siteinfo.id,
          result_text: (result_text) ? result_text : this.notice("Not Found")
        };
      };

      this.errorCallback = function (xhr, siteinfo, url, index, result) {
        var r = this.error(result);
        this.results[index] = {
          url: url,
          siteinfo_id: siteinfo.id,
          result_text: r
        };
      };

      this.error = function (msg) {
        msg = msg || "Lookup Error";
        return "<span class='error'>" + msg + "</span>";
      };

      this.notice = function (msg) {
        return "<span class='notice'>" + msg + "</span>";
      };

      this.isJson = function (content_type) {
        return (content_type && (content_type.match(/^text\/javascript|^application\/json/) !== null));
      };
    },

    favicon: {
      /**
       * @param url
       * @returns boolean
       */
      getFaviconFromHatenaAPI: function (url, callback) {
        var api = "http://favicon.hatena.ne.jp/?url=";
        url = api + url;
        this.loadBase64TextImage(url, function (data) {
          var type = this.getResponseHeader("Content-Type");
          if (type === "text/html") {
            data = "";
          }
          if (data !== "") {
            data = "data:" + type + ";base64," + data;
          }
          if (callback) {
            callback.call(this, data);
          }
        });
        return true;
      },

      /**
       * @param html_text HTML text
       * @param url
       * @returns boolean
       */
      getFaviconFromHTML: function (url, html_text, callback) {
        var icon_url = null;
        var links = html_text.match(/<link.*(\/?>|<\/link>)$/img);
        if (links === null) {
          return null;
        }
        links = $(links.join(""));
        links.each(function () {
          var rel = $(this).attr("rel");
          if (rel !== undefined && /(?:icon)/.test(rel)) {
            icon_url = utils.completeURL($(this).attr("href"), url);
            return false;
          }
        });
        if (!icon_url) {
          icon_url = utils.getURLtoHost(url) + "/favicon.ico";
        }
        this.loadBase64TextImage(icon_url, function (data) {
          var type = this.getResponseHeader("Content-Type");
          if (data !== "") {
            data = "data:" + type + ";base64," + data;
          }
          if (callback) {
            callback.call(this, data);
          }
        });
        return true;
      },

      /**
       * @param url
       * @param callback
       */
      loadBase64TextImage: function (url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.overrideMimeType('text/plain;charset=x-user-defined');
        xhr.send(null);
        xhr.onreadystatechange = function () {
          if (this.readyState === 4) {
            if ((200 <= this.status) && (this.status <= 226)) {
              var data = this.responseText, bytes = [], i, len;
              for (i = 0, len = data.length; i < len; i++) {
                bytes[i] = (data.charCodeAt(i) & 0xff);
              }
              callback.call(this, global.btoa(String.fromCharCode.apply(String, bytes)));
            } else {
              callback.call(this, "");
            }
          }
        };
      }
    },

    /**
     * Google Suggest API
     */
    suggest: {
      url: "http://google.com/complete/search?q=%s&output=toolbar",

      getList: function (context, callback) {
        var query = this.url.replace("%s", encodeURI(context)),
            xhr = new XMLHttpRequest(),
            doc = null,
            list = [];
        xhr.open("GET", query, true);
        xhr.send();
        xhr.onreadystatechange = function () {
          if (this.readyState === 4) {
            if ((200 <= this.status) && (this.status <= 226)) {
              doc = createHTMLDocumentByString(this.responseText);
              $.each($x('.//suggestion/@data', doc), function (i, attr) {
                list.push(attr.nodeValue);
              });
              callback(list);
            }
          }
        };
      }
    },

    /**
     * Detect languages and text type from any text.
     */
    detector: {

      /**
       * Detect languages from any text.
       *
       * @param text
       * @param callback
       */
      getLanguage: function (text, callback) {
        var self = this;
        global.guessLanguage.detect(text, function (langs) {
          var detected_langs = [],
              detect_threshold = 0.125,
              whole_threshold = 0.2,
              max_score = 0;
          $.each(self.getLanguageByRegexp(text), function (i, _lang) {
            langs.push([_lang, 1.0]); // language name, score
          });
          $.each(langs, function (i, lang) {
            var score = lang[1] || 0;
            if (score > detect_threshold) {
              detected_langs.push(lang[0]);
            }
            if (max_score > score) {
              max_score = score;
            }
          });
          if (max_score <= whole_threshold) {
            chrome.i18n.getAcceptLanguages(function (accepted_langs) {
              accepted_langs.reverse();
              $.each(accepted_langs, function (i, _lang) {
                if (($.inArray(_lang, detected_langs) === -1) && ($.inArray(_lang, langs) !== -1)) {
                  detected_langs.unshift(_lang);
                }
              });
            });
          }
          callback.call(undefined, detected_langs);
        });
      },

      getLanguageByRegexp: function (text) {
        text = $.trim(text);
        if (!text) {
          return [];
        }
        var langRegexp = multilookup.config.getValue("lang_regexp", []);
        var langs = [];
        if (!isEmpty(langRegexp)) {
          $.each(langRegexp, function (i, v) {
            var re = new RegExp(v);
            if (re.test(text)) {
              langs.push(i);
            }
          });
        }
        return langs;
      },

      /**
       * Detect text type from any text.
       *
       * @param context
       * @param langs
       * @param callback
       */
      getType: function (context, langs, callback) {
        var self = this, types = {}, i, len;
        var regexps = multilookup.config.getValue("content_regexp", {});
        if ($.isFunction(langs)) {
          callback = langs;
          langs = null;
        }
        if (!langs) {
          this.getLanguage(context, function (langs) {
            if (langs) {
              self.getType(context, langs, callback);
            }
          });
          return;
        }
        langs.forEach(function (lang) {
          if (regexps[lang]) {
            $.each(regexps[lang], function (type, regexp) {
              if (regexp && context.match(regexp)) {
                if (!types[lang]) {
                  types[lang] = [];
                }
                types[lang].push(type);
              }
            });
          }
        });
        callback.call(this, types);
      },

      getSiteinfo: function (context, args, callback) {
        var langs, types = {}, siteinfo;
        if (!$.isFunction(callback) && $.isFunction(args)) {
          callback = args;
        }
        if (!callback) {
          return;
        }
        if (args) {
          langs = args.lang;
          siteinfo = args.siteinfo;
        }
        var self = this;
        context = $.trim(context);
        if (!context) {
          return;
        }
        var regexps = multilookup.config.getValue("content_regexp", {});

        if (!langs) {
          this.getLanguage(context, function (lang) {
            self.getSiteinfo(context, {lang: lang, siteinfo: siteinfo}, callback);
          });
          return;
        }
        if (!siteinfo) {
          var entries = multilookup.config.getValue("lookup_entries", []);
          if (isEmpty(entries)) {
            callback.call(this, [], langs);
            return;
          }
          siteinfo = multilookup.siteinfo.getSiteinfoById(entries);
        }
        langs.forEach(function (lang) {
          if (regexps[lang]) {
            $.each(regexps[lang], function (type, regexp) {
              if (regexp && context.match(regexp)) {
                if (!types[lang]) {
                  types[lang] = [];
                }
                types[lang].push(type);
              }
            });
          }
        });
        siteinfo = $.grep(siteinfo, function (v) {
          if (v === undefined) {
            return false;
          }
          var regexp = v["content-regexp"];

          // if content-regexp exist in siteinfo, using the regexp.
          if (regexp) {
            var re = new RegExp(regexp);
            return (re.test(context));
          }
          // non exist content-regexp
          if (v["src-lang"]) {
            if (!isEmpty(langs)) {
              var type = v.type, j, len;
              for (j = 0, len = langs.length; j < len; j++) {
                var lang = langs[j];
                if (v["src-lang"].match(lang) && types[lang]) {
                  return (types[lang] && ($.inArray(type, types[lang]) !== -1));
                }
              }
            }
            if ($.isArray(langs) && ($.inArray(v["src-lang"], langs) === -1)) {
              return false;
            }
          }
          return true;
        });
        callback.call(this, siteinfo, langs, types);
      }
    },

    /**
     * Preference
     */
    config: {
      _data: null,
      _default_data: null,
      default_config_uri: "/conf/default.json",
      manifest_uri: "/manifest.json",
      option_uri: "html/options.html",

      init: function (callback) {
        var self = this;
        var isDefault = false;

        function _initExtension(callback) {
          self.getExtVersion(function (version) {
            var current = self._data.version || "0.0.1";
            if (version > current) {
              self._data.version = version;
              self.updateBatch(current);
              self.save();
            }
            if (callback) {
              callback.apply({}, [this._data, isDefault]);
            }
          });
        }

        if (!this.load()) {
          return this.getDefaultConfig(function (config) {
            self._data = config;
            self._default_data = JSON.parse(JSON.stringify(config));
            isDefault = true;
            self.save();
            return _initExtension(callback);
          });
        }
        this.getDefaultConfig(function (config) {
          self._default_data = config;
        });
        return _initExtension(callback);
      },

      getValue: function (name, defvalue, confdata) {
        var data = confdata || this._data;
        if (!data) {
          return defvalue;
        }
        var attrs = name.split(".");
        attrs.forEach(function (v) {
          if (!data) {
            return;
          }
          data = data[v];
        });
        if (data !== void(0)) {
          return data;
        } else if (confdata) {
          return defvalue;
        } else {
          confdata = this._default_data || {};
          return this.getValue(name, defvalue, confdata);
        }
      },

      setValue: function (name, value) {
        this._data[name] = value;
        this.save();
      },

      getAll: function () {
        return this._data;
      },

      save: function (config) {
        this._data = config || this._data;
        localStorage.config = JSON.stringify(this._data);
      },

      load: function () {
        var config = localStorage.config;
        if (config && config !== "null") {
          this._data = JSON.parse(config);
          return true;
        } else {
          return false;
        }
      },

      updateBatch: function (old_version) {
        var self = this;
        if (old_version < "0.3.1") {
          this.getDefaultConfig(function (config) {
            self._data.lang_regexp = config.lang_regexp;
            self._data.lookup_entries = [];
            self.save();
          });
        }
      },

      removeCache: function () {
        delete localStorage.config;
        this.config = null;
      },

      getExtVersion: function (callback) {
        var uri = this.manifest_uri;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', uri, true);
        xhr.send();
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            var manifest = JSON.parse(xhr.responseText);
            callback.call(this, manifest.version);
          }
        };
      },

      getDefaultConfig: function (callback) {
        var uri = this.default_config_uri;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', uri, true);
        xhr.send();
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            var config = JSON.parse(xhr.responseText);
            callback.call(this, config);
          }
        };
      },

      getOptionURL: function (uri) {
        if (!uri) {
          uri = this.option_uri;
        }
        return chrome.extension.getURL(uri);
      },

      openOptionPage: function () {
        var self = this;

        chrome.tabs.getAllInWindow(null, function (tabs) {
          var exist = false, i, len;
          if (tabs && tabs.length > 0) {
            for (i = 0, len = tabs.length; i < len; i++) {
              var tab = tabs[i];
              if (tab.url === self.getOptionURL()) {
                chrome.tabs.update(tab.id, {selected: true});
                exist = true;
                break;
              }
            }
          }
          if (exist) {
            return;
          }
          chrome.tabs.getSelected(function (tab) {
            var properties = {};
            properties.url = self.option_uri;
            if (tab !== undefined) {
              properties.index = tab.index + 1;
            }
            chrome.tabs.create(properties);
          });
        });
      }
    },

    /**
     * Siteinfo
     */
    siteinfo: {
      _infos: null,
      required_param: ["id", "name", "url", "type", "src-lang"],
      init: function (callback) {
        this.loadSiteinfo();
        var lang = "en", url = "";
        var list = multilookup.config.getValue("available_siteinfo_url_list", []);
        if (list && (list.length < 1)) {
          lang = utils.getLanguage();
          var urls = multilookup.config.getValue("default_remote_siteinfo_url", {});
          if (!urls.hasOwnProperty(lang)) {
            lang = 'en';
          }
          url = urls[lang];
          multilookup.config.setValue("available_siteinfo_url_list", [url]);
        }
        if (!this._infos || (this._infos === "null") || isEmpty(this._infos)) {
          this.importSiteinfoFromLocal(callback);
          //this.importSiteinfoFromRemote(callback)
          return;
        }
        if (callback) {
          callback.call(this);
        }
      },

      removeCache: function () {
        localStorage.siteinfo = [];
        this._infos = null;
      },

      loadSiteinfo: function () {
        var cacheinfo = localStorage.siteinfo;
        if (cacheinfo) {
          this._infos = JSON.parse(cacheinfo);
        }
        return this._infos;
      },

      getSiteinfo: function () {
        return this._infos;
      },

      getSiteinfoById: function (ids) {
        var self = this, siteinfo = [], i, len;
        if (!$.isArray(ids)) {
          ids = [ids];
        }
        for (i = 0, len = ids.length; i < len; i++) {
          siteinfo.push(self._infos[ids[i]]);
        }
        return siteinfo;
      },

      exist: function (id) {
        return !!(this._infos[id]);
      },

      setSiteinfo: function (aSiteinfo) {
        if (!this._infos) {
          this._infos = {};
        }
        var id;
        var s = (typeof aSiteinfo === "string") ? JSON.parse(aSiteinfo) : aSiteinfo;
        if ((s.data !== undefined) && (typeof(s.data) !== "string")) {
          var t_s = s.data;
          $.each(s, function (k) {
            if (k !== "data") {
              t_s[k] = s[k];
            }
          });
          s = t_s;
        }
        id = s.id || s.resource_url || s.name;
        if (!id) {
          return false;
        }

        // set id. the id is encoded base64.
        id = (!this._infos[id]) ? global.btoa(encodeURI(id)) : id;
        s.id = id;
        s.updated_at = (function () {
          var d = s.updated_at || new Date();
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
        }());
        var cached_siteinfo = this._infos[id];
        if (cached_siteinfo && cached_siteinfo.updated_at) {
          var updated_at = (function () {
            var u = cached_siteinfo.updated_at;
            return (u instanceof Date) ? u : new Date(u);
          }());
          if (updated_at > s.updated_at) {
            // console.info("cached siteinfo [", cached_siteinfo, "] is newer than the imported siteinfo [", s, "]");
            return true;
          }
        }

        var has_required = true;
        $.each(this.required_param, function (i, v) {
          if (!s[v]) {
            has_required = false;
            console.warn(v + " is undefined in siteinfo");
          }
        });
        if (has_required) {
          this._infos[id] = s;
          return true;
        } else {
          return false;
        }
      },

      setSiteinfoList: function (siteinfos) {
        if (!$.isArray(siteinfos)) {
          console.warn("the argument is not supported", siteinfos);
          return false;
        }
        var self = this;
        var result = false;
        $.each(siteinfos, function (i, siteinfo) {
          result = self.setSiteinfo(siteinfo) || result;
        });
        return result;
      },

      importSiteinfoFromRemote: function (callback) {
        var list = multilookup.config.getValue("available_siteinfo_url_list", []);
        this._importSiteinfo(list, callback);
      },

      importSiteinfoFromLocal: function (callback) {
        var url = "";
        var urls = multilookup.config.getValue("default_local_siteinfo_url", {});
        var lang = utils.getLanguage();
        if (!urls.hasOwnProperty(lang)) {
          lang = 'en';
        }
        url = urls[lang];
        this._importSiteinfo([url], callback);
      },

      _importSiteinfo: function (urls, callback) {
        var self = this;
        if (!$.isArray(urls) || (urls.length < 1)) {
          return;
        }
        var count = 0;
        urls.forEach(function (url) {
          if (!url) {
            return;
          }
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.send();
          xhr.onreadystatechange = function () {
            var status = this.status, result = false, data = null;
            if (this.readyState === 4) {
              count += 1;
              if ((status === 0) || ((200 <= status) && (status <= 226))) {
                data = JSON.parse(this.responseText);
                if (data) {
                  if ($.isArray(data)) {
                    result = self.setSiteinfoList(data);
                  } else if (data instanceof Object) {
                    result = self.setSiteinfo(data);
                  }
                }
              }
              // for debug
              /*
               if (result) {
               console.log("a siteinfo import successful from", url);
               } else {
               console.error("a siteinfo import error from", url);
               }
               */
              // save siteinfo
              if (count === urls.length) {
                self.save();
                if (callback) {
                  callback(result);
                }
              }
            }
          };
        });
      },

      save: function () {
        var s = '';
        if (this._infos === null) {
          return false;
        }
        if (typeof this._infos === "object") {
          s = JSON.stringify(this._infos);
        } else {
          s = this._infos;
        }
        localStorage.siteinfo = s;
        // console.info("saved siteinfo", this.siteinfo);
      }
    },

    history: {
      _enabled: null,
      _histories: [],

      enabled: function () {
        this._enabled = multilookup.config.getValue("enable_history", true);
        return this._enabled;
      },

      add: function (text) {
        if (!this.enabled()) {
          return;
        }
        var histories = this._histories;
        var limit = multilookup.config.getValue("history_limit", 30);
        var length = histories.length;
        while (length > limit) {
          histories.pop();
          length--;
        }
        if ($.inArray(text, histories) !== -1) {
          histories = $.grep(histories, function (n) {
            return (text !== n);
          });
        }
        if (histories.length === limit) {
          histories.pop();
        }
        histories.unshift(text);
        this._histories = histories;
      },

      get: function () {
        return this._histories;
      },

      save: function () {
        if (!this.enabled()) {
          return;
        }
        localStorage.histories = JSON.stringify(this._histories);
      },

      load: function () {
        if (!this.enabled()) {
          return;
        }
        var h = localStorage.histories;
        if (h) {
          this._histories = JSON.parse(h) || [];
        }
      }
    },

    /**
     * main
     */
    management: {
      ports: [],
      contextmenus: [],

      init: function () {
        var self = this;
        multilookup.config.init(function (config, isDefault) {
          if (multilookup.config.getValue("enable_auto_update", false)) {
            multilookup.siteinfo.init(function () {
              multilookup.siteinfo.importSiteinfoFromRemote(self._loadedSiteinfoCallback);
            });
          } else {
            multilookup.siteinfo.init(function () {
              self._loadedSiteinfoCallback();
              // Open the OptionPage automatically when launch the extension at first.
              if (isDefault) {
                multilookup.config.openOptionPage();
              }
            });
          }
          // initialize History
          multilookup.history.load();
        });
        chrome.extension.onConnect.addListener(self._onConnect);
        chrome.extension.onRequest.addListener(self._onRequest);
      },

      _loadedSiteinfoCallback: function () {
        var enableContextMenus = multilookup.config.getValue("enable_context_menus", true);
        if (enableContextMenus) {
          multilookup.management.updateDefaultContextMenu();
        }
      },

      _onConnect: function (port) {
        var self = multilookup.management;
        self.ports.push(port);
        port.onMessage.addListener(self._onMessage);
        port.onDisconnect.addListener(function (port) {
          self.ports = $.grep(self.ports, function (n) {
            return (n !== port);
          });
        });
      },

      _onRequest: function (request, sender, callback) {
        var self = multilookup.management;
        self.lookup(request.context, null, function (results) {
          callback.call(this, results);
        });
      },

      _onMessage: function (message, port) {
        var self = multilookup.management;
        console.assert(port.name === "MultiLookup");

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

      postLookupMessage: function (message, port) {
        if (!message || !port) {
          return;
        }
        var context = message.context;
        var id = message.siteinfo_id || null;
        this.lookup(context, id, function (results) {
          if (message.result_id !== undefined) {
            results.value.result_id = message.result_id;
          }
          port.postMessage(results);
        });
      },

      postConfigMessage: function (port) {
        var self = multilookup.management;
        // sync max count
        var max = 5;
        var ports = [];
        if (!port) {
          ports = self.ports;
        } else {
          ports.push(port);
        }
        if (isEmpty(ports)) {
          return;
        }
        var value = multilookup.config.getAll();
        var count = 0, i;
        for (i = 1; i <= max; i++) {
          var n = ports.length - i;
          if (ports[n] === undefined) {
            break;
          }
          ports[n].postMessage({id: "config", value: value});
          count++;
        }
        // console.info("synchronized configuration. count:", count);
      },

      postSiteinfoMessage: function (port) {
        var self = multilookup.management;
        // sync max count
        var max = 5;
        var ports = [];
        if (!port) {
          ports = self.ports;
        } else {
          ports.push(port);
        }
        if (isEmpty(ports)) {
          return;
        }
        var value = multilookup.siteinfo.getSiteinfo();
        var count = 0, i;
        for (i = 1; i <= max; i++) {
          var n = ports.length - i;
          if (ports[n] === undefined) {
            break;
          }
          ports[n].postMessage({id: "siteinfo", value: value});
          count++;
        }
        // console.info("synchronized siteinfo. count:", count);
      },

      lookup: function (context, ids, callback) {
        var siteinfo = null;
        var message;
        var limit = multilookup.config.getValue("lookup_limit_length", 1200);
        if (context.length > limit) {
          message = _("background_error_over_lookup_limit_length", limit);
          callback.call(this, {id: "lookup", value: {status: "error", results: { message: message }, context: context}});
          return;
        }
        var exec = function (siteinfo) {
          var lookup = new multilookup.Lookup(siteinfo);
          lookup.execute(context, function (status, results, context) {
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
          siteinfo = multilookup.siteinfo.getSiteinfoById(ids);
          exec(siteinfo);
        } else {
          multilookup.detector.getSiteinfo(context, function (siteinfo) {
            exec(siteinfo);
          });
        }
      },

      lookupShowResult: function (context, ids, tab) {
        var self = multilookup.management;
        var port = null, i, len;
        if (!tab) {
          return chrome.tabs.getSelected(function (currentTab) {
            if (currentTab) {
              self.lookupShowResult(context, ids, currentTab);
            }
          });
        }
        for (i = 0, len = self.ports.length; i < len; i++) {
          if (self.ports[i].sender.tab.id === tab.id) {
            port = self.ports[i];
            break;
          }
        }
        port.postMessage({ id: "lookup-begin", value: { context: context } });
        self.lookup(context, ids, function (r) {
          var port = null, i, len;
          for (i = 0, len = self.ports.length; i < len; i++) {
            if (self.ports[i].sender.tab.id === tab.id) {
              port = self.ports[i];
              break;
            }
          }
          if (port) {
            port.postMessage(r);
          }
        });
      },

      updateContextMenuForKeyword: function (text) {
        if (this.contextmenus.length > 0) {
          $.each(this.contextmenus, function (i, v) {
            chrome.contextMenus.remove(v);
          });
          this.contextmenus = [];
        }
        var enabled = multilookup.config.getValue("enable_context_menus", true);
        if (enabled) {
          this.createContextMenuForKeyword(text);
        }
      },

      createContextMenuForKeyword: function (text) {
        var self = this;
        if (!text) {
          return;
        }
        if (!chrome.contextMenus) {
          return;
        }
        var entries = multilookup.config.getValue("entries") || [];
        if (isEmpty(entries)) {
          return [];
        }

        var siteinfo = multilookup.siteinfo.getSiteinfoById(entries);
        multilookup.detector.getSiteinfo(text, {siteinfo: siteinfo}, function (selected, lang) {
          if (!selected) {
            return;
          }
          var sp = chrome.contextMenus.create({type: "separator", contexts: ["selection"] });
          var lookup_entries = multilookup.config.getValue("lookup_entries", []);
          self.contextmenus.push(sp);
          $.each(selected, function (i, v) {
            var id = chrome.contextMenus.create({
              type: "checkbox",
              checked: ($.inArray(v.id, lookup_entries) !== -1),
              title: v.name,
              contexts: ["selection"],
              onclick: function (info, tab) {
                self.lookupShowResult(info.selectionText, v.id, tab);
              }
            });
            self.contextmenus.push(id);
          });
        });
      },

      updateDefaultContextMenu: function () {
        chrome.contextMenus.removeAll();
        this.contextmenus = [];
        var enabled = multilookup.config.getValue("enable_context_menus", true);
        if (enabled) {
          this.createDefaultContextMenu();
        }
      },

      createDefaultContextMenu: function () {
        var self = multilookup.management;
        if (!chrome.contextMenus) {
          return;
        }
        var entries = multilookup.config.getValue("entries", []);
        var preference = chrome.contextMenus.create({
          title: _("option_page_title"),
          contexts: ["page"],
          onclick: function (info, tab) {
            multilookup.config.openOptionPage();
          }
        });

        if (!entries || (entries.length < 1)) {
          return;
        }
        var top = chrome.contextMenus.create({
          title: _("all") || "All",
          contexts: ["selection"]
        });

        // auto detect
        chrome.contextMenus.create({
          title: _("auto_detect") || "Auto Detection",
          contexts: ["selection"],
          onclick: function (info, tab) {
            self.lookupShowResult(info.selectionText, null, tab);
          }
        });
        var menus = {};
        $.each(entries, function (i, id) {
          var site = multilookup.siteinfo.getSiteinfoById(id)[0];
          if (site === undefined) {
            return;
          }

          var type = site.type;

          if (!menus[site.type]) {
            var title = _(type) || type;
            menus[type] = chrome.contextMenus.create({
              title: title,
              contexts: ["selection"],
              parentId: top
            });
          }

          chrome.contextMenus.create({
            title: site.name + "\t( " + site["src-lang"] + (site["res-lang"] ? (" -> " + site["res-lang"]) : "") + " )",
            contexts: ["selection"],
            parentId: menus[type],
            onclick: function (info, tab) {
              self.lookupShowResult(info.selectionText, id, tab);
            }
          });
        });
      },

      setBrowserAction: function () {
        chrome.browserAction.setIcon({path: "/img/popup.png"});
        chrome.browserAction.setPopup({popup: "/html/popup.html"});
        chrome.browserAction.setTitle({title: "MultiLookup"});
      }
    }
  };

  $(document).ready(function () {
    multilookup.management.init();
  });

  $.extend(global.multilookup, multilookup);

}(this, jQuery));
