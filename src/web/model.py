#!/usr/bin/env python

'''
  database model for sql alchemy
'''

import datetime
import enum
import uuid

import flask

import sqlalchemy
import sqlalchemy.ext.declarative
import sqlalchemy.orm

# postgres full text search
import sqlalchemy.sql
import sqlalchemy.dialects.postgresql

Base = sqlalchemy.ext.declarative.declarative_base()

def create_tsvector(*args):
  exp = args[0]
  for e in args[1:]:
    exp += ' ' + e
  return sqlalchemy.sql.func.to_tsvector('english', exp)

def generate_id():
  return str(uuid.uuid4())

class User(Base):
  __tablename__ = 'app_user'
  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)
  email = sqlalchemy.Column(sqlalchemy.String(250), nullable=False)
  category = sqlalchemy.Column(sqlalchemy.String(8), nullable=False, default="free")
  storage_used = sqlalchemy.Column(sqlalchemy.Integer, nullable=False, default=0)

class Project(Base):
  __tablename__ = 'project'
  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)

  name = sqlalchemy.Column(sqlalchemy.String(250), nullable=False)
  renderer = sqlalchemy.Column(sqlalchemy.String(8), nullable=False)

  # owner of this project
  owner_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("app_user.id"), nullable=False)
  owner = sqlalchemy.orm.relationship('User', backref=sqlalchemy.orm.backref('projects', lazy='dynamic'))

  def summary(self):
    return {'id': self.id, 'name': self.name, 'renderer': self.renderer, 'created': self.created}

class ProjectUser(Base):
  __tablename__ = 'project_user'
  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)

  user_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("app_user.id"), nullable=False)
  user = sqlalchemy.orm.relationship('User', backref=sqlalchemy.orm.backref('project_users', lazy='dynamic'))

  project_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("project.id"), nullable=False)
  project = sqlalchemy.orm.relationship('Project', backref=sqlalchemy.orm.backref('project_users', lazy='dynamic'))

  access = sqlalchemy.Column(sqlalchemy.String(2), nullable=False, default='r') # (r)eadonly, (c)omment, (w)rite

  def summary(self):
    '''
      returns Project details
    '''
    return {'id': self.project_id, 'name': self.project.name, 'renderer': self.project.renderer, 'created': self.created, 'access': self.access}

  def detail(self):
    '''
      returns project details
    '''
    return {'recid': self.id, 'created': self.created, 'access': self.access, 'username': self.user.email}

# a tree of documents
class Document(Base):
  __tablename__ = 'document'

  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)
  updated = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)

  name = sqlalchemy.Column(sqlalchemy.String(250), nullable=False)
  document_type = sqlalchemy.Column(sqlalchemy.String(8), nullable=False) # folder, document
  renderer = sqlalchemy.Column(sqlalchemy.String(8), nullable=False, default='Markdown') # latex, markdown
  rating = sqlalchemy.Column(sqlalchemy.SmallInteger, nullable=False, default=0) # usefulness 1-5 (0=unrated)
  content = sqlalchemy.Column(sqlalchemy.Text, nullable=False, default='')

  # project for this document
  project_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("project.id"), nullable=False)
  project = sqlalchemy.orm.relationship('Project', backref=sqlalchemy.orm.backref('project_documents', lazy='dynamic'))

  # parent
  parent_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("document.id"), nullable=True)
  children = sqlalchemy.orm.relationship("Document", foreign_keys=[parent_id], post_update=True, backref=sqlalchemy.orm.backref('parent', remote_side=[id]))

  # predecessor (previous sibling)
  predecessor_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("document.id"), nullable=True)
  successors = sqlalchemy.orm.relationship("Document", foreign_keys=[predecessor_id], post_update=True, backref=sqlalchemy.orm.backref('predecessor', remote_side=[id]))

  # full text indexing, used by match query and index creation
  __ts_vector__ = create_tsvector(
    name,
    content,
  )

  __table_args__ = (
    sqlalchemy.Index(
      'idx_document_fts',
      __ts_vector__,
      postgresql_using='gin'
    ),
  )

  def path(self):
    result = []
    document = self.parent
    while document is not None and len(result) < 8:
      result.append(document)
      document = document.parent
    return reversed(result)

  def summary(self):
    '''
      summary document info
    '''
    return {'id': self.id, 'name': self.name, 'document_type': self.document_type, 'rating': self.rating, 'renderer': self.renderer, 'updated': self.updated, 'attachments': [item.detail() for item in self.document_attachments]} #, 'content': self.content}

  def detail(self):
    '''
      full document info
    '''
    return {'id': self.id, 'name': self.name, 'document_type': self.document_type, 'content': self.content, 'rating': self.rating, 'renderer': self.renderer, 'updated': self.updated, 'attachments': [item.detail() for item in self.document_attachments], 'path': [{'id': item.id, 'name': item.name} for item in self.path()]}

  def export(self):
    return {'id': self.id, 'name': self.name, 'document_type': self.document_type, 'content': self.content, 'rating': self.rating, 'renderer': self.renderer, 'updated': self.updated, 'attachments': [item.detail() for item in self.document_attachments], 'parent_id': self.parent_id, 'predecessor_id': self.predecessor_id}

class Attachment(Base):
  __tablename__ = 'attachment'

  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)

  name = sqlalchemy.Column(sqlalchemy.String(250), nullable=False)
  location = sqlalchemy.Column(sqlalchemy.String(250), nullable=False) # absolute or relative url
  size = sqlalchemy.Column(sqlalchemy.Integer, nullable=False, default=0)

  # project for this document
  project_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("project.id"), nullable=False)
  project = sqlalchemy.orm.relationship('Project', backref=sqlalchemy.orm.backref('project_attachments', lazy='dynamic'))

  # associated document
  document_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("document.id"), nullable=True)
  document = sqlalchemy.orm.relationship("Document", backref=sqlalchemy.orm.backref('document_attachments', lazy='dynamic'))

  def detail(self):
    '''
      summary of attachment info
    '''
    return {'id': self.id, 'name': self.name, 'location': self.location, 'size': self.size}

# access and authentication

class AccessToken(Base):
  '''
    a token to create an entry on document user
  '''
  __tablename__ = 'access_token'
  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)
  
  # who issued it
  issuer_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("app_user.id"), nullable=False)
  issuer = sqlalchemy.orm.relationship('User', backref=sqlalchemy.orm.backref('issuer_users', lazy='dynamic'))

  # target document
  document_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("document.id"), nullable=True)
  document = sqlalchemy.orm.relationship('Document', backref=sqlalchemy.orm.backref('token_documents', lazy='dynamic'))

  # target project
  project_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("project.id"), nullable=False)
  project = sqlalchemy.orm.relationship('Project', backref=sqlalchemy.orm.backref('token_projects', lazy='dynamic'))

  # token providing access
  token = sqlalchemy.Column(sqlalchemy.String, nullable=False)
  access = sqlalchemy.Column(sqlalchemy.String(2), nullable=False, default='readonly') # r(eadonly), c(omment), w(rite)

