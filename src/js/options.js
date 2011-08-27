/**
 * MultiLookup options.js
 * http://www.simplivillage.com/trac/wiki/ChromeExtension/MultiLookup
 *
 * (c) 2011, jimo1001
 * Released under the New BSD License.
 */

// global variable
var EDITABLE_SITEINFO_ATTRIBUTE = [
  'id', 'name', 'url', 'type', 'src-lang', 'res-lang', 'description',
  'content-xpath', 'content-selector', 'content-jsonpath', 'exclude-xpath', 'exclude-selector',
  'lookup-regexp', 'method', 'data', 'space', 'charset'];
var SITEINFO_ATTRIBUTE = EDITABLE_SITEINFO_ATTRIBUTE.concat(['created_by', 'created_at', 'updated_at', 'resource_url']);

var multilookup = chrome.extension.getBackgroundPage().multilookup;
/**
 * Options
 */
var MLuOptions = {
  config: null,
  siteinfo: null,

  init: function () {
    this.config = multilookup.config.getAll();
    this.siteinfo = multilookup.siteinfo.getSiteinfo();
    // initialize
    this.common.init();
    this.basic.init();
    this.site.init();
    this.advance.init();
    this.initialize.init();
  },

  saveConfig: function (sync) {
    multilookup.config.save();
    if (sync) {
      multilookup.management.postConfigMessage();
    }
  },

  saveSiteinfo: function (sync) {
    multilookup.siteinfo.save();
    if (sync) {
      multilookup.management.postSiteinfoMessage();
    }
  }
};

MLuOptions.common = new function () {
  var self = this, parent = MLuOptions;
  this.init = function() {
    this.toggleOptions();
    $('input.option[type="range"]').attr('value', function() {
      return parent.config[this.name];
    }).bind('mouseup', function() {
      self.save(this, function(name, value) {
        $('#text_'+name).val(value);
      }, true);
    });

    $('input.option[type="number"], input.option[type="text"]').attr('value', function() {
      return parent.config[this.name];
    }).bind('input', function() {
      self.save(this, function(name, value) {
        $('#range_'+name).val(value);
      }, false);
    }).bind('change', function() {
      parent.saveConfig(true);
    });

    $('select.option').attr('value', function() {
      return parent.config[this.name];
    }).bind('change', function() {
      self.save(this, null, true);
    });

    $('input[type="radio"].option').each(function() {
      var name = this.name, val = parent.config[name];
      if (typeof val === 'boolean') {
        val = val ? '1' : '0';
      }
      if (val === $(this).val()) {
        $(this).attr('checked', true);
      }
      $(this).bind('change', function() {
        var name = this.name;
        var value = $(this).val();
        if ((value === '0') || (value === '1')) {
          value = (value === '1');
        }
        parent.config[name] = value;
        parent.saveConfig(true);
      });
    });
  };

  this.save = function (element, callback, sync) {
    sync = sync || true;
    var value = $(element).val();
    if (/^[0-9]*$/.test(value)) {
      value = Number(value);
    }
    var name = element.name;
    parent.config[name] = value;
    parent.saveConfig(sync);
    if (callback) {
      callback.call(this, name, value);
    }
  };

  this.toggleOptions = function () {
    $('div.preferences > h2').bind('click', function () {
      $('div.content', $(this).parent('div.preferences')).slideToggle('fast');
    });
  };
};

MLuOptions.basic = new function () {
  var parent = MLuOptions;

  this.init = function () {
    $('#basic_preferences input[name="enable_context_menus"]').bind('change', function () {
      if ($(this).val() === '1') {
        multilookup.management.updateDefaultContextMenu();
      } else {
        chrome.contextMenus.removeAll();
      }
    });

    $('#modifier_key').val(parent.config.modifier_key).bind('keydown', function (evt) {
      var keyname = keybinds.getKeyFromEvent(evt, true);
      if (keyname) {
        $(this).val(keyname);
        parent.config.modifier_key = keyname;
        parent.saveConfig(true);
      } else {
        $(this).val(parent.config.modifier_key);
      }
      $(this).effect('highlight');
      evt.preventDefault();
    });

    $('#keybind-close').val(parent.config.keybind.close).bind('keydown', function (evt) {
      var keyname = keybinds.getKeyFromEvent(evt);
      if (keyname) {
        $(this).val(keyname);
        parent.config.keybind.close = keyname;
        parent.saveConfig(true);
      } else {
        $(this).val(parent.config['keybind-close']);
      }
      $(this).effect('highlight');
      evt.preventDefault();
    });
  };
};


