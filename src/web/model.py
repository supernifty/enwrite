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

Base = sqlalchemy.ext.declarative.declarative_base()

def generate_id():
  return str(uuid.uuid4())

class User(Base):
  __tablename__ = 'app_user'
  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)
  email = sqlalchemy.Column(sqlalchemy.String(250), nullable=False)

class Project(Base):
  __tablename__ = 'project'
  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)

  name = sqlalchemy.Column(sqlalchemy.String(250), nullable=False)
  renderer = sqlalchemy.Column(sqlalchemy.String(8), nullable=False)

  # owner of this project
  owner_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey("app_user.id"), nullable=False)
  owner = sqlalchemy.orm.relationship('User', backref=sqlalchemy.orm.backref('projects', lazy='dynamic'))

  def __json__(self):
    return {'id': self.id, 'name': self.name, 'renderer': self.renderer, 'created': self.created}

# a tree of documents
class Document(Base):
  __tablename__ = 'document'

  id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, default=generate_id)
  created = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)
  updated = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.utcnow, nullable=False)

  name = sqlalchemy.Column(sqlalchemy.String(250), nullable=False)
  document_type = sqlalchemy.Column(sqlalchemy.String(8), nullable=False) # folder, document
  renderer = sqlalchemy.Column(sqlalchemy.String(8), nullable=False, default='Markdown') # latex, markdown
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

  def __json__(self):
    '''
      summary document info
    '''
    return {'id': self.id, 'name': self.name, 'document_type': self.document_type, 'renderer': self.renderer} #, 'content': self.content}

  def serializable(self):
    '''
      full document info
    '''
    return {'id': self.id, 'name': self.name, 'document_type': self.document_type, 'content': self.content, 'renderer': self.renderer}
