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

  MAX_SUMMARY = 1024,
  MAX_TITLE = 40,

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
                    return '<div class="banner"><a href="/">NiftyWrite</a></div>'
                }
            },
            { type: 'break' },
            { type: 'menu', id: 'menu_file', caption: 'Project', img: 'icon-folder', items: [
                    { text: 'New Project...', id: 'add_project', icon: 'fas fa-book' } 
                ]
            },
            { type: 'spacer', id: 'menu_last' },
            { type: 'break', id: 'menu_right' },
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

  add_attachment = function() {
    if (!w2ui.add_attachment) {
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
            actions: {
                "ok": function () { 
                  this.save(function (data) {
                    if (data.status == 'success') {
                        delete g.tab_cache['tab_' + g.document_target];
                        load_document(g.document_target); 
                        $().w2popup('close');
                    }
                  }) 
                },
                "reset": function () { this.clear(); }
            }
        });
    }
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

  update_document_details = function() {
    var current = g.tab_cache['tab_' + g.document_target], 
      attachment_list = '',
      summary_list = '';
    // attachments
    for (var attachment in current.attachments) {
      attachment_list += '<li><a target="_blank" href="/get/attachment?project_id=' + g.project_id + '&id=' + current.attachments[attachment].id + '">' + escape_html(current.attachments[attachment].name) + '</a>&nbsp;<a href="" onclick="return delete_attachment(\'' + current.attachments[attachment].id + '\')"><i class="fas fa-trash"></i></a></li>';
    }
    // summary information
    summary_list += '<li>Updated ' + moment(current.updated).fromNow() + '</li>';
    // write to view
    w2ui.main_layout.content('right', 
      '<h3>Details</h3><div class="details"><ul>' + summary_list + '</ul></div>' +
      '<h3>' + current.attachments.length + ' attachment(s)</h3><div class="details"><ul>' + attachment_list + '</ul><p><a href="" onclick="return add_attachment()">Upload...</a></p></div>');
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
        update_document_details(); // right tab
      }
      else {
        toggle_document_view(); // editing versus previewing
      }
    }
    else if (selected_document.document_type == 'search') { 
      if (g.document_target != ev.target.substr(4)) { // changed selection 
        $("#editable_content").off('change keyup paste mouseup', content_changed);
  
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
        current.length + ' matching document(s) found.' +
        '<ul>';
      for (var document of current) {
        content += '<li><a href="#" onclick="open_document(\'' + document.id + '\'); return false">' + document.name + '</a></li>';
      }
      content += '</ul></div>';
      w2ui.main_layout.content('main', content); // main content
      w2ui.main_layout.content('right', '');
    }
    else {
      show_error('unrecognized document type ' + selected_document.document_type);
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
          .fail(ajax_fail);
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
    w2ui.main_toolbar.remove('menu_search');
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
            .fail(ajax_fail);
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
    .fail(ajax_fail);
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
    // toolbar
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Close Project ' + name, id: 'close_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Delete Project ' + name, id: 'delete_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.insert('menu_last', { type: 'menu', text: 'Add', id: 'menu_add', icon: 'fas fa-plus', items: [
      { text: 'New Folder', id: 'add_folder', icon: 'fas fa-folder'},
      { text: 'New Document', id: 'add_document', icon: 'fas fa-file'}
    ]});

    w2ui.main_toolbar.insert('menu_last', { type: 'menu', id: 'menu_document', caption: 'Document', img: 'icon-page', items: [
      { text: 'Edit', id: 'edit_document' },
      { text: 'Preview', id: 'preview_document' },
      { text: 'Save', id: 'save_document' },
      { text: 'Save All', id: 'save_all' }
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
      {id: 'sidebar_edit_item', text: 'Properties', icon: 'fas fa-edit'}
    ];

    g.project_id = id;
    g.project_name = name;
    g.unsaved_count = 0;
    setTimeout(load_project, 10);
  },

  load_project = function() {
    remove_sidebar_nodes();
    w2ui.main_sidebar.refresh();
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
            .fail(ajax_fail);
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
      show_error(data.message);
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

  show_search = function(data) {
    // find or create search tab
    var target_id = 'tab_search',
        existing = find_tab(target_id);
    if (existing == null) {
      w2ui.main_layout_main_tabs.add({ id: target_id, text: 'Search', closable: true });
    }
    g.tab_cache[target_id] = { 'document_type': 'search', 'documents': data.documents, 'unsaved': false };
    w2ui.main_layout_main_tabs.click(target_id); // select tab to display content
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
      .fail(ajax_fail);
  },

  save_current_document = function(callback) {
    if (g.document_target == undefined) {
      return;
    }
    if (g.document_target == "search") {
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
      .fail(ajax_fail);
  },

  saved_document = function(document_target, callback) {
    return function(data) {
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
  },

  ajax_fail = function(xhr, textStatus, errorThrown) {
    show_error('Unable to communicate with server: ' + textStatus);
  },
 
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