MLuOptions.site = new function () {
  var self = this;
  var parent = MLuOptions;

  this.init = function() {
    this.generateSiteSelectBox();
    this.generateSiteinfoUrlSelectbox();
    $('#add_siteinfo_db_url').bind('click', function() {
      var input = $('#siteinfo_db_url');
      var url = input.val();
      var list = parent.config.available_siteinfo_url_list;
      if (!list.some(function (v) {
        return v === url;
      })) {
        list.push(url);
        parent.saveConfig();
        input.val('');
        self.generateSiteinfoUrlSelectbox();
      }
    });
  };
  this.updateSiteinfo = function(evt) {
    var result = window.confirm(_('option_update_confirm'));
    if (result) {
      multilookup.siteinfo.importSiteinfoFromRemote(function(res) {
        if (res) {
          parent.saveSiteinfo(true);
          window.confirm(_('option_update_succeeded'));
          self.generateSiteSelectBox();
        } else {
          window.alert(_('option_update_failed'));
        }
      });
    }
  };

  this.cleanup = function() {
    var kbs = parent.config.keybind.entries;
    var siteinfo = parent.siteinfo;
    $.each(kbs, function(id, key) {
      if (siteinfo[id] === undefined) {
        delete kbs[id];
      }
    });
  };

  this.save = function() {
    var ids = [], lookup_ids = [];

    $('#selected_siteinfo input[type="hidden"]').each(function() {
      ids.push($(this).val());
    });
    $('#selected_siteinfo input.lookup-entry:checked').each(function() {
      lookup_ids.push($(this).val());
    });
    parent.config.entries = ids;
    parent.config.lookup_entries = lookup_ids;
    parent.saveConfig(true);
    multilookup.management.updateDefaultContextMenu();
  };

  this.generateSiteSelectBox = function () {
    var siteinfo = parent.siteinfo;
    var config = parent.config;
    var selected = $('#selected_siteinfo');
    var unselected = $('#unselected_siteinfo');

    // empty siteinfo
    if (!siteinfo || (siteinfo.length === 0)) {
      return;
    }
    // initialize
    $('li', $('#siteinfo_selector')).remove();
    
    var entries = [];
    $.each(config.entries, function (i, v) {
      entries.push(siteinfo[v]);
    });
    $.each(siteinfo, function(id, info) {
      if ($.inArray(id, config.entries) === -1) {
        entries.push(info);
      }
    });
    $.each(entries, function(i, info) {
      if (info === undefined) {
        return;
      }
      var src = info['src-lang'] || 'none';
      var res = info['res-lang'] || 'none';
      var li = $('<li class="ui-state-default" />');
      var checkbox = $('<input class="lookup-entry" type="checkbox" />').val(info.id);

      li.attr('title', (info.name + (info.description ? (' : '+info.description) : '')));
      li.append(checkbox);
      li.append($('<span>'+info.name+'</span><br>'));
      li.append($('<span/>').addClass('info').text('('+_('type')+': '+info.type+', '+_('language')+': '+src+' -> '+res+')'));
      li.append($('<input type="hidden"/>').val(info.id));
      var keybind = config.keybind.entries;
      if ((keybind !== undefined) && (keybind[info.id] !== undefined) && (keybind[info.id] !== '')) {
        li.addClass('has_shortcutkey');
      }
      if ($.inArray(info.id, config.entries) !== -1) {
        $('ul', selected).append(li);
      } else {
        checkbox.hide();
        $('ul', unselected).append(li);
      }
      if (!config.lookup_entries || ($.inArray(info.id, config.lookup_entries) !== -1)) {
        checkbox.attr('checked', 'checked');
        li.addClass('checked');
      }
      li.dblclick(self.showDetail);
      checkbox.click(function() {
        if ($(this).is(':checked')) {
          $(this).parent('li').addClass('checked');
        } else {
          $(this).parent('li').removeClass('checked');
        }
        self.save();
      });
    });
    
    $('#site-filter').keyup(function (){
      var keyword = $(this).val();
      var re = new RegExp(keyword, 'i');
      $('li', unselected).each(function() {
        if ($(this).attr('title').search(re) === -1) {
          $(this).hide();
        } else {
          $(this).show();
        }
      });
    });
    
    // selected sortable
    $('ul', selected).sortable({
      revert: true,
      connectWith: 'ul',
      containment: '#siteinfo_selector',
      stop: function(evt, ui) {
        if ($(ui.item).parent('ul')[0] !== $('#selected_siteinfo ul')[0]) {
          $('input.lookup-entry', ui.item).hide();
        }
        self.save();
      }
    });

    // unselected sortable
    $('ul', unselected).sortable({
      revert: true,
      connectWith: 'ul',
      containment: '#siteinfo_selector',
      stop: function(evt, ui) {
        if ($(ui.item).parent('ul')[0] !== $('#unselected_siteinfo ul')[0]) {
          $('input.lookup-entry', ui.item).show();
        }
        self.save();
      }
    });

    // disable selection
    $('ul', selected).disableSelection();
    $('ul', unselected).disableSelection();
  };

  this.showDetail = function(evt) {
    var config = parent.config;
    var tnode = evt.target;
    if (tnode.tagName !== 'LI') {
      tnode = $(evt.target).parent('LI');
    }
    var sid = $('input[type="hidden"]', tnode).val();
    var siteinfo = parent.siteinfo[sid];
    var node = $('#siteinfo_detail');
    var table = $('<table><thead><tr><th>'+_('table_key')+'</th><td>'+_('table_value')+'</td></tr></thead><tbody></tbody></table>');
    var tbody = $('tbody', table);
    $.each(SITEINFO_ATTRIBUTE, function(i, v) {
      if (v in siteinfo) {
        var value = siteinfo[v] || '';
        var row = $('<tr></tr>');
        row.append($('<th></th>').text(v));
        row.append($('<td></td>').text(value.toString()));
        tbody.append(row);
      }
    });
    var keybind = $('<tr></tr>');
    var input = $('<input type="search" />');
    if (!config.keybind.entries) {
      config.keybind.entries = {};
    }
    if (!config.keybind.entries[sid]) {
      config.keybind.entries[sid] = '';
    }
    $(input).val(config.keybind.entries[sid]).bind('keydown', function(evt) {
      var keyname = keybinds.getKeyFromEvent(evt);
      if (keyname) {
        $(this).val(keyname);
        self.cleanup();
        config.keybind.entries[sid] = keyname;
        parent.saveConfig(true);
        $(tnode).addClass('has_shortcutkey');
      } else {
        $(this).val(config.keybind.entries[sid]);
        $(tnode).removeClass('has_shortcutkey');
      }
      $(this).effect('highlight');
      evt.preventDefault();
    });
    $(input).change(function(evt) {
      var keyname = $(this).val();
      config.keybind.entries[sid] = keyname;
      if (!keyname) {
        $(tnode).removeClass('has_shortcutkey');
      }
      parent.saveConfig(true);
    });
    keybind.append($('<th></th>').text('shortcut_key'));
    keybind.append($('<td></td>').append(input));
    tbody.append(keybind);
    node.contents().remove();
    node.append(table);
    node.dialog({
      title: _('option_siteinfo_detail'),
      modal: true,
      position: 'center',
      width: 750
    });
  };

  this.generateSiteinfoUrlSelectbox = function() {
    var self = this;
    var config = parent.config;
    var select = $('#siteinfo_db_url_list');
    var button = $('#delete_siteinfo_db_url');
    var list = config.available_siteinfo_url_list || [];
    $('option', select).remove();
    $.each(list, function(i, v) {
      var o = $('<option></option>').val(v).text(v);
      select.append(o);
    });
    button.unbind().bind('click', function() {
      var url = $(select).val();
      list = list.filter(function(v) {
        return url !== v;
      });
      config.available_siteinfo_url_list = list;
      parent.saveConfig(true);
      self.generateSiteinfoUrlSelectbox();
    });
  };
};

