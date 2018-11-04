#!/usr/bin/env python
'''
  main application defines available views
'''

import base64
import datetime
import flask
import flask_mail
import io
import json
import mimetypes
import os
import urllib.parse
import zipfile

import sqlalchemy
import flask_sqlalchemy

import auth
import config
import model
import proxy
import query


app = flask.Flask(__name__, template_folder='templates')
app.wsgi_app = proxy.ReverseProxied(app.wsgi_app)
app.config.from_pyfile('config.py')
app.secret_key = 'ducks in space'

mail = flask_mail.Mail(app)

if config.AUTHENTICATE:
    authenticator = auth.GoogleAuth(app)
else:
    authenticator = auth.NoAuth(app)

# database
_db_session = None

class JSONEncoder(json.JSONEncoder):
  def default(self, o):
    if isinstance(o, datetime.datetime):
      return o.isoformat()

    return json.JSONEncoder.default(self, o)

def db():
    global _db_session
    if _db_session is None: # first time
        engine = sqlalchemy.create_engine(app.config['SQLALCHEMY_DATABASE_URI']) # for debugging , echo=True)
        # get session
        session_maker = sqlalchemy.orm.scoped_session(
            sqlalchemy.orm.sessionmaker(autocommit=False, autoflush=False, bind=engine)
        )
        model.Base.query = session_maker.query_property()

        # create and bind
        model.Base.metadata.create_all(bind = engine, checkfirst=True)
        #model.Base.metadata.bind = engine

        # remember
        _db_session = session_maker
    return _db_session

@app.teardown_appcontext
def shutdown_session(exception=None):
    db().remove()

@app.before_request
def make_session_permanent():
    flask.session.permanent = True
    app.permanent_session_lifetime = datetime.timedelta(hours=24)

### program logic
# main summary page
@app.route("/")
def home():
    if not authenticator.is_auth(flask.session):
        return flask.redirect(flask.url_for('login'))
    return flask.render_template('home.html')

# getters
@app.route("/get/<category>", methods=['GET'])
def get_data(category):
    if not authenticator.is_auth(flask.session):
        return flask.jsonify(status="auth", message="User is not authenticated")

    try:
        # project level
        if category == 'projects':
           if 'message' in flask.session:
               message=flask.session['message']
               del flask.session['message']
               return flask.jsonify(
                   message=message,
                   username=authenticator.username(flask.session), 
                   projects=query.summary(query.projects(db(), authenticator.user_id(flask.session)).all()),
                   shared=query.summary(query.shared_projects(db(), authenticator.user_id(flask.session))) 
               )
           else:
               return flask.jsonify(
                   username=authenticator.username(flask.session), 
                   projects=query.summary(query.projects(db(), authenticator.user_id(flask.session)).all()),
                   shared=query.summary(query.shared_projects(db(), authenticator.user_id(flask.session))) 
               )

        if category == 'documents':
           if flask.request.args.get('project_id') is None:
               raise query.QueryException("Required parameter project_id not provided")
           return flask.jsonify(username=authenticator.username(flask.session), documents=query.documents(db(), authenticator.user_id(flask.session), flask.request.args.get('project_id')))

        if category == 'shares':
           if flask.request.args.get('project_id') is None:
               raise query.QueryException("Required parameter project_id not provided")
           return flask.jsonify(status="success", username=authenticator.username(flask.session), shares=query.detail(query.shares(db(), authenticator.user_id(flask.session), flask.request.args.get('project_id'))))

        # document level
        if category == 'document':
           if flask.request.args.get('project_id') is None:
               raise query.QueryException("Required parameter project_id not provided")
           if flask.request.args.get('document_id') is None:
               raise query.QueryException("Required parameter document_id not provided")

           document = query.document(db(), authenticator.user_id(flask.session), flask.request.args.get('project_id'), flask.request.args.get('document_id'))
           return flask.jsonify(username=authenticator.username(flask.session), document=document.detail())

        if category == 'folder':
           if flask.request.args.get('project_id') is None:
               raise query.QueryException("Required parameter project_id not provided")
           if flask.request.args.get('document_id') is None:
               raise query.QueryException("Required parameter document_id not provided")
           folder = query.folder(db(), authenticator.user_id(flask.session), flask.request.args.get('project_id'), flask.request.args.get('document_id'))
           children = query.children(db(), folder)
           return flask.jsonify(username=authenticator.username(flask.session), document=folder.detail(), children=query.detail(children))

        if category == 'attachment':
           if flask.request.args.get('project_id') is None:
               raise query.QueryException("Required parameter project_id not provided")
           if flask.request.args.get('id') is None:
               raise query.QueryException("Required parameter id not provided")
           result = query.attachment(db(), authenticator.user_id(flask.session), flask.request.args.get('project_id'), flask.request.args.get('id'))
           response = flask.make_response(open(result['filename'], 'rb').read())
           content_type = mimetypes.MimeTypes().guess_type(result['name'])[0]
           response.headers['Content-Type'] = content_type or 'application/octet-stream'
           response.headers['Content-Disposition'] = 'inline; filename="{}"'.format(result["name"].replace('"', '')) # TODO encode name
           return response

    except query.QueryException as ex:
        return flask.jsonify(status="error", message="Request failed: {}".format(ex.message))

