#!/usr/bin/env python
'''
  main application defines available views
'''

import datetime
import flask
import json

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

if config.AUTHENTICATE:
    authenticator = auth.GoogleAuth(app)
else:
    authenticator = auth.NoAuth(app)

# database
_db_session = None

def db():
    global _db_session
    if _db_session is None: # first time
        engine = sqlalchemy.create_engine(app.config['SQLALCHEMY_DATABASE_URI'])
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
        return None # shouldn't happen

    try:
        if category == 'projects':
           return flask.jsonify(username=authenticator.username(flask.session), projects=query.json(query.projects(db(), authenticator.user_id(flask.session)).all())) 
        if category == 'documents':
           if flask.request.args.get('project_id') is None:
               raise query.QueryException("Required parameter project_id not provided")
           return flask.jsonify(username=authenticator.username(flask.session), documents=query.documents(db(), authenticator.user_id(flask.session), flask.request.args.get('project_id')))
        if category == 'document':
           if flask.request.args.get('project_id') is None:
               raise query.QueryException("Required parameter project_id not provided")
           if flask.request.args.get('document_id') is None:
               raise query.QueryException("Required parameter document_id not provided")
           return flask.jsonify(username=authenticator.username(flask.session), document=query.document(db(), authenticator.user_id(flask.session), flask.request.args.get('project_id'), flask.request.args.get('document_id')).serializable())
    except query.QueryException as ex:
        return flask.jsonify(status="error", message="Request failed: {}".format(ex.message))

# setters
@app.route("/set/<category>", methods=['POST'])
def set_data(category):
    if not authenticator.is_auth(flask.session):
        return None # shouldn't happen

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

    except query.QueryException as ex:
        return flask.jsonify(status="error", message=ex.message)

    return flask.jsonify(status="error", message="Unrecognized command {}".format(category))

### authentication logic ###
@app.route('/login')
def login():
    return authenticator.authorize(flask.session, db())

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
        return flask.redirect(flask.url_for('main'))
    else:
        return result # todo: error page

@authenticator.google.tokengetter
def get_google_oauth_token():
    return authenticator.token(flask.session)


if __name__ == '__main__':
    app.run(port=app.config['PORT'])
