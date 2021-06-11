
import base64
import collections
import datetime
import os
import uuid

import sqlalchemy

import config
import model

ACCESS_READ = 'r'
ACCESS_COMMENT = 'c'
ACCESS_WRITE = 'w'

SEARCH_LIMIT = 50

class AccessException(Exception):
  def __init__(self, message):
    self.message = message

class QueryException(Exception):
  def __init__(self, message):
    self.message = message

def summary(objects):
  return [o.summary() for o in objects]

def detail(objects):
  return [o.detail() for o in objects]


# getters
def projects(db, user_id):
  '''
    projects owned by this user
  '''
  return db.query(model.Project).filter(model.Project.owner_id == user_id)

def shared_projects(db, user_id):
  '''
    projects shared to this user
  '''
  return [ project_user for project_user in db.query(model.ProjectUser).distinct(model.ProjectUser.project_id).filter(model.ProjectUser.user_id == user_id) ]

def get_project_access(db, project_id, user_id, required_access):
  '''
    is owner or has access to project
    returns (project, access)
  '''
  # does user own project?
  project = db.query(model.Project).filter((model.Project.id == project_id) & (model.Project.owner_id == user_id)).first()
  if project is not None:
    return (project, ACCESS_WRITE)

  # does user have shared access to project?
  project_user = db.query(model.ProjectUser).filter(model.ProjectUser.project_id == project_id).filter(model.ProjectUser.user_id == user_id).first()
  if project_user is not None:
    if project_user.access == ACCESS_READ and required_access in (ACCESS_COMMENT, ACCESS_WRITE) or project_user.access == ACCESS_COMMENT and required_access == ACCESS_WRITE:
      raise AccessException("Insufficient access")
    return (project_user.project, project_user.access)

  raise QueryException("Invalid project")

def shares(db, user_id, project_id):
  '''
    who is this project shared with?
  '''
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")

  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)

  return db.query(model.ProjectUser).filter(model.ProjectUser.project_id == project_id)

def documents(db, user_id, project_id):
  '''
    build a tree of items
  '''
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")

  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)

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

def search(db, user_id, project_id, q):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")
  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)
  
  # not using fts
  #result = db.query(model.Document).filter(model.Document.project == project, sqlalchemy.or_(model.Document.name.contains(q), model.Document.content.contains(q)))

  # using fts
  return db.query(model.Document).filter(model.Document.project == project, model.Document.__ts_vector__.op('@@')(sqlalchemy.sql.func.plainto_tsquery(q)))

def search_recent(db, user_id, project_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")
  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)

  return db.query(model.Document).filter(model.Document.project == project).order_by(model.Document.updated.desc()).limit(SEARCH_LIMIT)
 
def search_rated(db, user_id, project_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")
  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)

  return db.query(model.Document).filter(model.Document.project == project).order_by(model.Document.rating.desc()).limit(SEARCH_LIMIT)
 
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
      result.append({'document': current['document'].summary(), 'children': []})
    else: # make child tree
      result.append({'document': current['document'].summary(), 'children': make_tree(first, documents)})

    # iterate over siblings
    if current['next'] is None:
      return result # done
    else:
      current = documents[current['next']]

def document(db, user_id, project_id, document_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")
  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)

  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  if document is None:
    raise QueryException("Invalid document")
  return document

def folder(db, user_id, project_id, document_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication error")
  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)

  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  if document is None:
    raise QueryException("Invalid document")

  return document

def children(db, folder):
  predecessors = {}
  root = None
  for child in db.query(model.Document).filter(model.Document.parent_id == folder.id):
    if child.predecessor_id is None:
      root = child
    else:
      predecessors[child.predecessor_id] = child

  if root is None: # no children
    return []

  result = [root]
  while result[-1].id in predecessors:
    result.append(predecessors[result[-1].id])

  return result

def export_project(db, user_id, project_id):
  '''
    return all the info needed to import data
  '''
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)

  return { 
    'documents': [document.export() for document in db.query(model.Document).filter(model.Document.project == project)]
  }
  

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

