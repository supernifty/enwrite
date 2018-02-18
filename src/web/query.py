
import datetime

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

def move_document(db, user_id, project_id, document_id, target_document_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  if document_id == target_document_id:
    raise QueryException("Documents are the same")

  project = db.query(model.Project).filter((model.Project.id == project_id) & (model.Project.owner_id == user_id)).first()
  if project is None:
    raise QueryException("Invalid project")

  document_to_move = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()

  if target_document_id == 'root':
    # was anything pointing to the document? if so, it should now point to the document's predecessor
    document_successor = db.query(model.Document).filter((model.Document.predecessor_id == document_id) & (model.Document.project_id == project_id)).first()
    if document_successor is not None:
      document_successor.predecessor = document_to_move.predecessor
    
    # is there a top level root document? if so, point it to the document
    target_successor = db.query(model.Document).filter((model.Document.parent_id == None) & (model.Document.predecessor_id == None)).first()
    if target_successor is not None:
      target_successor.predecessor = document_to_move

    document_to_move.parent = None
    document_to_move.predecessor = None

    db.commit()
    return

  target_document = db.query(model.Document).filter((model.Document.id == target_document_id) & (model.Document.project_id == project_id)).first()

  if target_document.document_type == 'document': # target is document, add to folder below this document

    # was anything pointing to the target? if so, it should now point to the document
    target_successor = db.query(model.Document).filter((model.Document.predecessor_id == target_document_id) & (model.Document.project_id == project_id)).first()
    document_successor = db.query(model.Document).filter((model.Document.predecessor_id == document_id) & (model.Document.project_id == project_id)).first()

    if target_successor is not None:
      target_successor.predecessor = document_to_move

    # was anything pointing to the document? if so, it should now point to the document's predecessor
    if document_successor is not None:
      document_successor.predecessor = document_to_move.predecessor

    # now the document can point to the target
    document_to_move.parent = target_document.parent # same parent
    document_to_move.predecessor = target_document

  else: # target is folder, place in folder (TODO option to place after folder)
    # was anything pointing to the document? if so, it should now point to the document's predecessor
    document_successor = db.query(model.Document).filter((model.Document.predecessor_id == document_id) & (model.Document.project_id == project_id)).first()
    first_child = db.query(model.Document).filter((model.Document.parent_id == target_document_id) & (model.Document.predecessor_id == None)).first()

    if document_successor is not None:
      document_successor.predecessor = document_to_move.predecessor
      if first_child is not None and first_child.parent_id == document_to_move.parent_id:
        first_child = document_successor

    # find the first item in the folder and have it point to the document
    if first_child is not None and first_child.id != document_to_move.id:
      first_child.predecessor = document_to_move

    # now move into document
    document_to_move.parent = target_document # folder
    document_to_move.predecessor = None # first in list

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