# setters
@app.route("/set/<category>", methods=['POST'])
def set_data(category):
    if not authenticator.is_auth(flask.session):
        return flask.jsonify(status="auth", message="User is not authenticated")

    try:
        if category == 'project': # new project
            req = json.loads(flask.request.form['request'])
            # create project
            query.add_project(db(), authenticator.user_id(flask.session), req['record']['name'], req['record']['renderer'])
            return flask.jsonify(status="success")
    
        if category == 'project_d': # delete project
            project_id = flask.request.form['id']
            query.delete_project(db(), authenticator.user_id(flask.session), project_id)
            return flask.jsonify(status="success")
    
        if category == 'share_revoke': # revoke access
            project_id = flask.request.form['project_id']
            project_user_id = flask.request.form['id']
            query.revoke_access(db(), authenticator.user_id(flask.session), project_id, project_user_id)
            shares = query.detail(query.shares(db(), authenticator.user_id(flask.session), project_id))
            return flask.jsonify(status="success", shares=shares)

        if category == 'document': # add folder/document
            req = json.loads(flask.request.form['request'])
            query.add_document(db(), authenticator.user_id(flask.session), req['record']['project_id'], req['record']['document_type'], req['record']['name'], req['record']['parent_id'], req['record']['predecessor_id'])
            return flask.jsonify(status="success")
     
        if category == 'document_d': # delete document
            document_id = flask.request.form['id']
            project_id = flask.request.form['project_id']
            query.delete_document(db(), authenticator.user_id(flask.session), project_id, document_id)
            return flask.jsonify(status="success")

        if category == 'document_s': # save document
            document_id = flask.request.form['id']
            project_id = flask.request.form['project_id']
            content = flask.request.form['content']
            query.update_document(db(), authenticator.user_id(flask.session), project_id, document_id, content)
            return flask.jsonify(status="success")

        if category == 'document_u': # update document
            req = json.loads(flask.request.form['request'])
            query.update_document_properties(db(), authenticator.user_id(flask.session), req['record']['project_id'], req['record']['document_id'], req['record']['name'], req['record']['renderer'])
            return flask.jsonify(status="success")

        if category == 'document_r': # rate document
            document_id = flask.request.form['id']
            project_id = flask.request.form['project_id']
            rating = int(flask.request.form['rating'])
            query.update_document_rating(db(), authenticator.user_id(flask.session), project_id, document_id, rating)
            return flask.jsonify(status="success", rating=rating)
 
        if category == 'document_m': # move document
            document_id = flask.request.form['id']
            project_id = flask.request.form['project_id']
            target_id = flask.request.form['target_id']
            query.move_document(db(), authenticator.user_id(flask.session), project_id, document_id, target_id)
            return flask.jsonify(status="success")

        if category == 'attachment': # add attachment
            req = json.loads(flask.request.form['request'])
            query.add_attachments(db(), authenticator.user_id(flask.session), req['record']['project_id'], req['record']['id'], req['record']['file'])
            return flask.jsonify(status="success")

        if category == 'attachment_d': # delete attachment
            attachment_id = flask.request.form['id']
            project_id = flask.request.form['project_id']
            query.delete_attachment(db(), authenticator.user_id(flask.session), project_id, attachment_id)
            return flask.jsonify(status="success")


    except query.AccessException as ex:
        return flask.jsonify(status="access", message=ex.message)
    except query.QueryException as ex:
        return flask.jsonify(status="error", message=ex.message)

    return flask.jsonify(status="error", message="Unrecognized command {}".format(category))

