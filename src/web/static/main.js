var
  DEBUG = false,

  g = {
    'sidebar_target': null,
    'document_target': null,
    'tab_cache': {},
    'queue': [],
    'previewing_document': false,
    'expanded': {}, // currently expanded nodes
    'open': {}, // currently open documents
    'project_show_documents': false,
    'user_settings': {}
  },

  ENTITY_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  },

  ACCESS_MAP = {
    'd': 'Custom',
    'r': 'Read only',
    'c': 'Comment only',
    'w': 'Full access'
  },

  MAX_SUMMARY = 1024,
  MAX_TITLE = 40,
  AUTOSAVE_TIMER = 5000,

  init = function() {
    // markdown renderer
      var renderer = new marked.Renderer();
      renderer.table = function(header, body) {
        return "<table class='pure-table pure-table-striped'><thead>" +
            header +
            "</thead><tbody>" +
            body +
            "</tbody></table>";
      }
      marked.setOptions({
        renderer: renderer
      });
    // layout
    var main_layout = $('#main_layout').w2layout({
        name: 'main_layout',
        panels: [
            { type: 'top', size: 45, style: 'border: 0px; border-bottom: 1px solid silver; background-color: #000; color: #fff;', overflow: 'hidden'},
            { type: 'left', size: 240, resizable: true, style: 'border-right: 1px solid silver;' },
            { type: 'main', 
              style: 'background-color: white; color: black; padding: 5px',
              tabs: {
                name: 'tabs',
                tabs: [],
                onClick: select_tab,
                onClose: close_tab
              }
            },
            { type: 'right', size: 240, resizable: true, style: 'border: 0; background-color: #ccc; color: #000; padding-left: 4px;' },
            { type: 'bottom', size: 18, style: 'border: 0px; border-top: 1px solid silver; background-color: #ccc; color: #000;', overflow: 'hidden'}
        ]
    });
    w2ui.main_layout.content('top', $().w2toolbar({
        name: 'main_toolbar',
        items: [
            { type: 'html',  id: 'menu_root',
                html: function (item) {
                    return '<div class="banner"><a href="/">Enwrite</a></div>'
                }
            },
            { type: 'break' },
            { type: 'menu', id: 'menu_file', caption: 'Project', img: 'icon-folder', items: [
                    { text: 'New Project...', id: 'add_project', icon: 'fas fa-book' },
                    { text: 'Import Project...', id: 'import_project', icon: 'fas fa-book' } 
                ]
            },
            { type: 'spacer', id: 'menu_last' },
            { type: 'break', id: 'menu_right' },
            { type: 'button', id: 'menu_about', text: 'About' },
            { type: 'menu', id: 'menu_user', text: 'Loading...', icon: 'fa-star', items: [ 
                { text: 'Loading...', id: 'menu_autosave', img: 'fas fa-times' }, 
                { text: 'Logout', id: 'logout', img: 'icon-page' }, 
            ] }
        ],
        onClick: toolbar_event_handler
    }));

    w2ui.main_layout.content('left', $().w2sidebar({
      name: 'main_sidebar',
      img: null,
      nodes: [ { id: 'placeholder', text: 'Loading...', icon: 'fas fa-spinner' } ],
      onClick: function(ev) {
        if (ev.target && ev.target.startsWith("project_")) {
          open_project(ev.target.substr(8), ev.node.text, ev.node.access);
        }
        if (ev.target && ev.target.startsWith("shared_")) {
          open_project(ev.target.substr(7), ev.node.text, ev.node.access);
        }
        if (ev.target && ev.target.startsWith('document_')) {
          g.sidebar_target = ev.target;
        }
      },
      onCollapse: function(ev) {
        if (ev.target && ev.target.startsWith('document_')) {
          delete g.expanded[ev.target.substr(9)];
          save_session();
        }        
      },
      onExpand: function(ev) {
        if (ev.target && ev.target.startsWith('document_')) {
          g.expanded[ev.target.substr(9)] = 1;
          save_session();
        }        
      },
      onMenuClick: sidebar_menu_handler,
      onDblClick: sidebar_open_document,
      onRefresh: sidebar_refresh
    })
    );

    load_session();
    get_projects();
  },

  add_attachment = function() {
    remove_form('add_attachment');
    $().w2form({
        name: 'add_attachment',
        style: 'border: 0px; background-color: transparent;',
        url: '/set/attachment',
        formHTML: 
            '<div class="w2ui-page page-0">'+
            '    <div class="w2ui-field">'+
            '        <label>Files:</label>'+
            '        <div>'+
            '           <input name="file" id="file" style="width: 400px"/>'+
            '        </div>'+
            '    </div>'+
            '</div>'+
            '<div class="w2ui-buttons">'+
            '    <button class="w2ui-btn" name="reset">Reset</button>'+
            '    <button class="w2ui-btn" name="ok">OK</button>'+
            '</div>',
        fields: [
            { field: 'file', type: 'file', required: true }
        ],
        record: { 
            project_id: g.project_id,
            //id: g.documents[g.document_target].document.id
            id: g.document_target
        },
        onSave: function(event) {
          data = JSON.parse(event.xhr.responseText);
          if (data.status != 'success') {
             show_error(data.status, data.message);
          }
        },
        actions: {
            "ok": function () { 
              this.save(function (data) {
                if (data.status == 'success') {
                    delete g.tab_cache['tab_' + g.document_target];
                    load_document(g.document_target); 
                    $().w2popup('close');
                }
                else {
                  show_error(data.status, data.message);
                }
              }) 
            },
            "reset": function () { this.clear(); }
        }
    });
    $().w2popup('open', {
        title   : 'Add attachment',
        body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
        style   : 'padding: 15px 0px 0px 0px',
        width   : 600,
        height  : 300, 
        showMax : true,
        onToggle: function (event) {
            $(w2ui.add_attachment.box).hide();
            event.onComplete = function () {
                $(w2ui.add_attachment.box).show();
                w2ui.add_attachment.resize();
            }
        },
        onOpen: function (event) {
            event.onComplete = function () {
                // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                $('#w2ui-popup #form').w2render('add_attachment');
            }
        }
    });
    return false;
  },

  get_location = function(path) {
    // TODO clickable folders
    var l = [];
    for (var i in path) {
      l.push(escape_html(path[i].name));
    }
    if (l.length > 0) {
      return l.join('/');
    }
    else {
      return "Top level";
    }
  },

  update_rating = function(rating) {
    $.ajax({
    type: "POST",
    url: '/set/document_r', 
    data: {
      project_id: g.project_id,
      id: g.document_target,
      rating: rating
    }
    }).done(updated_rating)
      .fail(ajax_fail);
  },

  updated_rating = function(data) {
    if ('status' in data && data.status != 'success') {
      show_error(data.status, data.message);
      return;
    }
    // successfully updated
    // get_documents(); // updates everything
    g.tab_cache['tab_' + g.document_target].rating = data.rating; // update cache
    update_document_details();
 },

  get_rating_ro = function(rating) {
    var stars = '';
    for (var idx=0; idx<5; idx++) {
      if (idx < rating) {
        stars += '<i class="fas fa-star"></i>';
      }
      else {
        stars += '<i class="far fa-star"></i>';
      }
    }
    return '<span title="' + rating + '/5">' + stars + '</span>';
  },

  get_rating = function(rating) {
    var text = (rating == 0 ? 'unrated' : rating + "/5"),
      star,
      stars = '';
    for (var idx=0; idx<5; idx++) {
      if (idx < rating) {
        star = '<i class="fas fa-star"></i>';
      }
      else {
        star = '<i class="far fa-star"></i>';
      }
      stars += '<a href="#" onclick="return update_rating(' + (idx+1) + ')">' + star + '</a>';
    }
    return '<span title="' + text + '">' + stars + '</span>';
  },

  update_document_details = function() {
    var current = g.tab_cache['tab_' + g.document_target], 
      attachment_list = '',
      summary_list = '';
    // attachments
    for (var attachment in current.attachments) {
      attachment_list += '<a target="_blank" href="/get/attachment?project_id=' + g.project_id + '&id=' + current.attachments[attachment].id + '">' + escape_html(current.attachments[attachment].name) + '</a>&nbsp;<a href="" onclick="return add_inline_attachment(\'' + escape_html(current.attachments[attachment].name) + '\', \'' + current.attachments[attachment].id + '\')"><i class="fas fa-plus" title="add to document"></i></a>&nbsp;<a href="" onclick="return delete_attachment(\'' + current.attachments[attachment].id + '\')"><i class="fas fa-trash" title="delete attachment"></i></a><br/>';
    }

    // summary information
    summary_list += 
      '<strong>Location:</strong> ' + get_location(current.path) + '<br/>' +
      '<strong>Name:</strong> ' + escape_html(current.name) + '<br/>' +
      '<strong>Rating:</strong> ' + get_rating(current.rating) + '<br/>' +
      '<strong>Updated</strong> ' + moment(current.updated).fromNow() + '<br/>';

    // write to view
    w2ui.main_layout.content('right', 
      '<h3>Details</h3><div class="details">' + summary_list + '</div>' +
      '<h3>' + current.attachments.length + ' attachment(s)</h3><div class="details">' + attachment_list + '</div><p><a href="" onclick="return add_attachment()">Upload...</a></p>');
  },

  select_tab = function(ev) {
    // update html
    var selected_document = g.tab_cache['tab_' + ev.target.substr(4)];
    if (selected_document.document_type == 'folder') {
      if (g.document_target != ev.target.substr(4)) { // changed selection 
        // render each child
        g.document_target = ev.target.substr(4);
        var content = '<div class="pure-g">';
        for (child in selected_document.children) {
          var item = selected_document.children[child];
          if (item.document_type == 'document') {
            if (item.renderer == 'Latex') {
              content += '<div class="pure-u-1-4"><div class="child_outer" id="sub_' + item.id + '"><div class="child_header">' + escape_html(item.name) + '</div><div class="child_content_' + item.document_type + '">' + escape_html(max_length(item.content, MAX_SUMMARY)) + '</div></div></div>';
            }
            else {
              content += '<div class="pure-u-1-4"><div class="child_outer" id="sub_' + item.id + '"><div class="child_header">' + escape_html(item.name) + '</div><div class="child_content_' + item.document_type + '">' + marked(escape_html(max_length(item.content, MAX_SUMMARY))) + '</div></div></div>';
            }
          }
          else {
            content += '<div class="pure-u-1-4"><div class="child_outer" id="sub_' + item.id + '"><div class="child_header">' + escape_html(item.name) + '</div><div class="child_content_' + item.document_type + '">Folder</div></div></div>';
          }
        }
        content += '</div>';
        w2ui.main_layout.content('main', content); // main content
        $('.child_outer').on('click', sub_open_document);
        update_document_details(); // right tab
      }
    }
    else if (selected_document.document_type == 'document') {
      if (g.document_target != ev.target.substr(4)) { // changed selection 
        $("#editable_content").off('change keyup paste mouseup', content_changed);
        $('#editable_content').off('mouseleave', content_leave);
  
        // save changes to old tab (to local cache)
        var current;
        if (g.document_target != null) {
          current = g.tab_cache['tab_' + g.document_target];
          current.content = $('#editable_content').val();
        }
  
        g.document_target = ev.target.substr(4);
        g.selection_start = -1;
        g.selection_end = -1;
        w2ui.main_layout.content('main', '<textarea id="editable_content"></textarea><div id="preview_content" style="display: none"></div>')
        current = g.tab_cache['tab_' + g.document_target];
        $('#editable_content').val(current.content);
        $('#editable_content').on('change keyup paste mouseup', content_changed);
        $('#editable_content').on('mouseleave', content_leave);
        preview_document();
        update_document_details(); // right tab
      }
      else {
        toggle_document_view(); // editing versus previewing
      }
    }
    else if (selected_document.document_type == 'search') { 
      if (g.document_target != ev.target.substr(4)) { // changed selection 
        $("#editable_content").off('change keyup paste mouseup', content_changed);
        $('#editable_content').off('mouseleave', content_leave);
  
        // save changes to old tab
        var current;
        if (g.document_target != null) {
          current = g.tab_cache['tab_' + g.document_target];
          current.content = $('#editable_content').val();
        }
      }
      g.document_target = 'search';
      current = g.tab_cache['tab_search'].documents;
      var content = '<div>' +
        current.length + ' document(s) matched query "' + escape_html(g.tab_cache['tab_search'].q) + '"' +
        '</div><div id="search_grid" style="width: 100%;" class="w2ui-grid-light"></div>',
        records = [];
      for (var document of current) {
        records.push({'recid': document.id, 'name': document.name, 'type': document.document_type, 'updated': moment(document.updated).format(), 'rating': document.rating})
      }
      w2ui.main_layout.content('main', content); // main content
      w2ui.main_layout.content('right', '');
      $().w2destroy('search_grid');
      $('#search_grid').w2grid({
        name: 'search_grid',
        fixedBody: false,
        show: { footer: true, toolbar: true, toolbarSearch: true, toolbarReload: false, toolbarColumns: false },
        columns: [ { 
          field: 'name', caption: 'Title', size: '60%', sortable: true, searchable: true, render: function(record) {
            return '<div>' + 
              (record.type == 'folder' ? '<i class="far fa-folder-open" style="color: #c5ac6b"></i>' : '<i class="far fa-file" style="color: #536184"></i>') + 
              '</i>&nbsp;<a href="#" onclick="open_document(\'' + record.recid + '\')">' + escape_html(record.name) + '</a></div>';
          } 
        }, {
          field: 'updated', caption: 'Updated', size: '20%', sortable: true, render: function(record) {
            return moment(record.updated).fromNow();
          }
        }, {
          field: 'rating', caption: 'Rating', size: '10%', sortable: true, render: function(record) {
            return get_rating_ro(record.rating);
          }
        } ],
        records: records
      });
    }
    else {
      show_error('error', 'unrecognized document type ' + selected_document.document_type);
    }
  },

  content_changed = function(ev) {
    // mark tab as unsaved
    var current = g.tab_cache['tab_' + g.document_target];
    if (current.unsaved != true && current.content != $('#editable_content').val()) { // undefined or false
      current.unsaved = true;
      g.unsaved_count += 1;
      set_status(g.unsaved_count + ' unsaved document(s)');
      w2ui.main_layout_main_tabs.get('tab_' + g.document_target).text = escape_html(max_length(current.name, MAX_TITLE)) + ' *';
      w2ui.main_layout_main_tabs.refresh();
    }
    if (g.user_settings.autosave) {
      if (g.autosave_timer != undefined) {
        clearTimeout(g.autosave_timer); // restart existing timer
      }
      g.autosave_timer = setTimeout(autosave_all, AUTOSAVE_TIMER);
    }
  },

  content_leave = function(ev) {
    g.selection_start = $('#editable_content').prop('selectionStart');
    g.selection_end = $('#editable_content').prop('selectionEnd');
  },

  autosave_all = function() {
    set_status('Autosaving...');
    if (g.queue.length > 0) {
      set_status('Autosave not performed. Busy.')
      g.autosave_timer = setTimeout(autosave_all, AUTOSAVE_TIMER);
    }
    else {
      save_all();
    }
    g.autosave_timer = undefined;
  },

  toggle_document_view = function() {
    if (g.previewing_document) {
      edit_document();
    }
    else {
      preview_document();
    }
  },

  edit_document = function() {
    if (g.project_access != 'w') {
      w2alert('You do not have permission to edit this document');
      return;
    }
    $('#editable_content').show();
    $('#preview_content').hide();
    g.previewing_document = false;
    // TODO show edit controls
  },

  preview_document = function() {
    var current = g.documents[g.document_target];
    if (current.document.renderer == 'Latex') {
      $('#preview_content').html('Rendering Latex...');
      $.ajax({
        type: "POST",
        url: '/render/latex', 
        data: {
          id: g.project_id,
          content: $('#editable_content').val()
        }
        }).done(rendered)
          .fail(ajax_fail);
    }
    else {
      $('#preview_content').html(marked(escape_html($('#editable_content').val())));
      MathJax.Hub.Queue(["Typeset",MathJax.Hub]);
    }
    $('#editable_content').hide();
    $('#preview_content').show();
    g.previewing_document = true;
    // TODO hide edit controls
  },

  rendered = function(data) {
    $('#preview_content').html(data.content);
  },

  close_tab = function(ev) {
    // check saved
    var target = ev.target.substr(4),
      current = g.tab_cache['tab_' + target];
    if (current.unsaved == true) {
      if (!confirm('This document has unsaved changed. Are you sure?')) {
        ev.preventDefault();
        return
      }
    }
    
    // clear session
    delete g.open[target];
    save_session();

    // clear cache
    delete g.tab_cache[ev.target];

    if (g.document_target == target) {
      g.document_target = null;
      w2ui.main_layout.content('main', '');

      // select another tab
      if (Object.keys(g.tab_cache).length > 0) {
        w2ui.main_layout_main_tabs.click(Object.keys(g.tab_cache)[0]); // select existing tab
      }
    }
  },

  sidebar_refresh = function(ev) {
    // make draggable
    ev.onComplete = function() {
        $('.w2ui-node,#layout_main_layout_panel_left')
          .attr('draggable', 'true')
          .attr('ondragstart', 'dragstart(event)')
          .attr('ondragend', 'dragend(event)')
          .attr('ondragover', 'dragover(event)')
          .attr('ondrop', 'drop(event)');
    };
  },

  sidebar_open_document = function(ev) {
    if (ev.target && ev.target.startsWith("document_")) {
      open_document(ev.target.substr(9));
    }
  },

  sub_open_document = function(ev) {
    if (ev.currentTarget && ev.currentTarget.id.startsWith("sub_")) {
      open_document(ev.currentTarget.id.substr(4));
    }
  },

  find_tab = function(target_id) {
    var existing = $.grep(w2ui.main_layout_main_tabs.tabs, function(el, i) {
      return el.id == target_id;
    });
    if (existing.length == 1) {
      return existing[0];
    }
    return null;
  },

  open_document = function(document_id) {
    var target_id = 'tab_' + document_id,
        existing = find_tab(target_id),
        doc = g.documents[document_id];
    if (existing == null) {
      w2ui.main_layout_main_tabs.add({ id: target_id, text: escape_html(max_length(doc.document.name, MAX_TITLE)), closable: true });
      load_document(document_id);
      g.open[document_id] = 1;
      save_session();
    }
    else {
      w2ui.main_layout_main_tabs.click(target_id); // select existing tab
    }
  },

  load_document = function(document_id) {
    var doc = g.documents[document_id],
        target_id = 'tab_' + document_id;
    if (doc.document.document_type == 'folder') {
      // load content for this document
      $.ajax({ 
        url: "/get/folder?document_id=" + doc.document.id + "&project_id=" + g.project_id
      })
      .done(show_folder(target_id))
      .fail(ajax_fail);
    }
    else {
      // load content for this document
      $.ajax({ 
        url: "/get/document?document_id=" + doc.document.id + "&project_id=" + g.project_id
      })
      .done(show_document(target_id))
      .fail(ajax_fail);
    }
  },

  show_folder = function(target_id) {
    return function(data) {
      set_status('Opened folder containing ' + data.children.length + ' item(s).');
      g.tab_cache[target_id] = data.document;
      g.tab_cache[target_id].children = data.children;
      w2ui.main_layout_main_tabs.click(target_id); // select tab to display content
      update_document_details(); // right tab
    }
  },

  show_document = function(target_id) {
    return function(data) {
      if ('status' in data && data.status != 'success') {
        show_error(data.status, data.message);
        return;
      }
      if (data.document.content == null) {
        set_status('Opened empty document');
      }
      else {
        set_status('Opened document of size ' + data.document.content.length);
      }
      g.tab_cache[target_id] = data.document;
      w2ui.main_layout_main_tabs.click(target_id); // select tab
      update_document_details(); // right tab
    }
  },

  sidebar_menu_handler = function(ev) {
    if (ev.menuItem && ev.target && ev.target.startsWith("document_")) {
      var document_id = ev.target.substr(9);
      switch (ev.menuItem.id) {
        case "sidebar_open_item": return open_document(document_id);
        case "sidebar_delete_item": return delete_document(document_id);
        case "sidebar_edit_item": return edit_document_properties(document_id);
      }
      w2alert('Unexpected command: ' + ev.menuItem.id);
    }
  },

  toolbar_event_handler = function(ev) {
    switch (ev.target) {
      case "menu_file": return true;
      case "menu_file:add_project": return add_project();
      case "menu_file:import_project": return import_project();
      case "menu_file:export_project": return export_project();
      case "menu_file:close_project": return close_project(); 
      case "menu_file:delete_project": return delete_project(); 
      case "menu_file:share_project": return share_project(); 
      case "menu_add": return true;
      case "menu_add:add_folder": return add_folder();
      case "menu_add:add_document": return add_document();
      case "menu_add:add_bulk": return add_bulk();
      case "menu_document": return true;
      case "menu_document:edit_document": return edit_document();
      case "menu_document:preview_document": return preview_document();
      case "menu_document:save_document": return save_current_document();
      case "menu_document:save_all": return save_all();
      case "menu_document:recent_documents": return recent_documents();
      case "menu_document:rated_documents": return rated_documents();
      case "menu_edit": return true;
      case "menu_edit:edit_bold": return edit_bold();
      case "menu_edit:edit_strikethrough": return edit_strikethrough();
      case "menu_edit:edit_code": return edit_code();
      case "menu_edit:new_table": return new_table();
      case "menu_edit:edit_link": return edit_link();
      case "menu_about": location.href = "/about"; return true;
      case "menu_user": return true;
      case "menu_user:menu_autosave": return toggle_autosave();
      case "menu_user:logout": return logout();
    }
    w2alert('Unexpected command: ' + ev.target);
  },    

  show_autosave = function() {
    if (g.user_settings.autosave) {
      w2ui.main_toolbar.set('menu_user:menu_autosave', { text: 'Autosave On', id: 'menu_autosave', img: 'fas fa-check-circle'});
    }
    else {
      w2ui.main_toolbar.set('menu_user:menu_autosave', { text: 'Autosave Off', id: 'menu_autosave', img: 'fas fa-times'});
    }
  }, 

  toggle_autosave = function() {
    g.user_settings.autosave = !(g.user_settings.autosave);
    save_session();
    show_autosave();
  },

  logout = function() {
    location.href = "/logout";
  },

  remove_by_id = function(list, id) {
    return list.filter(e => e.id !== id);
  },

  set_status = function(m, escaped) {
    w2ui.main_layout.content('bottom', escaped ? m : escape_html(m));
  },

  update_project_menu = function() {
    submenu = w2ui.main_toolbar.get('menu_file');    
    submenu.items = remove_by_id(submenu.items, "separate_project");
    submenu.items = remove_by_id(submenu.items, "export_project");
    submenu.items = remove_by_id(submenu.items, "close_project");
    submenu.items = remove_by_id(submenu.items, "delete_project");
    w2ui.main_toolbar.remove('menu_add');
    w2ui.main_toolbar.remove('menu_document');
    w2ui.main_toolbar.remove('menu_search');
    w2ui.main_toolbar.refresh();
    w2ui.main_sidebar.menu = [];
    get_projects();
  },

  /* project */

  export_project = function() {
    window.location = '/export/' + g.project_id + '/';
    set_status('Exported project "' + g.project_name + '".');
  },

  close_project = function() {
    // anything unsaved?
    if (g.unsaved_count > 0) {
      if (!confirm(g.unsaved_count + ' unsaved document(s). Are you sure?')) {
        return;
      }
    }
    // close all the tabs
    var nd = []; 
    for (var i in w2ui.main_layout_main_tabs.tabs) nd.push(w2ui.main_layout_main_tabs.tabs[i].id);
    w2ui.main_layout_main_tabs.remove.apply(w2ui.main_layout_main_tabs, nd);

    g.unsaved_count = 0;
    g.document_target = null;
    g.tab_cache = {};
    $("#editable_content").off('change keyup paste mouseup', content_changed);
    w2ui.main_layout.content('main', '<textarea id="editable_content"></textarea><div id="preview_content" style="display: none"></div>')

    // remove menu items
    update_project_menu();
    set_status('Closed project "' + g.project_name + '"', true);
  },

  delete_project = function() {
    w2confirm({ msg: 'Are you sure you want to delete this project? This cannot be undone.', btn_yes: {text: 'Delete'}, btn_no: {text: 'Cancel'} })
      .yes(function () { 
        $.ajax({
          type: "POST",
          url: '/set/project_d', 
          data: {
            id: g.project_id
          }
          }).done(deleted_project)
            .fail(ajax_fail);
      })
      .no(function () {});
  },

  deleted_project = function(data) {
    if (data.status == 'success') {
      g.unsaved_count = 0;
      close_project();
      update_project_menu();
      set_status('Deleted project "' + g.project_name + '"', true);
    }
    else {
      show_error(data.status, data.message);
    }
  },

  share_project = function() {
    $.ajax({
      type: "GET",
      url: '/get/shares', 
      data: {
        project_id: g.project_id
      }
    }).done(share_project_form)
      .fail(ajax_fail);
  },

  confirm_revoke = function(id) {
    w2confirm({ msg: 'Are you sure?', btn_yes: {text: 'Revoke'}, btn_no: {text: 'Cancel'} })
      .yes(function () { 
        $.ajax({
          type: "POST",
          url: '/set/share_revoke', 
          data: {
            project_id: g.project_id,
            id: id
          }
        }).done(share_project_form)
          .fail(ajax_fail);
      })
      .no(function () {});
  },

  map_access = function(a) {
    return ACCESS_MAP[a]; 
  }

  share_project_form = function(share_data) {
      if (share_data.status != 'success') {
        show_error(share_data.status, share_data.message);
        return;
      }
      if (w2ui.share_project) {
        $().w2destroy('share_project');
        $().w2destroy('shares_grid');
      }
      $().w2form({
          name: 'share_project',
          style: 'border: 0px; background-color: transparent;',
          url: '/share_p',
          formHTML: 
              '<div class="w2ui-page page-0">'+
              '    <div><strong>Existing Collaborators</strong></div>'+
              '    <div id="shares_grid" style="width: 100%; height: 120px;"></div>' +
              '    <div>&nbsp;</div>' +
              '    <div class="w2ui-field">'+
              '      <label>Add collaborator:</label>'+
              '      <div>'+
              '          <select name="access"/>'+
              '      </div>'+
              '    </div>'+
              '</div>'+
              '<div class="w2ui-buttons">'+
              '    <button class="w2ui-btn" name="reset">Reset</button>'+
              '    <button class="w2ui-btn" name="ok">Add</button>'+
              '</div>',
          fields: [
              { field: 'access', type: 'select', required: true, options: { items: [{id: 'r', text: 'Read only'}, {id: 'c', text: 'Comment only'}, {id: 'w', text: 'Full access'}] } }
          ],
          record: {
              access: 'r',
              project_id: g.project_id
          },
          onSave: function(event) {
            data = JSON.parse(event.xhr.responseText);
            if (data.status != 'success') {
               show_error(data.status, data.message);
            }
          },
          actions: {
              "ok": function () { 
                this.save(function (data) {
                  if (data.status == 'success') {
                      $().w2popup('close');
                      w2alert('Share the following single-use URL with your collaborator: <a style="color: #ffffff" id="share_url" href="/access/' + data.token + '">' + new URL('/access/' + data.token, window.location.href).href + '</a><div><button class="w2ui-btn" onclick="copy_clipboard(); return false">Copy to clipboard</button></div>');
                  }
                  else {
                      show_error(data.status, data.message);
                  }
                }) 
              },
              "reset": function () { this.clear(); }
          }
      });
      $().w2popup('open', {
        title   : 'Share project',
        body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
        style   : 'padding: 15px 0px 0px 0px',
        width   : 600,
        height  : 320, 
        showMax : true,
        onToggle: function (event) {
            $(w2ui.share_project.box).hide();
            event.onComplete = function () {
                $(w2ui.share_project.box).show();
                w2ui.share_project.resize();
            }
        },
        onOpen: function (event) {
           event.onComplete = function () {
                // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                $('#w2ui-popup #form').w2render('share_project');
                $('#shares_grid').w2grid({
                    name: 'shares_grid',
                    columns: [ { 
                      field: 'username', caption: 'Username', size: '65%' }, { 
                      field: 'access', caption: 'Access', size: '20%', render: function(record) { return map_access(record.access); } }, { 
                      field: 'action', caption: 'Action', size: '15%', render: function(record) {
                        return '<div><button class="w2ui-btn w2ui-btn-small" onclick="confirm_revoke(\'' + record.recid + '\')">Revoke</button></div>';
                      } 
                    } ],
                    records: share_data.shares
                });
             }
        }
      });
  },

  add_project = function() {
    remove_form('add_project');
    $().w2form({
        name: 'add_project',
        style: 'border: 0px; background-color: transparent;',
        url: '/set/project',
        formHTML: 
            '<div class="w2ui-page page-0">'+
            '    <div class="w2ui-field">'+
            '        <label>Project Name:</label>'+
            '        <div>'+
            '           <input name="name" type="text" maxlength="200" style="width: 250px"/>'+
            '        </div>'+
            '    </div>'+
            '    <div class="w2ui-field">'+
            '        <label>Default Renderer:</label>'+
            '        <div>'+
            '            <select name="renderer"/>'+
            '        </div>'+
            '    </div>'+
            '</div>'+
            '<div class="w2ui-buttons">'+
            '    <button class="w2ui-btn" name="reset">Reset</button>'+
            '    <button class="w2ui-btn" name="ok">OK</button>'+
            '</div>',
        fields: [
            { field: 'name', type: 'text', required: true },
            { field: 'renderer', type: 'select', required: true, options: { items: ['Markdown', 'Latex'] } }
        ],
        record: { 
            name    : 'Untitled',
            renderer: 'Markdown'
        },
        onSave: function(event) {
          data = JSON.parse(event.xhr.responseText);
          if (data.status != 'success') {
             show_error(data.status, data.message);
          }
        },
        actions: {
            "ok": function () { 
              this.save(function (data) {
                if (data.status == 'success') {
                    get_projects();
                    $().w2popup('close');
                }
                else {
                    show_error(data.status, data.message);
                }
              }) 
            },
            "reset": function () { this.clear(); }
        }
    });
    $().w2popup('open', {
        title   : 'Create new project',
        body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
        style   : 'padding: 15px 0px 0px 0px',
        width   : 500,
        height  : 300, 
        showMax : true,
        onToggle: function (event) {
            $(w2ui.add_project.box).hide();
            event.onComplete = function () {
                $(w2ui.add_project.box).show();
                w2ui.add_project.resize();
            }
        },
        onOpen: function (event) {
            event.onComplete = function () {
                // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                $('#w2ui-popup #form').w2render('add_project');
            }
        }
    });
  },

  import_project = function() {
    remove_form('import_project');
    $().w2form({
        name: 'import_project',
        style: 'border: 0px; background-color: transparent;',
        url: '/import',
        formHTML: 
            '<div class="w2ui-page page-0">'+
            '    <div class="w2ui-field">'+
            '        <label>Import as:</label>'+
            '        <div>'+
            '           <input name="name" id="name" style="width: 400px"/>'+
            '        </div>'+
            '    </div>'+
            '    <div class="w2ui-field">'+
            '        <label>File:</label>'+
            '        <div>'+
            '           <input name="file" id="file" style="width: 400px"/>'+
            '        </div>'+
            '    </div>'+
            '</div>'+
            '<div class="w2ui-buttons">'+
            '    <button class="w2ui-btn" name="reset">Reset</button>'+
            '    <button class="w2ui-btn" name="ok">OK</button>'+
            '</div>',
        fields: [
            { field: 'name', type: 'text', required: true },
            { field: 'file', type: 'file', required: true }
        ],
        record: { 
            name: 'Imported Project',
            project_id: g.project_id
        },
        onSave: function(event) {
          data = JSON.parse(event.xhr.responseText);
          if (data.status != 'success') {
             show_error(data.status, data.message);
          }
        },
        actions: {
            "ok": function () { 
              this.save(function (data) {
                if (data.status == 'success') {
                    get_projects();
                    $().w2popup('close');
                }
                else {
                    show_error(data.status, data.message);
                }
              }) 
            },
            "reset": function () { this.clear(); }
        }
    });
    $().w2popup('open', {
        title   : 'Import project',
        body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
        style   : 'padding: 15px 0px 0px 0px',
        width   : 500,
        height  : 300, 
        showMax : true,
        onToggle: function (event) {
            $(w2ui.import_project.box).hide();
            event.onComplete = function () {
                $(w2ui.import_project.box).show();
                w2ui.import_project.resize();
            }
        },
        onOpen: function (event) {
            event.onComplete = function () {
                // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                $('#w2ui-popup #form').w2render('import_project');
            }
        }
    });
 
  },

  get_projects = function() {
    $.ajax({ 
      url: "/get/projects"
    })
    .done(show_projects)
    .fail(ajax_fail);
  },

  show_projects = function(data) {
    w2ui.main_toolbar.set('menu_user', { text: 'Logged in as ' + escape_html(data.username) });
    if ('message' in data) {
      w2alert(data.message);
    }
    show_autosave();
    remove_sidebar_nodes();
    var projects = [];
    for (project in data.projects) {
      projects.push({id: 'project_' + data.projects[project].id, text: escape_html(data.projects[project].name), icon: 'fas fa-book', group: false, expanded: false, access: 'w'});
    }
    if (data.projects.length == 0) {
      projects.push({id: 'placeholder', text: 'No projects'});
    }
    w2ui.main_sidebar.add({ id: 'group_project', text: 'My Projects', img: 'icon-folder', expanded: true, group: true, nodes: projects})

    shared = []
    for (project in data.shared) {
      shared.push({id: 'shared_' + data.shared[project].id, text: escape_html(data.shared[project].name), icon: 'fas fa-book', group: false, expanded: false, access: data.shared[project].access});
    }
    if (data.shared.length == 0) {
      shared.push({id: 'shared_placeholder', text: 'No projects'});
    }
    w2ui.main_sidebar.add({ id: 'group_shared', text: 'Shared with me', img: 'icon-folder', expanded: true, group: true, nodes: shared})

    w2ui.main_sidebar.refresh();
  },

  open_project = function(id, name, access) { // note that name is already escaped
    // add additional toolbar options
    w2ui.main_toolbar.get('menu_file').items.push({ text: '--', id: 'separate_project' }); 
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Export Project ' + name, id: 'export_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Close Project ' + name, id: 'close_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Delete Project ' + name, id: 'delete_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Share Project ' + name, id: 'share_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.insert('menu_last', { type: 'menu', text: 'Add', id: 'menu_add', icon: 'fas fa-plus', items: [
      { text: 'New Folder', id: 'add_folder', icon: 'fas fa-folder'},
      { text: 'New Document', id: 'add_document', icon: 'fas fa-file'},
      { text: 'Upload Bulk', id: 'add_bulk', icon: 'fas fa-copy'}
    ]});

    w2ui.main_toolbar.insert('menu_last', { type: 'menu', id: 'menu_document', caption: 'Document', img: 'icon-page', items: [
      { text: 'Edit', id: 'edit_document' },
      { text: 'Preview', id: 'preview_document' },
      { text: 'Save', id: 'save_document' },
      { text: 'Save All', id: 'save_all' },
      { text: '--', id: 'document_separator' },
      { text: 'Recently Updated', id: 'recent_documents' },
      { text: 'Top Rated', id: 'rated_documents' }
    ]});

    w2ui.main_toolbar.insert('menu_last', { type: 'menu', id: 'menu_edit', caption: 'Edit', img: 'icon-page', items: [
      { text: 'Bold selection', id: 'edit_bold' },
      { text: 'Strikethrough selection', id: 'edit_strikethrough' },
      { text: 'Code  selection', id: 'edit_code' },
      { text: '--', id: 'document_separator' },
      { text: 'New table', id: 'new_table' },
      { text: 'Link', id: 'edit_link' }
    ]});

    w2ui.main_toolbar.insert('menu_right', { type: 'html', id: 'menu_search', html: function(item) {
      return '<div style="color: black">' +
        '<form onsubmit="return search_project()"><input id="search" type="search" name="q" placeholder="Search"/>' +
        '<button type="submit" style="height: 25px; width: 25px"><i class="fa fa-search"></i></button></form>' +
        '</div>';
      } } );

    w2ui.main_toolbar.refresh();

    // enable sidebar context menu
    w2ui.main_sidebar.menu = [
      {id: 'sidebar_open_item', text: 'Open item', icon: 'fas fa-folder-open'},
      {id: 'sidebar_delete_item', text: 'Delete item', icon: 'fas fa-times'},
      {id: 'sidebar_edit_item', text: 'Properties...', icon: 'fas fa-edit'},
    ];

    g.project_id = id;
    g.project_name = name;
    g.project_access = access;
    g.unsaved_count = 0;
    setTimeout(load_project, 10);
  },

  load_project = function() {
    remove_sidebar_nodes();
    w2ui.main_sidebar.refresh();
    set_status('Opening project "' + g.project_name + '"...', true);
    g.project_show_documents = true; // so we can load session
    get_documents();
  },

  remove_form = function(form_name) {
    if (w2ui[form_name]) {
      $().w2destroy(form_name);
      w2ui[form_name] = null;
    }
  },

  /* document */
  add_folder = function() {
      remove_form('add_folder');
      $().w2form({
          name: 'add_folder',
          style: 'border: 0px; background-color: transparent;',
          url: '/set/document',
          formHTML: 
              '<div class="w2ui-page page-0">'+
              '    <div class="w2ui-field">'+
              '        <label>Title:</label>'+
              '        <div>'+
              '           <input name="name" type="text" maxlength="200" style="width: 250px"/>'+
              '        </div>'+
              '    </div>'+
              '</div>'+
              '<div class="w2ui-buttons">'+
              '    <button class="w2ui-btn" name="reset">Reset</button>'+
              '    <button class="w2ui-btn" name="ok">OK</button>'+
              '</div>',
          fields: [
              { field: 'name', type: 'text', required: true }
          ],
          record: { 
              name    : 'Untitled',
              document_type: 'folder',
              project_id: g.project_id,
              parent_id: -1,
              predecessor_id: -1
          },
          onSave: function(event) {
            data = JSON.parse(event.xhr.responseText);
            if (data.status != 'success') {
               show_error(data.status, data.message);
            }
          },
          actions: {
              "ok": function (event) {
                if (g.sidebar_target != null && g.sidebar_target.startsWith('document_')) {
                  this.record.parent_id = g.documents[g.sidebar_target.substring(9)].document.id;
                }
                this.save(function (data) {
                  if (data.status == 'success') {
                      get_documents(data.parent_id);
                      $().w2popup('close');
                  }
                  else {
                      show_error(data.status, data.message);
                  }
                });
              },
              "reset": function () { this.clear(); }
          }
    });
    $().w2popup('open', {
        title   : 'Add folder',
        body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
        style   : 'padding: 15px 0px 0px 0px',
        width   : 500,
        height  : 300, 
        showMax : true,
        onToggle: function (event) {
            $(w2ui.add_folder.box).hide();
            event.onComplete = function () {
                $(w2ui.add_folder.box).show();
                w2ui.add_folder.resize();
            }
        },
        onOpen: function (event) {
            event.onComplete = function () {
                // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                $('#w2ui-popup #form').w2render('add_folder');
            }
        }
    });
  },

  delete_document = function(document_id) {
    w2confirm({ msg: 'Are you sure you want to delete this item? This cannot be undone.', btn_yes: {text: 'Delete'}, btn_no: {text: 'Cancel'} })
      .yes(function () { 
        $.ajax({
          type: "POST",
          url: '/set/document_d', 
          data: {
            id: g.documents[document_id].document.id,
            project_id: g.project_id
          }})
            .done(deleted_document)
            .fail(ajax_fail);
      })
      .no(function () {});
  },

  deleted_document = function(data) {
    if (data.status == 'success') {
      get_documents(data.parent_id);
      set_status('Deleted item.');
    }
    else {
      show_error(data.status, data.message);
    }
  },

  edit_bold = function() {
    if (g.selection_start < 0 || g.selection_start > $('#editable_content').val().length || g.selection_end <= g.selection_start) {
      return
    }

    var 
      old = $('#editable_content').val(), // whole thing
      before = old.substring(0, g.selection_start), // up to start
      text = old.substring(g.selection_start, g.selection_end), 
      after = old.substring(g.selection_end, old.length); 

    $('#editable_content').val(before + '**' + text + '**' + after);
    content_changed(); // so changes are saved
    // if previewing...
    if (g.previewing_document) {
      preview_document();
    }
  },

  edit_strikethrough = function() {
    if (g.selection_start < 0 || g.selection_start > $('#editable_content').val().length || g.selection_end <= g.selection_start) {
      return
    }

    var 
      old = $('#editable_content').val(), // whole thing
      before = old.substring(0, g.selection_start), // up to start
      text = old.substring(g.selection_start, g.selection_end), 
      after = old.substring(g.selection_end, old.length); 

    $('#editable_content').val(before + '~~' + text + '~~' + after);
    content_changed(); // so changes are saved
    // if previewing...
    if (g.previewing_document) {
      preview_document();
    }
  },

  edit_code = function() {
    if (g.selection_start < 0 || g.selection_start > $('#editable_content').val().length || g.selection_end <= g.selection_start) {
      return
    }

    var 
      old = $('#editable_content').val(), // whole thing
      before = old.substring(0, g.selection_start), // up to start
      text = old.substring(g.selection_start, g.selection_end), 
      after = old.substring(g.selection_end, old.length); 

    $('#editable_content').val(before + '~~~\n' + text + '\n~~~' + after);
    content_changed(); // so changes are saved
    // if previewing...
    if (g.previewing_document) {
      preview_document();
    }
  },

  paste_into_editable = function(text) {
    var pos = $('#editable_content').prop('selectionStart'),
      	old = $('#editable_content').val(),
        before = old.substring(0, pos),
        after = old.substring(pos, old.length);

    $('#editable_content').val(before + text + after);
    content_changed(); // so changes are saved
    // if previewing...
    if (g.previewing_document) {
      preview_document();
    }
  },

  new_table = function() {
    var text = '\n\n|Heading1|Heading2|\n|-|-|\n|Value1|Value2|\n\n';
    paste_into_editable(text);    
  },

  edit_link = function() {
    if (g.selection_start < 0 || g.selection_start > $('#editable_content').val().length || g.selection_end <= g.selection_start) {
      return
    }

    var
      old = $('#editable_content').val(), // whole thing
      before = old.substring(0, g.selection_start), // up to start
      text = old.substring(g.selection_start, g.selection_end),
      after = old.substring(g.selection_end, old.length);

    $('#editable_content').val(before + '[Link name](' + text + ')' + after);
    content_changed(); // so changes are saved
    // if previewing...
    if (g.previewing_document) {
      preview_document();
    }
  },

  add_inline_attachment = function(escaped_name, attachment_id) {
    var text = '![' + escaped_name + '](/get/attachment?project_id=' + g.project_id + '&id=' + attachment_id + ')';
    paste_into_editable(text);    
    return false;
  },

  delete_attachment = function(attachment_id) {
    w2confirm({ msg: 'Are you sure you want to delete this item? This cannot be undone.', btn_yes: {text: 'Delete'}, btn_no: {text: 'Cancel'} })
      .yes(function () { 
        $.ajax({
          type: "POST",
          url: '/set/attachment_d', 
          data: {
            id: attachment_id,
            project_id: g.project_id
          }})
            .done(deleted_attachment)
            .fail(ajax_fail);
      })
      .no(function () {});
    return false;
  },

  deleted_attachment = function(data) {
    if (data.status == 'success') {
      delete g.tab_cache['tab_' + g.document_target];
      load_document(g.document_target); 
      set_status('Deleted item.');
    }
    else {
      show_error(data.status, data.message);
    }
  },

  search_project = function() {
    $.ajax({
      type: "POST",
      url: '/search', 
      data: {
        q: $("input[name='q']").val(),
        project_id: g.project_id
      }})
      .done(show_search)
      .fail(ajax_fail);
    return false;
  },

  rated_documents = function() {
    $.ajax({
      type: "POST",
      url: '/search_rated', 
      data: {
        project_id: g.project_id
      }})
      .done(show_search)
      .fail(ajax_fail);
    return false;
  },

  recent_documents = function() {
    $.ajax({
      type: "POST",
      url: '/search_recent', 
      data: {
        project_id: g.project_id
      }})
      .done(show_search)
      .fail(ajax_fail);
    return false;
  }

  show_search = function(data) {
    if (data.status == 'success') {
      // find or create search tab
      var target_id = 'tab_search',
          existing = find_tab(target_id);
      if (existing == null) {
        w2ui.main_layout_main_tabs.add({ id: target_id, text: 'Search', closable: true });
      }
      g.tab_cache[target_id] = { 'document_type': 'search', 'documents': data.documents, 'unsaved': false, 'q': data.q };
      w2ui.main_layout_main_tabs.click(target_id); // select tab to display content
    }
    else {
      show_error(data.status, data.message);
    }
  },

  run_queue = function() {
    if (g.queue.length > 0) {
      var job = g.queue.pop();
      job();
      g.queue_count += 1;
    }
    else {
      g.queue_completed();
    }
  },

  save_to_queue = function(tab) {
    g.queue.push(function () { save_document(tab.substr(4), run_queue) });
  },

  save_all = function() {
    var ok = true;
    if (g.queue.length > 0) {
      w2confirm({ msg: 'Cancel running job? Results can be unpredictable.' })
        .yes( function () { ok = true; } )
        .no( function () { ok = false; });
    }
    if (ok) {
      g.queue = []
      for (tab in g.tab_cache) { // tab == 'tab_xxx'
        if (g.tab_cache[tab].unsaved == true) {
          if ('tab_' + g.document_target == tab) { // is current document
            g.queue.push(function () { save_current_document(run_queue) });
          }
          else { // is not current document
            save_to_queue(tab);
          }
        }
      }
      g.queue_count = 0;
      g.queue_completed = function() {
        set_status(g.queue_count + ' document(s) saved.');
      }
      run_queue();
    }
  },

  saved_all = function() {
    set_status(g.saved + ' document(s) saved.');
  },

  save_document = function(document_target, callback) {
    $.ajax({
      type: "POST",
      url: '/set/document_s', 
      data: {
        id: g.documents[document_target].document.id,
        content: g.tab_cache['tab_' + document_target].content,
        project_id: g.project_id
      }})
      .done(saved_document(document_target, callback))
      .fail(ajax_fail);
  },

  save_current_document = function(callback) {
    if (g.document_target == undefined) {
      return;
    }
    if (g.document_target == "search") {
      return;
    }
    
    // update the cache - used for deciding later if the document has changed
    g.tab_cache['tab_' + g.document_target].content = $('#editable_content').val();

    $.ajax({
      type: "POST",
      url: '/set/document_s', 
      data: {
        id: g.documents[g.document_target].document.id,
        content: g.tab_cache['tab_' + g.document_target].content,
        project_id: g.project_id
      }})
      .done(saved_document(g.document_target, callback))
      .fail(ajax_fail);
  },

  saved_document = function(document_target, callback) {
    return function(data) {
      if (data.status == 'success') {
        set_status('Saved.');
        var current = g.tab_cache['tab_' + document_target];
        if (current.unsaved == true) {
          current.unsaved = false;
          current.updated = Date.now();
          g.unsaved_count -= 1;
          set_status(g.unsaved_count + ' unsaved document(s)');
          w2ui.main_layout_main_tabs.get('tab_' + document_target).text = escape_html(max_length(current.name, MAX_TITLE)); // remove unsaved mark on title
          w2ui.main_layout_main_tabs.refresh();
          if (g.document_target == document_target) { // saved current document
            update_document_details();
          }
        }
        if (callback != undefined) {
          callback();
        }
      }
      else { // error
        show_error(data.status, data.message);
      }
    }
  },

  edit_document_properties = function(document_id) {
      remove_form('edit_document_properties');
      var current = g.documents[document_id];
      $().w2form({
          name: 'edit_document_properties',
          style: 'border: 0px; background-color: transparent;',
          url: '/set/document_u',
          formHTML: 
              '<div class="w2ui-page page-0">'+
              '    <div class="w2ui-field">'+
              '        <label>Title:</label>'+
              '        <div>'+
              '           <input name="name" type="text" maxlength="200" style="width: 250px"/>'+
              '        </div>'+
              '    </div>'+
              '    <div class="w2ui-field">'+
              '        <label>Renderer:</label>'+
              '        <div>'+
              '            <select name="renderer"/>'+
              '        </div>'+
              '    </div>'+
              '</div>'+
              '<div class="w2ui-buttons">'+
              '    <button class="w2ui-btn" name="reset">Reset</button>'+
              '    <button class="w2ui-btn" name="ok">OK</button>'+
              '</div>',
          fields: [
              { field: 'name', type: 'text', required: true },
              { field: 'renderer', type: 'select', required: true, options: { items: ['Markdown', 'Latex'] } }
          ],
          record: { 
              name    : current.document.name,
              document_type: current.document.document_type,
              renderer: current.document.renderer,
              project_id: g.project_id,
              document_id: current.document.id
          },
          onSave: function(event) {
            data = JSON.parse(event.xhr.responseText);
            if (data.status != 'success') {
               show_error(data.status, data.message);
            }
          },
          actions: {
              "ok": function () { 
                this.save(function (data) {
                  if (data.status == 'success') {
                      get_documents();
                      $().w2popup('close');
                  }
                  else {
                      show_error(data.status, data.message);
                  }
                }) 
              },
              "reset": function () { this.clear(); }
          }
      });
      $().w2popup('open', {
        title   : 'Edit document properties',
        body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
        style   : 'padding: 15px 0px 0px 0px',
        width   : 500,
        height  : 300, 
        showMax : true,
        onToggle: function (event) {
            $(w2ui.edit_document_properties.box).hide();
            event.onComplete = function () {
                $(w2ui.edit_document_properties.box).show();
                w2ui.edit_document_properties.resize();
            }
        },
        onOpen: function (event) {
            event.onComplete = function () {
                // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                $('#w2ui-popup #form').w2render('edit_document_properties');
            }
        }
      });
  },

  add_document = function() {
    remove_form('add_document');
    $().w2form({
        name: 'add_document',
        style: 'border: 0px; background-color: transparent;',
        url: '/set/document',
        formHTML: 
            '<div class="w2ui-page page-0">'+
            '    <div class="w2ui-field">'+
            '        <label>Title:</label>'+
            '        <div>'+
            '           <input name="name" type="text" maxlength="200" style="width: 250px"/>'+
            '        </div>'+
            '    </div>'+
            '</div>'+
            '<div class="w2ui-buttons">'+
            '    <button class="w2ui-btn" name="reset">Reset</button>'+
            '    <button class="w2ui-btn" name="ok">OK</button>'+
            '</div>',
        fields: [
            { field: 'name', type: 'text', required: true }
        ],
        record: { 
            name    : 'Untitled',
            document_type: 'document',
            project_id: g.project_id,
            parent_id: -1,
            predecessor_id: -1
        },
        onSave: function(event) {
          data = JSON.parse(event.xhr.responseText);
          if (data.status != 'success') {
             show_error(data.status, data.message);
          }
        },
        actions: {
            "ok": function () { 
              if (g.sidebar_target != null && g.sidebar_target.startsWith('document_')) {
                this.record.parent_id = g.documents[g.sidebar_target.substring(9)].document.id;
              }
              this.save(function (data) {
                if (data.status == 'success') {
                    get_documents(data.parent_id);
                    g.open[data.document_id] = 1; // add to session
                    save_session();
                    g.project_show_documents = true; // so we can load session
                    // open document
                    $().w2popup('close');
                }
                else {
                  show_error(data.status, data.message);
                }
              }) 
            },
            "reset": function () { this.clear(); }
        }
    });
    $().w2popup('open', {
        title   : 'Add document',
        body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
        style   : 'padding: 15px 0px 0px 0px',
        width   : 500,
        height  : 300, 
        showMax : true,
        onToggle: function (event) {
            $(w2ui.add_document.box).hide();
            event.onComplete = function () {
                $(w2ui.add_document.box).show();
                w2ui.add_document.resize();
            }
        },
        onOpen: function (event) {
            event.onComplete = function () {
                // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                $('#w2ui-popup #form').w2render('add_document');
            }
        }
    });
  },

  add_bulk = function() {
    remove_form('add_bulk');
    $().w2form({
        name: 'add_bulk',
        style: 'border: 0px; background-color: transparent;',
        url: '/set/bulk',
        formHTML: 
            '<div class="w2ui-page page-0">'+
            '    <div class="w2ui-field">'+
            '        <label>Upload multiple documents as a single markdown:</label>'+
            '        <div>'+
            '           <input name="file" id="file" style="width: 400px"/>'+
            '        </div>'+
            '    </div>'+
            '</div>'+
            '<div class="w2ui-buttons">'+
            '    <button class="w2ui-btn" name="reset">Reset</button>'+
            '    <button class="w2ui-btn" name="ok">OK</button>'+
            '</div>',
        fields: [
            { field: 'file', type: 'file', required: true }
        ],
        record: { 
            project_id: g.project_id
        },
        onSave: function(event) {
          data = JSON.parse(event.xhr.responseText);
          if (data.status != 'success') {
             show_error(data.status, data.message);
          }
        },
        actions: {
            "ok": function () { 
              this.save(function (data) {
                if (data.status == 'success') {
                    get_documents(data.parent_id);
                    save_session();
                    g.project_show_documents = true; // so we can load session
                    $().w2popup('close');
                }
                else {
                  show_error(data.status, data.message);
                }
              }) 
            },
            "reset": function () { this.clear(); }
        }
    });
    $().w2popup('open', {
        title   : 'Add multiple documents',
        body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
        style   : 'padding: 15px 0px 0px 0px',
        width   : 600,
        height  : 300, 
        showMax : true,
        onToggle: function (event) {
            $(w2ui.add_attachment.box).hide();
            event.onComplete = function () {
                $(w2ui.add_bulk.box).show();
                w2ui.add_bulk.resize();
            }
        },
        onOpen: function (event) {
            event.onComplete = function () {
                // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                $('#w2ui-popup #form').w2render('add_bulk');
            }
        }
    });
    return false;
  },

  get_documents = function(parent_id_to, parent_id_from) {
    $.ajax({ 
      url: "/get/documents?project_id=" + g.project_id
    })
    .done(show_documents(parent_id_to, parent_id_from))
    .fail(ajax_fail);
  },

  document_image = function(item) {
    if (item.document_type == 'folder') {
      return 'icon-folder';
    }
    else {
      return 'icon-page';
    }
  },

  // makes a big tree starting from root if no parent_id
  // documents is a tree of items
  make_tree = function(documents) {
    var result = [], document_id;
    for (var idx in documents) {
      g.documents[documents[idx].document.id] = documents[idx];
      result.push({
        id: 'document_' + documents[idx].document.id, 
        text: escape_html(documents[idx].document.name), 
        img: document_image(documents[idx].document),
        nodes: make_tree(documents[idx].children),
        expanded: documents[idx].document.id in g['expanded']
      });
    }
    return result;
  },

  // if parent_id is not none, only need to update tree from there down
  show_documents = function(parent_id_to, parent_id_from) { 
    return function(data) {
      var queue = [], d;
      // parent_id: undefined=n/a, null=root, other=subtree
      if (parent_id_to !== null && parent_id_from !== null && !(parent_id_to === undefined && parent_id_from === undefined)) { // can do partial
        if (parent_id_from !== undefined && parent_id_from != parent_id_to) {
          remove_sidebar_nodes('document_' + parent_id_from);
          // find root
          queue = data.documents.slice();
          while (queue.length > 0) {
            d = queue.pop();
            if (d.document.id == parent_id_from) {
              w2ui.main_sidebar.add('document_' + parent_id_from, make_tree(d.children)); 
              break;
            }
            else {
              queue.push.apply(queue, d.children.slice());
            }
          }
          w2ui.main_sidebar.refresh('document_' + parent_id_from);
        }
        if (parent_id_to !== undefined) {
          remove_sidebar_nodes('document_' + parent_id_to);
          // find root
          queue = data.documents.slice();
          while (queue.length > 0) {
            d = queue.pop();
            if (d.document.id == parent_id_to) {
              w2ui.main_sidebar.add('document_' + parent_id_to, make_tree(d.children)); 
              break;
            }
            else {
              queue.push.apply(queue, d.children.slice());
            }
          }
          w2ui.main_sidebar.refresh('document_' + parent_id_to);
        }
      }
      else { // do everything
        remove_sidebar_nodes();
        g.documents = [];
        w2ui.main_sidebar.add(make_tree(data.documents)); 
        w2ui.main_sidebar.refresh();
      }

      // now redraw
      if (data.documents.length == 0) {
        w2ui.main_sidebar.add({id: 'placeholder', text: 'No documents.'});
        w2ui.main_sidebar.refresh();
      }
      if (g.project_show_documents) {
        g.project_show_documents = false;
        open_session_documents();
      }
      set_status('Ready')
    }
  },

  open_session_documents = function() {
    for (var key in g.open) {
      if (key in g.documents) {
        open_document(key);
      }
    }
  }

  dragstart = function(ev) {
    ev.dataTransfer.setData("text/plain", ev.target.id);
    ev.dataTransfer.dropEffect = "move";
  },

  dragend = function(ev) {
  },

  dragover = function(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move"
  },

  drop = function(ev) {
    ev.preventDefault();
    var data = ev.dataTransfer.getData("text");
    if (ev.target.id.startsWith('node_document_')) {
      $.ajax({
        type: "POST",
        url: '/set/document_m', 
        data: {
          id: data.substring(14), // node_document_
          project_id: g.project_id,
          target_id: ev.target.id.substring(14)
        }
        }).done(dropped)
         .fail(ajax_fail);
    }
    else if (ev.target.className == 'w2ui-sidebar-div') {
      $.ajax({
        type: "POST",
        url: '/set/document_m', 
        data: {
          id: data.substring(14), // node_document_
          project_id: g.project_id,
          target_id: "root"
        }
        }).done(dropped)
         .fail(ajax_fail);
     }
    else {
      set_status('Cannot move document here.');
    }
  }, 

  // post move
  dropped = function(data) {
    if (data.status == 'success') {
      get_documents(data.parent_id_to, data.parent_id_from);
      set_status('Document moved.');
    }
    else {
      show_error(data.status, data.message);
    }
  },

  remove_sidebar_nodes = function(root_id) {
    var nd = [], root, current, queue = []; 
    if (root_id) {
      root = w2ui.main_sidebar.get(root_id);
      queue = root.nodes;
      while (queue.length > 0) {
        current = queue.pop(); // this seems to actually remove the node
        delete g.documents[current.id.substr(9)];
        nd.push(current);
        queue.push.apply(queue, current.nodes)
      }
    }
    else {
      for (var i in w2ui.main_sidebar.nodes) nd.push(w2ui.main_sidebar.nodes[i].id);
      w2ui.main_sidebar.remove.apply(w2ui.main_sidebar, nd);
    }
  },

  /***** session *****/
  save_session = function() {
    window.sessionStorage.setItem('expanded', JSON.stringify(g.expanded));
    window.sessionStorage.setItem('open', JSON.stringify(g.open));
    window.sessionStorage.setItem('user', JSON.stringify(g.user_settings));
  },

  load_key = function(key) {
    var val = window.sessionStorage.getItem(key);
    if (val == null) {
      return {};
    }
    else {
      return JSON.parse(val);
    }
  },

  load_session = function() {
    g.expanded = load_key('expanded');
    g.open = load_key('open');
    g.user_settings = load_key('user');
    if (!('autosave' in g.user_settings)) {
      g.user_settings.autosave = true;
    }
 },

  /***** helpers *****/

  ajax_fail = function(xhr, textStatus, errorThrown) {
    show_error('error', 'Unable to communicate with server: ' + textStatus);
  },
 
  show_error = function(status, msg) {
    if (status == 'auth') {
      w2confirm('You have been logged out. Do you wish to refresh the page to reauthenticate?')
        .yes(function() { 
          window.location.reload();
        })
       .no(function() {
       });
    }
    else if (msg == undefined) {
      w2alert('Error communicating with server');
      set_status('An error occurred');
    }
    else {
      w2alert(escape_html(msg));
      set_status(msg);
    }
  },

  max_length = function(s, l) {
    if (s.length > l) {
      return s.substr(0, l) + '...';
    }
    else {
      return s
    }
  },

  copy_clipboard = function() {
    var value = document.getElementById('share_url').href,
      $temp = $("<input>");
    $("body").append($temp);
    $temp.val(value).select();
    document.execCommand("copy");
    $temp.remove();
  },

  debug = function(m) {
    if (DEBUG) {
      console.log(Date.now() + ' ' + m);
    }
  },

  escape_html = function (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
      return ENTITY_MAP[s];
    });
  };