MLuOptions.advance = new function () {
  var self = this;
  var parent = MLuOptions;

  this.init = function() {
    this.initLangRegexpField();
    this.initContentRegexpField();
    this.generateSelectList();

    $('#lookup_limit_length').attr('value', function() {
      return MLuOptions.config[$(this).attr('name')];
    }).bind('change', function() {
      var value = $(this).val();
      var name = $(this).attr('name');
      MLuOptions.config[name] = value;
      MLuOptions.saveConfig(true);
    });
  };

  this.initLangRegexpField = function() {
    var regexps = parent.config.lang_regexp;
    var selectbox = $('#language_detect_regexp_select');
    var input = $('#language_detect_regexp_input');
    var add_button = $('#language_detect_regexp_add');
    var del_button = $('#language_detect_regexp_del');

    function create() {
      $('*:not(:first)', selectbox).remove();
      $.each(regexps, function(k, v) {
        var option = $('<option></option>');
        option.text(k).val(k);
        selectbox.append(option);
      });
    }

    create();
    selectbox.change(function() {
      var lang = $(this).val();
      if (!lang) {
        return;
      }
      input.val(regexps[lang]);
    });
    input.change(function () {
      var regexp = $(this).val();
      var lang = selectbox.val();
      if (!regexp || !lang) {
        return;
      }
      regexps[lang] = regexp;
      parent.saveConfig();
      console.info('Language regexp saved!!');
    });
    
    add_button.click(function() {
      var lang = window.prompt(_('option_input_additional_language_notice'), '');
      if (!lang) {
        return;
      }
      if (regexps[lang] !== undefined) {
        return;
      }
      regexps[lang] = '';
      selectbox.change();
      create();
      parent.saveConfig();
    });
    del_button.click(function() {
      var lang = selectbox.val();
      if (!lang) {
        return;
      }
      var result = window.confirm(_('option_delete_language_confirm', lang));
      if (!result) {
        return;
      }
      if (regexps[lang] === undefined) {
        return;
      }
      delete regexps[lang];
      create();
      parent.saveConfig();
    });
  };

  this.initContentRegexpField = function() {
    var regexps = parent.config.content_regexp;
    var lang_selectbox = $('#type_detect_regexp_language');
    var type_selectbox = $('#type_detect_regexp_type');
    var input = $('#type_detect_regexp_input');
    var add_button = $('#type_detect_regexp_add');
    var del_button = $('#type_detect_regexp_del');

    $.each(regexps, function(lang, v) {
      var option = $('<option></option>');
      option.text(lang).val(lang);
      lang_selectbox.append(option);
    });
    lang_selectbox.change(function() {
      var lang = $(this).val();
      if (!lang) {
        return;
      }
      $('*:not(:first)', type_selectbox).remove();
      $.each(regexps[lang], function(type, v) {
        var option = $('<option></option>');
        option.text(type).val(type);
        type_selectbox.append(option);
      });
    });
    type_selectbox.change(function() {
      var lang = lang_selectbox.val();
      var type = $(this).val();
      if (!lang || !type) {
        return;
      }
      input.val(regexps[lang][type]);
    });
    input.change(function () {
      var regexp = $(this).val();
      var lang = lang_selectbox.val();
      var type = type_selectbox.val();
      if (!regexp || !lang || !type) {
        return;
      }
      regexps[lang][type] = regexp;
      parent.saveConfig();
      console.info('Type regexp saved!!');
    });

    add_button.click(function() {
      var lang = lang_selectbox.val();
      if (!lang) {
        return;
      }
      var type = window.prompt(_('option_input_additional_type_notice'), '');
      if (!type) {
        return;
      }
      if (regexps[lang][type] !== undefined) {
        return;
      }
      regexps[lang][type] = '';
      lang_selectbox.change();
      parent.saveConfig();
    });
    del_button.click(function() {
      var lang = lang_selectbox.val();
      var type = type_selectbox.val();
      if (!lang || !type) {
        return;
      }
      var result = window.confirm(_('option_delete_type_confirm', lang, type));
      if (!result) {
        return;
      }
      if (regexps[lang][type] === undefined) {
        return;
      }
      delete regexps[lang][type];
      lang_selectbox.change();
      parent.saveConfig();
    });
  };

  this.generateSelectList = function() {
    var list = $('#editable_siteinfo_list');
    var siteinfo = parent.siteinfo;
    if (!siteinfo || (siteinfo.length === 0)) {
      return;
    }
    $('*', list).remove();
    $.each(siteinfo, function(id, info) {
      var option = $('<option/>').val(id).text(info.name);
      list.append(option);
    });
    self.siteinfoEvent();
  };
  
  this.siteinfoEvent = function() {
    var config = parent.config;
    var siteinfo = parent.siteinfo;
    var editor = $('#ad_siteinfo_edit_area');

    $('#ad_siteinfo_selector input[type="button"]').bind('click', function() {
      $('*', editor).remove();
      var attention = $('#create_attention');
      var name = $(this).attr('name');
      var id = $('#editable_siteinfo_list').val();
      var notice = $('div.notification', editor);
      var button = $('<input type="button"/>');
      var textarea = $('<textarea/>');
      var data = {}, json = '';
      if (name === 'edit') {
        attention.show();
        $.each(siteinfo[id], function(k, v) {
          if ($.inArray(k, EDITABLE_SITEINFO_ATTRIBUTE) !== -1) {
            data[k] = v;
          }
        });
        json = JSON.stringify(data, null, 4);
        textarea.attr('id', 'edit_siteinfo_text').text(json);
        button.val(_('button_update'));
        editor.append(textarea, '<br>', button);
        if (notice.length < 1) {
          notice = $('<div class="notification"></div>').insertBefore(textarea);
        }
        button.click(function() {
          try {
            self.addSiteinfo(textarea.val());
            notice.html(_('option_update_siteinfo_succeeded'));
            attention.hide();
          } catch (e) {
            notice.html(e);
          }
        });
      } else if (name === 'delete') {
        attention.hide();
        if (delete siteinfo[id]) {
          parent.saveSiteinfo(true);
          self.generateSelectList();
          parent.site.generateSelectBox();
          parent.site.cleanup();
        }
      } else if (name === 'create') {
        attention.show();
        var list = $.grep(EDITABLE_SITEINFO_ATTRIBUTE, function(n, i) {
          return (n !== 'id');
        });
        list.forEach(function(v, i) {
          data[v] = '';
        });
        json = jsonFormatter(JSON.stringify(data));
        textarea.attr('id', 'create_siteinfo_text').text(json);
        button.val(_('button_add'));
        editor.append(textarea, '<br>', button);
        if (notice.length < 1) {
          notice = $('<div class="notification"></div>').insertBefore(textarea);
        }
        button.bind('click', function() {
          try {
            self.addSiteinfo(textarea.val());
            $(notice).html(_('option_add_siteinfo_succeeded'));
            $(attention).hide();
          } catch (e) {
            console.log(e);
            $(notice).html(e);
          }
        });
      }
    });
  };

  this.addSiteinfo = function(text) {
    var data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw _('option_json_syntax_error');
    }
    data = $.each(data, function(i, v) {
      if (v === '') {
        delete data[i];
      }
    });
    if (!multilookup.siteinfo.setSiteinfo(data)) {
      throw _('option_missing_required_arguments');
    }
    parent.saveSiteinfo(true);
    multilookup.management.updateDefaultContextMenu();
    this.generateSelectList();
    parent.site.generateSiteSelectBox();
    parent.site.init();
    parent.site.cleanup();
  };
};