# export a project
@app.route("/export/<project_id>/", methods=['GET'])
def export_project(project_id):
  if not authenticator.is_auth(flask.session):
    return flask.jsonify(status="auth", message="User is not authenticated")
  zipped_data = io.BytesIO()
  zipped = zipfile.ZipFile(zipped_data, mode="w")
  db_data = json.dumps(query.export_project(db(), authenticator.user_id(flask.session), project_id), cls=JSONEncoder)
  zipped.writestr("db.json", db_data)
  for attachment in query.attachments(db(), authenticator.user_id(flask.session), project_id):
    zipped.write(attachment['filename'], attachment['id'])
  zipped.close()
  zipped_data.seek(0)
  return flask.send_file(zipped_data, attachment_filename='enwrite.zip', as_attachment=True, mimetype='application/zip')

@app.route("/import", methods=['POST'])
def import_project():
  if not authenticator.is_auth(flask.session):
    return flask.jsonify(status="auth", message="User is not authenticated")

  req = json.loads(flask.request.form['request'])
  decoded = io.BytesIO(base64.b64decode(req['record']['file'][0]["content"]))
  zipped = zipfile.ZipFile(decoded) # TODO limit to 1 file
  db_data = json.loads(zipped.open('db.json').read())
  query.import_project(db(), authenticator.user_id(flask.session), req['record']['name'], db_data, zipped)
  return flask.jsonify(status="success")

# document sharing
@app.route("/share_p", methods=['POST'])
def share_p():
    '''
      generates a token that can be used to grant access to a project
    '''
    if not authenticator.is_auth(flask.session):
      return flask.jsonify(status="auth", message="User is not authenticated")

    # request fields: target, access, project_id, document_id
    req = json.loads(flask.request.form['request'])

    try:
      # create a token for the given document and email the recipient
      if req['record']['project_id'] is None:
        raise query.QueryException("Required parameter project_id not provided")

      result = query.add_token(db(), authenticator.user_id(flask.session), req['record']['project_id'], req['record']['access'], document_id=None)

      # send email
      if config.EMAIL:
        # not yet implemented
        msg = flask_mail.Message("Hello", sender="robot@supernifty.org", recipients=[req['record']['target']])
        mail.send(msg)

      return flask.jsonify(status="success", token=result)

    except query.QueryException as ex:
        return flask.jsonify(status="error", message=ex.message)

@app.route("/access/<token>/", methods=['GET'])
def access(token):
    '''
        use a token to accept access to a document
    '''
    if not authenticator.is_auth(flask.session):
        target = flask.url_for('access', token=token)
        login_target = flask.url_for('login', post=urllib.parse.quote_plus(target))
        return flask.redirect(login_target)

    try:
        # apply token and redirect
        result = query.apply_token(db(), authenticator.user_id(flask.session), token)
        if result[0]: # token has been applied
            return flask.redirect(flask.url_for('home'))
        else: # token was not applied
            flask.session["message"] = result[1]
            return flask.redirect(flask.url_for('home'))
    except query.QueryException as ex:
        flask.session["message"] = ex.message
        return flask.redirect(flask.url_for('home'))