def import_project(db, user_id, name, data, attachment_data):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  # for attachments
  root = os.path.abspath(os.path.join(config.ASSETS, user_id, "attachments"))
  if not os.path.exists(root):
    os.makedirs(root)
 
  project = model.Project(name=name, renderer='Markdown', owner=user) # renderer
  db.add(project)
  id_map = {}
  ids_added = set()
  queue = [x for x in data['documents']]
  last_added = 0
  stats = {'documents': 0, 'attachments': 0}
  while len(queue) > 0:
    item = queue.pop(0)
    if item['id'] not in id_map: 
      id_map[item['id']] = model.generate_id()
    if (item['parent_id'] is None or item['parent_id'] in ids_added) and (item['predecessor_id'] is None or item['predecessor_id'] in ids_added):
      document = model.Document(project=project, id=id_map.get(item['id']), name=item['name'], parent_id=id_map.get(item['parent_id']), predecessor_id=id_map.get(item['predecessor_id']), document_type=item['document_type'], renderer=item['renderer'], content=item['content'], updated=item['updated'], rating=item['rating'])
      db.add(document)
      stats['documents'] += 1
      ids_added.add(item['id'])
      last_added = 0
      for attachment in item['attachments']:
        new_attachment_id = model.generate_id()
        # extract and save zipped file to new id
        target_filename = os.path.join(root, new_attachment_id)
        file_data = attachment_data.open(attachment['id'], 'r').read()
        with open(target_filename, "wb") as fh:
          fh.write(file_data)

        new_attachment = model.Attachment(id=new_attachment_id, project=project, document=document, name=attachment["name"], size=len(file_data), location="server")
        db.add(new_attachment)
 
        stats['attachments'] += 1
    else:
      queue.append(item)
      last_added += 1
      if last_added > 2 * len(queue):
        raise QueryException('Circular document definition')

  db.commit()
  return stats

def add_document(db, user_id, project_id, document_type, name, parent_id, predecessor_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_WRITE)

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

  return document

def _fake_root(db, project_id):
  FakeRoot = collections.namedtuple('FakeRoot', ['id', 'children', 'predecessor'])
  return FakeRoot(-1, db.query(model.Document).filter((model.Document.parent_id == None) & (model.Document.project_id == project_id)), -1)

def _add_bulk_document(db, user_id, project_id, name, content):
  folders = name.split('/')[:-1]
  filename = name.split('/')[-1]

  # get a fake root
  root = _fake_root(db, project_id)
  for folder in folders:
    item_found = False
    for child in root.children:
      if child.document_type == 'folder' and child.name == folder:
        root = child
        item_found = True
        break
    if not item_found:
      root = add_document(db, user_id, project_id, 'folder', folder, root.id, -1)

  # now add document
  new_document = add_document(db, user_id, project_id, 'document', filename, root.id, -1)
  # and content
  new_document.content = '\n'.join(content)
  db.commit()

def add_bulk(db, user_id, project_id, attachments):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_WRITE)

  # now add each document found in each attachment
  for attachment in attachments:
    decoded = base64.b64decode(attachment["content"]).decode()
    document_name = None
    content = []
    for line in decoded.split('\n'):
      if line.startswith('# '):
        if document_name is not None:
          _add_bulk_document(db, user_id, project_id, document_name, content)
        document_name = line[2:]
        content = []
      else:
        content.append(line)
    if document_name is not None:
      _add_bulk_document(db, user_id, project_id, document_name, content)

  db.commit()

def add_attachments(db, user_id, project_id, document_id, attachments):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_WRITE)

  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  if document is None:
    raise QueryException("Invalid document")

  # ensure existence of user specific asset dir
  root = os.path.abspath(os.path.join(config.ASSETS, user_id, "attachments"))
  if not os.path.exists(root):
    os.makedirs(root)
 
  # each attachment
  total_size = 0
  saved = []
  try:
    for attachment in attachments:
      # check size is ok
      item = model.Attachment(project=project, document=document, name=attachment["name"], size=attachment["size"], location="server")
      db.add(item)
      db.flush() # get item id
      # save to filesystem
      target_filename = os.path.join(root, item.id)
      decoded = base64.b64decode(attachment["content"])
      if len(decoded) > config.MAX_ATTACHMENT_SIZE:
        raise QueryException("File too large")

      total_size += len(decoded)

      if user.category == 'free' and total_size > config.MAX_FREE_USER_STORAGE:
        raise QueryException("Quota exceeded")

      with open(target_filename, "wb") as fh:
        fh.write(decoded)
      saved.append(target_filename)
  except:
    # deal with already saved files if an exception occurs
    for filename in saved:
      os.remove(filename)
    raise

  user.storage_used += total_size
  db.commit()

def attachment(db, user_id, project_id, attachment_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)
  attachment = db.query(model.Attachment).filter((model.Attachment.id == attachment_id) & (model.Attachment.project_id == project_id)).first()

  if attachment is None:
    raise QueryException("Attachment not found")

  path = os.path.abspath(os.path.join(config.ASSETS, user_id, "attachments", attachment.id))
  
  return {'filename': path, 'name': attachment.name}