MLuOptions.initialize = new function () {
  var self = this;
  var parent = MLuOptions;
  var siteinfoManager = null;
  var configManager = null;

  this.init = function() {
    siteinfoManager = multilookup.siteinfo;
    configManager = multilookup.config;
  };

  this.resetAll = function(evt) {
    var result = window.confirm(_('option_reset_all_confirm'));
    if (result) {
      configManager.removeCache();
      configManager.init(function() {
        parent.saveConfig(true);
        siteinfoManager.removeCache();
        siteinfoManager.init(function() {
          self.saveSiteinfo(true);
          self.site.init();
        });
      });
      if (window.confirm(_('option_reset_all_succeeded'))) {
        this.reload();
      }
    }
  };
  
  this.resetConfig = function(evt) {
    var result = window.confirm(_('option_reset_settings_confirm'));
    if (result) {
      configManager.removeCache();
      configManager.init(function() {
        parent.saveConfig(true);
      });
      if (window.confirm(_('option_reset_settings_succeeded'))) {
        this.reload();
      }
    }
  };
  
  this.resetSiteinfo = function(evt) {
    var result = window.confirm(_('option_reset_siteinfo_confirm'));
    if (result) {
      configManager.setValue('entries', []);
      siteinfoManager.removeCache();
      siteinfoManager.init(function() {
        parent.saveSiteinfo(true);
        parent.site.init();
      });
      if (window.confirm(_('option_reset_siteinfo_succeeded'))) {
        this.reload();
      }
    }
  };
  
  this.reload = function() {
    $('#option-form').submit();
  };
};