# search
@app.route("/search", methods=['POST'])
def search():
    if not authenticator.is_auth(flask.session):
        return flask.jsonify(status="auth", message="User is not authenticated")

    project_id = flask.request.form['project_id']
    q = flask.request.form['q']
    if flask.request.form['project_id'] is None:
        raise query.QueryException("Required parameter project_id not provided")
    return flask.jsonify(status="success", q=q, documents=query.summary(query.search(db(), authenticator.user_id(flask.session), project_id, q)))

@app.route("/search_recent", methods=['POST'])
def search_recent():
    if not authenticator.is_auth(flask.session):
        return flask.jsonify(status="auth", message="User is not authenticated")

    project_id = flask.request.form['project_id']
    if flask.request.form['project_id'] is None:
        raise query.QueryException("Required parameter project_id not provided")
    return flask.jsonify(status="success", q='Recently Updated', documents=query.summary(query.search_recent(db(), authenticator.user_id(flask.session), project_id)))

@app.route("/search_rated", methods=['POST'])
def search_rated():
    if not authenticator.is_auth(flask.session):
        return flask.jsonify(status="auth", message="User is not authenticated")

    project_id = flask.request.form['project_id']
    if flask.request.form['project_id'] is None:
        raise query.QueryException("Required parameter project_id not provided")
    return flask.jsonify(status="success", q='Top Rated', documents=query.summary(query.search_rated(db(), authenticator.user_id(flask.session), project_id)))

@app.route("/render/latex", methods=['POST'])
def render():
    if not authenticator.is_auth(flask.session):
        return flask.jsonify(status="auth", message="User is not authenticated")

    content = flask.request.form['content']
    
    # convert latex to html TODO queue?
    try:
        user_id = authenticator.user_id(flask.session)
        # ensure existence of user specific asset dir
        root = os.path.abspath(os.path.join(config.ASSETS, user_id))
        if not os.path.exists(root):
            os.makedirs(root)
        # write tex
        open('{root}/_fragment.tex'.format(root=root, user_id=user_id), 'w').write(content)
        command = '{command} 1>"{root}/_fragment.out" 2>"{root}/_fragment.err"'.format(root=root, command=config.PANDOC.format(root=root, user_id=user_id))
        return_code = os.system('{command} 1>"{root}/_fragment.out" 2>"{root}/_fragment.err"'.format(root=root, command=command))
        if return_code == 0:
          result = open('{root}/_fragment.html'.format(user_id=user_id, root=root), 'r').read()
        else:
          result = open('{root}/_fragment.err'.format(user_id=user_id, root=root), 'r').read().replace('\n', '<br/>')
        return flask.jsonify(content=result)
    except Exception as ex:
        return flask.jsonify(status="error", message=ex)
    finally:
        os.system('/bin/rm {root}/_fragment.*'.format(user_id=user_id, root=root))
 
### authentication logic ###
@app.route('/login', defaults={'post': None})
@app.route('/login/<post>/')
def login(post):
    return authenticator.authorize(flask.session, db(), post=post)

@app.route('/logout')
def logout():
    authenticator.logout(flask.session)
    return flask.redirect(flask.url_for('about'))

@app.route('/about')
def about():
    return flask.render_template('about.html')

# end up here after authentication
@app.route('/authorized')
def authorized():
    result = authenticator.authorized(flask.session, db())
    if result is None:
        if flask.session.get('next') is None:
            return flask.redirect(flask.url_for('home'))
        else:
            unquoted = urllib.parse.unquote_plus(flask.session.get('next'))
            if auth.is_safe_url(unquoted):
                return flask.redirect(unquoted)
            else:
                return result # TODO: error page
    else:
        return result # TODO: error page

@authenticator.google.tokengetter
def get_google_oauth_token():
    return authenticator.token(flask.session)


if __name__ == '__main__':
    app.run(port=app.config['PORT'])
