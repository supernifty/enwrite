var
  g = {
    'sidebar_target': null,
    'document_target': null,
    'tab_cache': {},
    'queue': [],
    'previewing_document': false
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

  MAX_SUMMARY = 250,
  MAX_TITLE = 50,

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
            { type: 'bottom', size: 18, style: 'border: 0px; border-top: 1px solid silver; background-color: #ccc; color: #000;', overflow: 'hidden'}
        ]
    });
    w2ui.main_layout.content('top', $().w2toolbar({
        name: 'main_toolbar',
        items: [
            { type: 'html',  id: 'menu_root',
                html: function (item) {
                    return '<div class="banner"><a href="/">NiftyWrite</a></div>'
                }
            },
            { type: 'break' },
            { type: 'menu', id: 'menu_file', caption: 'Project', img: 'icon-folder', items: [
                    { text: 'New Project...', id: 'add_project', icon: 'fas fa-book' } 
                ]
            },
            { type: 'spacer', id: 'menu_last' },
            { type: 'break' },
            { type: 'button', id: 'menu_about', text: 'About' },
            { type: 'menu', id: 'menu_user', text: 'Loading...', icon: 'fa-star', items: [ 
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
          open_project(ev.target.substr(8), ev.node.text);
        }
        if (ev.target && ev.target.startsWith('document_')) {
          g.sidebar_target = ev.target;
        }
      },
      onMenuClick: sidebar_menu_handler,
      onDblClick: sidebar_open_document,
      onRefresh: sidebar_refresh
    })
    );

    get_projects();

    // drag and drop documents
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
          if (item.renderer == 'Latex') {
            content += '<div class="pure-u-1-3"><div class="child_outer"><div class="child_header">' + escape_html(max_length(item.name, MAX_TITLE)) + '</div><div class="child_content">' + escape_html(max_length(item.content, MAX_SUMMARY)) + '</div></div></div>';
          }
          else {
            content += '<div class="pure-u-1-3"><div class="child_outer"><div class="child_header">' + escape_html(max_length(item.name, MAX_TITLE)) + '</div><div class="child_content">' + marked(escape_html(max_length(item.content, MAX_SUMMARY))) + '</div></div></div>';
          }
        }
        content += '</div>';
        w2ui.main_layout.content('main', content);
      }
    }
    else {
      if (g.document_target != ev.target.substr(4)) { // changed selection 
        $("#editable_content").off('change keyup paste mouseup', content_changed);
  
        // save changes to old tab
        var current;
        if (g.document_target != null) {
          current = g.tab_cache['tab_' + g.document_target];
          current.content = $('#editable_content').val();
        }
  
        g.document_target = ev.target.substr(4);
        w2ui.main_layout.content('main', '<textarea id="editable_content"></textarea><div id="preview_content" style="display: none"></div>')
        current = g.tab_cache['tab_' + g.document_target];
        $('#editable_content').val(current.content);
        $('#editable_content').on('change keyup paste mouseup', content_changed);
        preview_document();
      }
      else {
        toggle_document_view();
      }
    }
  },

  content_changed = function(ev) {
    // mark tab as unsaved
    var current = g.tab_cache['tab_' + g.document_target];
    if (current.unsaved != true && current.content != $('#editable_content').val()) { // undefined or false
      current.unsaved = true;
      g.unsaved_count += 1;
      set_status(g.unsaved_count + ' unsaved document(s)');
      w2ui.main_layout_main_tabs.get('tab_' + g.document_target).text = escape_html(current.name) + ' *';
      w2ui.main_layout_main_tabs.refresh();
    }
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
    $('#editable_content').show();
    $('#preview_content').hide();
    g.previewing_document = false;
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
          .fail(show_error);
    }
    else {
      $('#preview_content').html(marked(escape_html($('#editable_content').val())));
      MathJax.Hub.Queue(["Typeset",MathJax.Hub]);
    }
    $('#editable_content').hide();
    $('#preview_content').show();
    g.previewing_document = true;
  },

  rendered = function(data) {
    $('#preview_content').html(data.content);
  },

  close_tab = function(ev) {
    // check saved
    var current = g.tab_cache['tab_' + g.document_target];
    if (current.unsaved == true) {
      if (!confirm('This document has unsaved changed. Are you sure?')) {
        ev.preventDefault();
        return
      }
    }
    
    // clear cache
    delete g.tab_cache[ev.target];
    w2ui.main_layout.content('main', '');
    g.document_target = null;

    // select another tab
    if (Object.keys(g.tab_cache).length > 0) {
      w2ui.main_layout_main_tabs.click(Object.keys(g.tab_cache)[0]); // select existing tab
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
    var doc = g.documents[document_id],
        target_id = 'tab_' + document_id,
        existing = find_tab(target_id);
    if (existing == null) {
      if (doc.document.document_type == 'folder') {
        w2ui.main_layout_main_tabs.add({ id: target_id, text: escape_html(doc.document.name), closable: true });
        // load content for this document
        $.ajax({ 
          url: "/get/folder?document_id=" + doc.document.id + "&project_id=" + g.project_id
        })
        .done(show_folder(target_id))
        .fail(show_error);
      }
      else {
        w2ui.main_layout_main_tabs.add({ id: target_id, text: escape_html(doc.document.name), closable: true });
        // load content for this document
        $.ajax({ 
          url: "/get/document?document_id=" + doc.document.id + "&project_id=" + g.project_id
        })
        .done(show_document(target_id))
        .fail(show_error);
      }
    }
    else {
      w2ui.main_layout_main_tabs.click(target_id); // select existing tab
    }
  },

  show_folder = function(target_id) {
    return function(data) {
      set_status('Opened folder containing ' + data.children.length + ' item(s).');
      g.tab_cache[target_id] = data.document;
      g.tab_cache[target_id].children = data.children;
      w2ui.main_layout_main_tabs.click(target_id); // select tab to display content
    }
  },

  show_document = function(target_id) {
    return function(data) {
      if (data.document.content == null) {
        set_status('Opened empty document');
      }
      else {
        set_status('Opened document of size ' + data.document.content.length);
      }
      g.tab_cache[target_id] = data.document;
      w2ui.main_layout_main_tabs.click(target_id); // select tab
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
      case "menu_file:close_project": return close_project(); 
      case "menu_file:delete_project": return delete_project(); 
      case "menu_add": return true;
      case "menu_add:add_folder": return add_folder();
      case "menu_add:add_document": return add_document();
      case "menu_document": return true;
      case "menu_document:edit_document": return edit_document();
      case "menu_document:preview_document": return preview_document();
      case "menu_document:save_document": return save_current_document();
      case "menu_document:save_all": return save_all();
      case "menu_about": location.href = "/about"; return true;
      case "menu_user": return true;
      case "menu_user:logout": return logout();
    }
    w2alert('Unexpected command: ' + ev.target);
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
    submenu.items = remove_by_id(submenu.items, "close_project");
    submenu.items = remove_by_id(submenu.items, "delete_project");
    w2ui.main_toolbar.remove('menu_add');
    w2ui.main_toolbar.remove('menu_document');
    w2ui.main_toolbar.refresh();
    w2ui.main_sidebar.menu = [];
    get_projects();
  },

  /* project */

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
            .fail(show_error);
      })
      .no(function () {});
  },

  deleted_project = function(data) {
    if (data.status == 'success') {
      update_project_menu();
      set_status('Deleted project "' + g.project_name + '"', true);
    }
    else {
      show_error(data.message);
    }
  },

  add_project = function() {
    if (!w2ui.add_project) {
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
            actions: {
                "ok": function () { 
                  this.save(function (data) {
                    if (data.status == 'success') {
                        get_projects();
                        $().w2popup('close');
                    }
                  }) 
                },
                "reset": function () { this.clear(); }
            }
        });
    }
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

  get_projects = function() {
    $.ajax({ 
      url: "/get/projects"
    })
    .done(show_projects)
    .fail(show_error);
  },

  show_projects = function(data) {
    w2ui.main_toolbar.set('menu_user', { text: 'Logged in as ' + escape_html(data.username) });
    remove_sidebar_nodes();
    for (project in data.projects) {
      w2ui.main_sidebar.add({id: 'project_' + data.projects[project].id, text: escape_html(data.projects[project].name), icon: 'fas fa-book', group: false, expanded: false});
    }
    if (data.projects.length == 0) {
      w2ui.main_sidebar.add({id: 'placeholder', text: 'No projects'});
    }
    w2ui.main_sidebar.refresh();
  },

  open_project = function(id, name) { // note that name is already escaped
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Close Project ' + name, id: 'close_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Delete Project ' + name, id: 'delete_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.insert('menu_last', { type: 'menu', text: 'Add', id: 'menu_add', icon: 'fas fa-plus', items: [
      { text: 'New Folder', id: 'add_folder', icon: 'fas fa-folder'},
      { text: 'New Document', id: 'add_document', icon: 'fas fa-file'}
    ]}); 
    w2ui.main_toolbar.refresh();
    // enable sidebar context menu
    w2ui.main_sidebar.menu = [
      {id: 'sidebar_open_item', text: 'Open item', icon: 'fas fa-folder-open'},
      {id: 'sidebar_delete_item', text: 'Delete item', icon: 'fas fa-times'},
      {id: 'sidebar_edit_item', text: 'Properties', icon: 'fas fa-edit'}
    ]
    w2ui.main_toolbar.insert('menu_last', { type: 'menu', id: 'menu_document', caption: 'Document', img: 'icon-page', items: [
      { text: 'Edit', id: 'edit_document' },
      { text: 'Preview', id: 'preview_document' },
      { text: 'Save', id: 'save_document' },
      { text: 'Save All', id: 'save_all' }
    ]});
 
    g.project_id = id;
    g.project_name = name;
    g.unsaved_count = 0;
    setTimeout(load_project, 10);
  },

  load_project = function() {
    remove_sidebar_nodes();
    w2ui.main_sidebar.refresh();
    // TODO load folders
    set_status('Opened project "' + g.project_name + '"', true);
    get_documents();
  },

  /* document */
  add_folder = function() {
      if (!w2ui.add_folder) {
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
            actions: {
                "ok": function () { 
                  if (g.sidebar_target != null && g.sidebar_target.startsWith('document_')) {
                    this.record.parent_id = g.documents[g.sidebar_target.substring(9)].document.id;
                  }
                  this.save(function (data) {
                    if (data.status == 'success') {
                        get_documents();
                        $().w2popup('close');
                    }
                  }) 
                },
                "reset": function () { this.clear(); }
            }
        });
    }
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
            .fail(show_error);
      })
      .no(function () {});
  },

  deleted_document = function(data) {
    if (data.status == 'success') {
      get_documents();
      set_status('Deleted item.');
    }
    else {
      show_error(data.message);
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
            g.queue.push(function () { save_document(tab.substr(4), run_queue) });
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
      .fail(show_error);
  },

  save_current_document = function(callback) {
    if (g.document_target == undefined) {
      return;
    }

    $.ajax({
      type: "POST",
      url: '/set/document_s', 
      data: {
        id: g.documents[g.document_target].document.id,
        content: $('#editable_content').val(),
        project_id: g.project_id
      }})
      .done(saved_document(g.document_target, callback))
      .fail(show_error);
  },

  saved_document = function(document_target, callback) {
    return function(data) {
      set_status('Saved.');
      var current = g.tab_cache['tab_' + document_target];
      if (current.unsaved == true) {
        current.unsaved = false;
        g.unsaved_count -= 1;
        set_status(g.unsaved_count + ' unsaved document(s)');
        w2ui.main_layout_main_tabs.get('tab_' + document_target).text = escape_html(current.name);
        w2ui.main_layout_main_tabs.refresh();
      }
      if (callback != undefined) {
        callback();
      }
    }
  },

  edit_document_properties = function(document_id) {
      if (w2ui.edit_document_properties) {
        $().w2destroy('edit_document_properties');
      }
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
          actions: {
              "ok": function () { 
                this.save(function (data) {
                  if (data.status == 'success') {
                      get_documents();
                      $().w2popup('close');
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
      if (!w2ui.add_document) {
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
            actions: {
                "ok": function () { 
                  if (g.sidebar_target != null && g.sidebar_target.startsWith('document_')) {
                    this.record.parent_id = g.documents[g.sidebar_target.substring(9)].document.id;
                  }
                  this.save(function (data) {
                    if (data.status == 'success') {
                        get_documents();
                        $().w2popup('close');
                    }
                  }) 
                },
                "reset": function () { this.clear(); }
            }
        });
    }
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

  get_documents = function() {
    $.ajax({ 
      url: "/get/documents?project_id=" + g.project_id
    })
    .done(show_documents)
    .fail(show_error);
  },

  document_image = function(item) {
    if (item.document_type == 'folder') {
      return 'icon-folder';
    }
    else {
      return 'icon-page';
    }
  },

  make_tree = function(documents) {
    var result = [], document_id;
    for (idx in documents) {
      g.documents[documents[idx].document.id] = documents[idx];
      result.push({
        id: 'document_' + documents[idx].document.id, 
        text: escape_html(documents[idx].document.name), 
        img: document_image(documents[idx].document),
        nodes: make_tree(documents[idx].children)
      }); 
    }
    return result;
  },

  show_documents = function(data) {
    remove_sidebar_nodes();
    g.documents = [];
    w2ui.main_sidebar.add(make_tree(data.documents)); 
    if (data.documents.length == 0) {
      w2ui.main_sidebar.add({id: 'placeholder', text: 'No documents.'});
    }
    w2ui.main_sidebar.refresh();
  },

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
         .fail(show_error);
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
         .fail(show_error);
     }
    else {
      set_status('Cannot move document here.');
    }
  }, 

  dropped = function(data) {
    if (data.status == 'success') {
      get_documents();
      set_status('Document moved.');
    }
    else {
      show_error(data.message);
    }
  },

  remove_sidebar_nodes = function() {
    var nd = []; 
    for (var i in w2ui.main_sidebar.nodes) nd.push(w2ui.main_sidebar.nodes[i].id);
    w2ui.main_sidebar.remove.apply(w2ui.main_sidebar, nd);
  }
 
  show_error = function(msg) {
    if (msg == undefined) {
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
  }

  escape_html = function (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
      return ENTITY_MAP[s];
    });
  };