MLuOptions.report = new function () {
  
  this.send = function() {
    var reporter = $('#reporter').val().trim() || 'anonymous';
    var summary = $('#report_summary').val().trim();
    var description = $('#report_description').val().trim();
    var type = $('#report_type').val().trim();

    if (!summary || !description) {
      $('#report_result').html('<span class="error">'+_('option_missing_required_arguments')+'</span>');
      return;
    }

    var result = window.confirm(_('option_send_report_confirm'));
    if (!result) {
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://www.simplivillage.com/trac/jsonrpc', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    var data = {
      'params': [
        summary,
        description,
        {
          'reporter': reporter,
          'type': type,
          'component': 'MultiLookup'
        },
        false ],
      'method': 'ticket.create'
    };

    xhr.send(JSON.stringify(data));
    xhr.onreadystatechange = function() {
      if (this.readyState === 4) {
        if (this.status === 200) {
          var res = JSON.parse(this.responseText);
          var href = 'http://www.simplivillage.com/trac/ticket/'+res.result;
          var link = $('<a/>').attr('href', href).attr('target', '_blank').text(href);
          $('#report_result')
            .html(_('option_send_report_succeeded')).append(link);
        } else {
          $('#report_result').text(_('option_send_report_failed'));
        }
      }
    };
  };
};

