
import model

class QueryException(Exception):
  def __init__(self, message):
    self.message = message

def json(objects):
  return [o.__json__() for o in objects]

# getters
def projects(db, user_id):
  return db.query(model.Project).filter(model.Project.owner_id == user_id)

def documents(db, user_id, project_id):
  '''
    build a tree of items
  '''
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")
  project = db.query(model.Project).filter((model.Project.id == project_id) & (model.Project.owner_id == user_id)).first()
  if project is None:
    raise QueryException("Invalid project")

  # aim to build children and nexts
  root = None
  documents = {}
  for document in db.query(model.Document).filter(model.Document.project == project).order_by(model.Document.parent_id).order_by(model.Document.predecessor_id):
    # save document
    if document.id in documents:
      documents[document.id]['document'] = document
      documents[document.id]['first'] = document.predecessor_id is None
    else:
      documents[document.id] = {'document': document, 'children': set(), 'next': None, 'first': document.predecessor_id is None}

    # is it the root?
    if document.parent_id is None and document.predecessor_id is None:
      root = document.id

    # it's a child
    if document.parent_id is not None: # add to parent's child
      if document.parent_id not in documents: # haven't seen parent yet
        documents[document.parent_id] = {'children': set(), 'next': None}
      documents[document.parent_id]['children'].add(document.id)

    if document.predecessor_id is not None: # add to predecessor's next
      if document.predecessor_id not in documents: # haven't seen predecessor yet
        documents[document.predecessor_id] = {'children': set(), 'next': None}
      documents[document.predecessor_id]['next'] = document.id

  # now make into a list of nested items
  if root is None:
    return []
  return make_tree(documents[root], documents)

def make_tree(root, documents):
  result = []
  current = root
  while True:
    # find first item in children
    first = None
    for child_id in current['children']:
      if documents[child_id]['first']:
        first = documents[child_id]
        break

    if first is None: # no first found = no children
      result.append({'document': current['document'].__json__(), 'children': []})
    else: # make child tree
      result.append({'document': current['document'].__json__(), 'children': make_tree(first, documents)})

    # iterate over siblings
    if current['next'] is None:
      return result # done
    else:
      current = documents[current['next']]

def document(db, user_id, project_id, document_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")
  project = db.query(model.Project).filter((model.Project.id == project_id) & (model.Project.owner_id == user_id)).first()
  if project is None:
    raise QueryException("Invalid project")
  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  if document is None:
    raise QueryException("Invalid document")
  return document

# setters
def find_or_add_user(db, email):
  user = db.query(model.User).filter(model.User.email == email).one_or_none()
  if user is not None:
    return user

  # add user
  user = model.User(email=email)
  db.add(user)
  db.commit()
  return user

def add_project(db, user_id, name, renderer):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  project = model.Project(name=name, renderer=renderer, owner=user)
  db.add(project)
  db.commit()

def add_document(db, user_id, project_id, document_type, name, parent_id, predecessor_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  project = db.query(model.Project).filter((model.Project.id == project_id) & (model.Project.owner_id == user_id)).first()
  if project is None:
    raise QueryException("Invalid project")

  # initially use project renderer
  renderer = project.renderer

  if parent_id == -1:
    # add to root
    parent_id = None
  else:
    parent = db.query(model.Document).filter((model.Document.id == parent_id) & (model.Document.project == project)).first()
    # if you specify an id, it should point to something
    if parent is None:
      raise QueryException("Invalid parent")
    # new document can't be a child of another document
    if parent.document_type == 'document':
      parent_id = parent.parent_id # point to its parent

    # if a parent, use its renderer
    renderer = parent.renderer

  if predecessor_id == -1: # no predecessor (should be first)
    predecessor_id = None
    # if there is an existing empty predecessor, make it point to this guy
    first = db.query(model.Document).filter((model.Document.project_id == project_id) & (model.Document.parent_id == parent_id) & (model.Document.predecessor_id == None)).first()
  else:
    first = None
    predecessor = db.query(model.Document).filter((model.Document.id == predecessor_id) & (model.Document.project == project)).first()
    if predecessor is None:
      raise QueryException("Invalid predecessor")

  # create the new document
  document = model.Document(project=project, name=name, parent_id=parent_id, predecessor_id=predecessor_id, document_type=document_type, renderer=renderer)
  db.add(document)
  if first is not None:
    db.flush() # get document id
    first.predecessor_id = document.id
  db.commit()

def update_document(db, user_id, project_id, document_id, content):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  project = db.query(model.Project).filter((model.Project.id == project_id) & (model.Project.owner_id == user_id)).first()
  if project is None:
    raise QueryException("Invalid project")
  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  document.content = content
  document.updated = datetime.datetime.utcnow()
  db.commit()

def update_document_properties(db, user_id, project_id, document_id, name, renderer):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  project = db.query(model.Project).filter((model.Project.id == project_id) & (model.Project.owner_id == user_id)).first()
  if project is None:
    raise QueryException("Invalid project")
  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  document.name = name
  document.renderer = renderer
  # TODO if folder, update all sub-items with new renderer
  db.commit()

###
def delete_project(db, user_id, project_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  project = db.query(model.Project).filter(model.Project.id == project_id, model.Project.owner == user).first()
  if project is None:
    raise QueryException("Invalid project")
  db.delete(project)
  db.commit()

def delete_document(db, user_id, project_id, document_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  project = db.query(model.Project).filter(model.Project.id == project_id, model.Project.owner == user).first()
  if project is None:
    raise QueryException("Invalid project")
  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).one_or_none()
  if document is None:
    raise QueryException("Invalid document")
  if len(document.children) > 0:
    raise QueryException("Please delete child documents first") # TODO enable recursive delete

  # fix successor
  for successor in document.successors:
    successor.predecessor = document.predecessor
  
  db.delete(document)
  db.commit()

def move_document(db, user_id, project_id, document_id, parent_id, predecessor_id):
  pass
