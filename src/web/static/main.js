var
  g = {
    'sidebar_target': null,
    'document_target': null,
    'tab_cache': {}
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

  init = function() {
    // markdown renderer
      var renderer = new marked.Renderer();
      renderer.table = function(header, body) {
        return "<table class='table table-striped'><thead>" +
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
      onDblClick: sidebar_open_document
    })
    );

    get_projects();
  },

  select_tab = function(ev) {
    // update html
    g.document_target = ev.target.substr(4); // set selected document (tab_)
    w2ui.main_layout.content('main', '<textarea id="editable_content"></textarea><div id="preview_content" style="display: none"></div>')
    // update menu
    w2ui.main_toolbar.insert('menu_last', { type: 'menu', id: 'menu_document', caption: 'Document', img: 'icon-page', items: [
      { text: 'Edit', id: 'edit_document' },
      { text: 'Preview', id: 'preview_document' },
      { text: 'Save', id: 'save_document' }
    ]});
    // TODO this will reset content
    var current = g.tab_cache['tab_' + g.document_target];
    $('#editable_content').val(current.content);
    edit_document();
  },

  edit_document = function() {
    $('#editable_content').show();
    $('#preview_content').hide();
  },

  preview_document = function() {
    console.log(escape_html($('#editable_content').val()));
    $('#preview_content').html(marked(escape_html($('#editable_content').val())));
    MathJax.Hub.Queue(["Typeset",MathJax.Hub]);
    $('#editable_content').hide();
    $('#preview_content').show();
  },

  close_tab = function(ev) {
    // TODO check saved
    // clear cache
    delete g.tab_cache[ev.target];
    w2ui['main_layout'].content('main', '')
    w2ui.main_toolbar.remove('menu_document');
  },

  sidebar_open_document = function(ev) {
    if (ev.target && ev.target.startsWith("document_")) {
      open_document(ev.target.substr(9));
    }
  },

  open_document = function(document_id) {
    var doc = g.documents[document_id];
    if (doc.document.document_type == 'folder') {
      console.log('TODO open folder');
    }
    else {
      var target_id = 'tab_' + document_id,
        existing = $.grep(w2ui.main_layout_main_tabs.tabs, function(el, i) {
          return el.id == target_id;
        });
      if (existing.length == 0) {
        w2ui.main_layout_main_tabs.add({ id: target_id, text: escape_html(doc.document.name), closable: true });
        // load content for this document
        $.ajax({ 
          url: "/get/document?document_id=" + doc.document.id + "&project_id=" + g.project_id
        })
        .done(show_document(target_id))
        .fail(show_error);
      }
      else {
        w2ui.main_layout_main_tabs.click(target_id); // select existing tab
      }
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
      case "menu_document:save_document": return save_document();
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

  set_status = function(m) {
    w2ui.main_layout.content('bottom', escape_html(m));
  },

  update_project_menu = function() {
    submenu = w2ui.main_toolbar.get('menu_file');    
    submenu.items = remove_by_id(submenu.items, "close_project");
    submenu.items = remove_by_id(submenu.items, "delete_project");
    w2ui.main_toolbar.remove('menu_add');
    w2ui.main_toolbar.refresh();
    w2ui.main_sidebar.menu = [];
    get_projects();
  },

  /* project */

  close_project = function() {
    update_project_menu();
    set_status('Closed project "' + escape_html(g.project_name) + '"');
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
      set_status('Deleted project "' + escape_html(g.project_name) + '"');
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
                '           <input name="name" type="text" maxlength="100" style="width: 250px"/>'+
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

  open_project = function(id, name) {
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Close Project ' + escape_html(name), id: 'close_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.get('menu_file').items.push({ text: 'Delete Project ' + escape_html(name), id: 'delete_project', icon: 'fas fa-book'}); 
    w2ui.main_toolbar.insert('menu_last', { type: 'menu', text: 'Add', id: 'menu_add', icon: 'fas fa-plus', items: [
      { text: 'New Folder', id: 'add_folder', icon: 'fas fa-folder'},
      { text: 'New Document', id: 'add_document', icon: 'fas fa-file'}
    ]}); 
    w2ui.main_toolbar.refresh();
    // enable sidebar context menu
    w2ui.main_sidebar.menu = [
      {id: 'sidebar_open_item', text: 'Open item', icon: 'fas fa-folder-open'},
      {id: 'sidebar_delete_item', text: 'Delete item', icon: 'fas fa-times'}
    ]
    g.project_id = id;
    g.project_name = name;
    setTimeout(load_project, 10);
  },

  load_project = function() {
    remove_sidebar_nodes();
    w2ui.main_sidebar.refresh();
    // TODO load folders
    set_status('Opened project "' + escape_html(g.project_name) + '"');
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
                '           <input name="name" type="text" maxlength="100" style="width: 250px"/>'+
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

  save_document = function() {
    $.ajax({
      type: "POST",
      url: '/set/document_s', 
      data: {
        id: g.documents[g.document_target].document.id,
        content: $('#editable_content').val(),
        project_id: g.project_id
      }})
      .done(saved_document)
      .fail(show_error);
  },

  saved_document = function(data) {
    set_status('Saved.');
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
                '           <input name="name" type="text" maxlength="100" style="width: 250px"/>'+
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
    var result = [];
    for (idx in documents) {
      g.documents.push(documents[idx]);
      result.push({
        id: 'document_' + (g.documents.length - 1), 
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

  escape_html = function (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
      return ENTITY_MAP[s];
    });
  },

  init_about = function() {
    var main_layout = $('#main_layout').w2layout({
        name: 'main_layout',
        panels: [
            { type: 'top', size: 45, style: 'border: 0px; border-bottom: 1px solid silver; background-color: #000; color: #fff;', overflow: 'hidden'},
            { type: 'main', style: 'background-color: white;' }
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
            { type: 'spacer' },
            { type: 'button', id: 'menu_login', text: 'Login', icon: 'fa-star' }
        ],
        onClick: function (ev) {
          if (ev.target == 'menu_login') {
            location.href = '/';
          }
        }
    }));

    w2ui.main_layout.content('main', '<div style="color: #000" class="container">' +
      '<div class="row">' +
      '  <h2>Nifty Write</h2>' +
      '  NiftyWrite is a tool for managing substantial writing projects, such as your book, thesis, or other magnus opus. ' +
      '</div>' +
      '<div class="row">' +
        '<h2>Features</h2>' +
        '<ul><li>Markdown formatting</li></ul>' +
      '</div>' +
      '<div class="row">' +
        '<h2>Status</h2>' +
      '</div>' +
      '<div class="row">' +
        '<h2>Pricing</h2>' +
      '</div>' +
      '</div>');
  }