$(document).ready(function() {
  $('[data-i18n]').each(function() {
    var message = _(this.dataset.i18n);
    var lang = getLanguage();
    if (!message) { return; }
    if ((this.tagName === 'INPUT') && ($(this).attr('type') === 'button')) {
      $(this).val(message).attr('lang', lang);
    } else {
      $(this).html(message).attr('lang', lang);
    }
  });
  if ($('#translator_name').text) {
    $('#contributor').show();
  }
  multilookup.config.getDefaultConfig(function(config) {
    var def = _('default');
    var enable = _('enable');
    var disable = _('disable');
    var re = RegExp('-');
    $('[data-default]').each(function() {
      var contexts = this.dataset['default'];
      if (!contexts) { return; }
      contexts = contexts.split(' ');
      var configs = [];
      contexts.forEach(function(context) {
        if (!context) {
          return;
        }
        var contexts = [];
        var conf = '', i=0;
        if (re.test(context)) {
          var ctxs = context.split('-');
          for (i = 0; i < ctxs.length; i++) {
            if (!conf) {
              conf = config[ctxs[i]];
            } else {
              conf = conf[ctxs[i]];
            }
          }
        } else {
          conf = config[context];
        }
        if (typeof(conf) === 'boolean') {
          conf = conf ? enable : disable;
        }
        configs.push(conf);
      });
      var conf_text = configs.join(', ');
      var lang = getLanguage();
      $(this).text('('+def+': '+(conf_text===''?'-':conf_text)+')').attr('lang', lang);
    });
  });
  MLuOptions.init();
  keybinds.init();
});