def attachments(db, user_id, project_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_READ)

  result = []
  for attachment in db.query(model.Attachment).filter(model.Attachment.project_id == project_id):
    path = os.path.abspath(os.path.join(config.ASSETS, user_id, "attachments", attachment.id))
    result.append({'filename': path, 'name': attachment.name, 'id': attachment.id})
  return result
 
def update_document(db, user_id, project_id, document_id, content):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_WRITE)

  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  document.content = content
  document.updated = datetime.datetime.utcnow()
  db.commit()

def update_document_properties(db, user_id, project_id, document_id, name, renderer):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_WRITE)

  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  document.name = name
  document.renderer = renderer
  # TODO if folder, update all sub-items with new renderer
  db.commit()

def update_document_rating(db, user_id, project_id, document_id, rating):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_WRITE)

  document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  document.rating = rating
  db.commit()

def move_document(db, user_id, project_id, document_id, target_document_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  if document_id == target_document_id:
    raise QueryException("Documents are the same")

  project, access = get_project_access(db, project_id, user_id, ACCESS_WRITE)

  document_to_move = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).first()
  parent_id_prev = document_to_move.parent_id

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
    return (parent_id_prev, None)

  target_document = db.query(model.Document).filter((model.Document.id == target_document_id) & (model.Document.project_id == project_id)).first()

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

  db.commit()

  return (parent_id_prev, document_to_move.parent_id)

###
def delete_project(db, user_id, project_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  project = db.query(model.Project).filter(model.Project.id == project_id, model.Project.owner == user).first()
  if project is None:
    raise QueryException("Only the project owner can do this")

  # delete all asset files
  for attachment in db.query(model.Attachment).filter(model.Attachment.project_id == project_id):
    filename = os.path.abspath(os.path.join(config.ASSETS, user_id, "attachments", attachment.id))
    os.remove(filename)

  db.query(model.Attachment).filter(model.Attachment.project_id == project_id).delete()
  db.query(model.Document).filter(model.Document.project_id == project_id).delete()
  db.delete(project)
  db.commit()

def delete_document(db, user_id, project_id, document_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  project = db.query(model.Project).filter(model.Project.id == project_id, model.Project.owner == user).first()
  if project is None:
    raise QueryException("Only the project owner can do this")
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

  return document.parent_id

def delete_attachment(db, user_id, project_id, attachment_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  project = db.query(model.Project).filter(model.Project.id == project_id, model.Project.owner == user).first()
  if project is None:
    raise QueryException("Only the project owner can do this")
  attachment = db.query(model.Attachment).filter((model.Attachment.id == attachment_id) & (model.Attachment.project_id == project_id)).one_or_none()
  if attachment is None:
    raise QueryException("Invalid attachment")


  filename = os.path.abspath(os.path.join(config.ASSETS, user_id, "attachments", attachment.id))
  os.remove(filename)
 
  user.storage_used -= attachment.size
  db.delete(attachment)
  db.commit()

def revoke_access(db, user_id, project_id, project_user_id):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project, access = get_project_access(db, project_id, user_id, ACCESS_WRITE)

  project_user = db.query(model.ProjectUser).filter(model.ProjectUser.project == project, model.ProjectUser.id == project_user_id).one_or_none()
  if project_user is None:
    raise QueryException("Invalid access")

  db.delete(project_user)
  db.commit()

def add_token(db, user_id, project_id, access, document_id=None ):
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")

  project = db.query(model.Project).filter(model.Project.id == project_id, model.Project.owner == user).first()
  if project is None:
    raise QueryException("Only the project owner can do this")

  if access not in ('c', 'r', 'w'):
    raise QueryException("Invalid access type")

  if document_id is None:
    document = None
  else:
    document = db.query(model.Document).filter((model.Document.id == document_id) & (model.Document.project_id == project_id)).one_or_none()
    if document is None:
      raise QueryException("Invalid document")
  
  token = str(uuid.uuid4())
  access_token = model.AccessToken(issuer=user, project=project, document=document, token=token, access=access)  
  db.add(access_token)
  db.commit()
  return token

def apply_token(db, user_id, token_id):
  # user to be granted access
  user = db.query(model.User).filter(model.User.id == user_id).first()
  if user is None:
    raise QueryException("Authentication failed")
  
  token = db.query(model.AccessToken).filter(model.AccessToken.token == token_id).first()
  if token is None:
    return(False, "Access token does not exist or has already been redeemed")

  # TODO check for sharing with self
  # TODO check for existing

  if token.document is None:
    # add access to project
    user_access = model.ProjectUser(user=user, project=token.project, access=token.access)
    db.add(user_access)
  else: # document specific sharing
    raise QueryException("Not implemented")

  db.delete(token)
  db.commit()
  
  return (True, user_access)
