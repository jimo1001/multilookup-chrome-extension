// -*- coding: utf-8 -*-
/**
 * JavaScript for the popup page(popup.html).
 * http://www.simplivillage.com/trac/wiki/ChromeExtension/MultiLookup
 *
 * (c) 2011, jimo1001
 * Released under the New BSD License.
 */

(function (global, $) {
  'use strict';

  // DOMWindow object
  var multilookup = global.chrome.extension.getBackgroundPage().multilookup,
      JSON = global.JSON,
      localStorage = global.localStorage,
      keybinds = global.keybinds,
      utils = global.multilookup.utils,
      _ = utils.getLocalizedMessage,
      popup = {};

  // global objects
  global.popup = popup;
  global.multilookup = multilookup;
  popup.lookup = {
    currentTab: null,
    siteinfo: null,
    entries: null,
    context: null,
    langs: [],
    types: [],
    sites: [],
    timeoutID: null,
    suggest: {
      delay: 300,
      minLength: 3,
      list: []
    },
    selector: {
      submit: '#lookup',
      lang: '#lookup-lang',
      type: '#lookup-type',
      site: '#lookup-site',
      context: '#lookup-context',
      enable_suggest: '#enable-suggest'
    },

    init: function () {
      var self = this;
      this.siteinfo = multilookup.siteinfo.getSiteinfo();
      this.entries = multilookup.config.getValue('entries', []);
      keybinds.init();
      $.each(this.entries, function (i, id) {
        var v = self.siteinfo[id],
            langs = v['src-lang'].split(' ');
        $.each(langs, function (i, v) {
          if ($.inArray(v, self.langs) === -1) {
            self.langs.push(v);
          }
        });
        if ($.inArray(v.type, self.types) === -1) {
          if (v.type) {
            self.types.push(v.type);
          }
        }
        self.sites.push(v);
      });

      $.each(self.langs, function (i, v) {
        var node = $('<option />').val(v).text(v);
        $(self.selector.lang).append(node);
      });

      $.each(self.types, function (i, v) {
        var node = $('<option />').val(v).text(v);
        $(self.selector.type).append(node);
      });

      $.each(self.sites, function (i, v) {
        var node = $('<option />').val(v.id).text(v.name);
        $(self.selector.site).append(node);
      });

      $(self.selector.submit).bind('submit', self.onSubmit);
      $(self.selector.lang + ', ' + self.selector.type).bind('change', self.onChange);
      $(self.selector.context).bind('keydown', self.onKeydown).autocomplete({
        minLength: self.suggest.minLength,
        source: []
      }).focus();

      $('input, select').bind('change', function () {
        popup.cache.saveFormData();
      });

      this.showHistories();
    },

    getLangValue: function () {
      return $(this.selector.lang).val();
    },

    setLangValue: function (value) {
      if (value) {
        $(this.selector.lang).val(value);
      }
    },

    getTypeValue: function () {
      return $(this.selector.type).val();
    },

    setTypeValue: function (value) {
      if (value) {
        $(this.selector.type).val(value);
      }
    },

    getSiteIdValue: function () {
      return $(this.selector.site).val();
    },

    setSiteIdValue: function (value) {
      if (value) {
        $(this.selector.site).val(value);
      }
    },

    getContext: function () {
      return $(this.selector.context).val();
    },

    setContext: function (value) {
      if (value) {
        $(this.selector.context).val(value);
      }
    },

    enableSuggest: function () {
      return $(this.selector.enable_suggest).is(':checked');
    },

    checkEnableSuggest: function (bool) {
      var node = $(this.selector.enable_suggest);
      if (bool) {
        node.attr('checked', 'checked');
      } else {
        node.removeAttr('checked');
      }
    },

    onSubmit: function () {
      var self = popup.lookup,
          id = self.getSiteIdValue(),
          text = self.getContext();
      if (!$.trim(text)) {
        return false;
      }
      multilookup.management.lookupShowResult(text, id, self.currentTab);
      return false;
    },

    onChange: function () {
      var self = popup.lookup,
          lang = self.getLangValue(),
          type = self.getTypeValue();
      self.setSiteList(lang, type);
    },

    onKeydown: function (event) {
      var self = popup.lookup,
          element = this,
          context = $(element).val(),
          key = keybinds.getKeyFromEvent(event);
      if ((key === 'RET')) {
        $(self.selector.context).autocomplete('close');
        return;
      }
      if ((context.length <= 3) || (context === self.context) ||
          (!self.enableSuggest()) || (key === 'Up') || (key === 'Down')) {
        return;
      }
      self.context = context;
      if (self.timeoutID !== null) {
        global.clearTimeout(self.timeoutID);
        self.timeoutID = null;
      }
      self.timeoutID = global.setTimeout(function () {
        self.context = $(element).val();
        self.getSuggestList(self.context, function (list) {
          $(self.selector.context).autocomplete('option', 'source', list).autocomplete('search', self.context);
          self.timeoutID = null;
        });
      }, self.suggest.delay);
    },

    getSuggestList: function (context, callback) {
      var self = popup.lookup;
      multilookup.suggest.getList(context, function (list) {
        self.suggest.list = [];
        self.suggest.list = list;
        if (callback) {
          callback.call(this, self.suggest.list);
        }
      });
    },

    setSiteList: function (lang, type) {
      var self = this,
          sites = [];
      lang = lang || '';
      type = type || '';

      $('option:not([value=""])', $(self.selector.site)).remove();
      $.each(this.entries, function (i, id) {
        var v = self.siteinfo[id];
        if (v['src-lang'].match(lang) && v.type.match(type)) {
          sites.push(v);
        }
      });
      $.each(sites, function (i, v) {
        var node = $('<option />').val(v.id).text(v.name);
        $(self.selector.site).append(node);
      });
      this.sites = sites;
    },

    showHistories: function () {
      var self = this,
          $history_list = $('#history-list'),
          list = $('<ul/>'),
          histories = multilookup.history.get(),
          li = null,
          history = null;

      if (!multilookup.history.enabled()) {
        return;
      }
      if (histories && (histories.length < 1)) {
        return;
      }
      for (var i = 0; i < histories.length; i += 1) {
        li = $('<li/>');
        history = histories[i];
        li.text(history).addClass('history-item');
        list.append(li);
      }
      $history_list.append(list);
      $('#history').show();
      $history_list.find('li').bind('click', function () {
        $(self.selector.context).val($(this).text());
        $(this).submit();
      });
    }
  };

  popup.cache = {
    data: null,
    getCachedData: function () {
      if (this.data !== null) {
        return this.data;
      }
      var data = {},
          cache = localStorage.popup;
      if (cache) {
        data = JSON.parse(cache);
        this.data = data;
      }
      return data;
    },

    setCachedDataToForm: function () {
      var cache = this.getCachedData(),
          lookup = popup.lookup,
          form = null;
      if (cache && cache.form) {
        form = cache.form;
        lookup.setLangValue(form.lang);
        lookup.setTypeValue(form.type);
        lookup.setContext(form.context);
        lookup.checkEnableSuggest(form.enable_suggest);
        lookup.onChange();
        lookup.setSiteIdValue(form.site_id);
      }
    },

    saveFormData: function () {
      var data = this.getCachedData() || {},
          lookup = popup.lookup, form;
      if (!data.form) {
        data.form = {};
      }
      form = data.form;
      form.lang = lookup.getLangValue();
      form.type = lookup.getTypeValue();
      form.site_id = lookup.getSiteIdValue();
      form.context = lookup.getContext();
      form.enable_suggest = lookup.enableSuggest();
      localStorage.popup = JSON.stringify(data);
    }
  };

  popup.option = {
    config: null,
    init: function () {
      this.config = multilookup.config.getAll();
      this.load();
    },

    load: function () {
      var self = this,
          $option = $('#option');
      $option.find('select').attr('value',function () {
        return self.config[this.name];
      }).bind('change', function () {
            var value = $(this).val(),
                name = this.name;
            if (/^[0-9]*$/.test(value)) {
              value = Number(value);
            }
            self.config[name] = value;
            self.save();
          });

      $option.find('input[type="radio"]').each(function () {
        var name = this.name,
            expected = self.config[name],
            actual = $(this).val() === "1";
        if (/^[0,1]$/.test(expected)) {
          expected = !!Number(expected);
        }
        if (expected == actual) {
          $(this).attr('checked', true);
        }
        $(this).bind('change', function () {
          var $self = $(this),
              name = $self.attr('name'),
              value = $self.val();
          if ((value === '0') || (value === '1')) {
            value = (value === '1');
          }
          self.config[name] = value;
          self.save();
        });
      });

      $('#open_option_page').click(function () {
        multilookup.config.openOptionPage();
      });
    },

    save: function () {
      multilookup.config.save();
      multilookup.management.postConfigMessage();
    }
  };

  popup.changeTab = function (name) {
    if (!name) {
      return;
    }
    var tid = name + '-title',
        cache = popup.cache.getCachedData();
    $('.content-title').each(function () {
      $(this).removeClass('content-title-active');
    });
    $('#' + tid).addClass('content-title-active');
    $('.content').hide();
    $('#' + name).show();
    cache.active_tab_name = name;
    popup.cache.saveFormData();
  };

  $(document).ready(function () {
    $('[data-i18n]').each(function () {
      var message = _(this.dataset.i18n),
          lang = window.navigator.language,
          type = this.type;
      if (!message) {
        return;
      }
      if ((this.tagName === 'INPUT') &&
          (type === 'button' || type === 'reset' || type === 'submit')) {
        $(this).val(message).attr('lang', lang).removeAttr('title');
      } else {
        $(this).html(message).attr('lang', lang).removeAttr('title');
      }
    });

    popup.lookup.init();
    popup.option.init();
    popup.cache.setCachedDataToForm();
    $('.content-title').click(function () {
      var name = this.id.replace('-title', '');
      popup.changeTab(name);
    });
    var cache = popup.cache.getCachedData(),
        tabname = cache.active_tab_name || 'lookup';
    popup.changeTab(tabname);
  });
}(window, jQuery));
