import types

import flask
import flask_oauthlib.client

import config
import query

def dummy(_):
    pass

class NoAuth (object):
    def __init__(self, app):
        self.google = types.SimpleNamespace(tokengetter=dummy)

    def is_auth(self, session):
        return 'user_id' in session

    def username(self, session):
        return config.DEFAULT_USER

    def user_id(self, session):
        return session['user_id']

    def authorize(self, session, db):
        session['google_email'] = config.DEFAULT_USER
        # find and add userid
        session['user_id'] = query.find_or_add_user(db, config.DEFAULT_USER).id

        return flask.redirect(flask.url_for("home"))

    def logout(self, session):
        session.clear()

class GoogleAuth (object):
    def __init__(self, app):
        self.oauth = flask_oauthlib.client.OAuth(app)
        self.google = self.oauth.remote_app(
            'google',
            consumer_key=config.GOOGLE_ID,
            consumer_secret=config.GOOGLE_SECRET,
            request_token_params={
                'scope': 'email'
            },
            base_url='https://www.googleapis.com/oauth2/v1/',
            request_token_url=None,
            access_token_method='POST',
            access_token_url='https://accounts.google.com/o/oauth2/token',
            authorize_url='https://accounts.google.com/o/oauth2/auth',
        )

    def is_auth(self, session):
        authed = 'google_token' in session 
        return authed

    def username(self, session):
        return session['google_email']

    def user_id(self, session):
        return session['user_id']

    def authorize(self, session, db):
        return self.google.authorize(callback=flask.url_for('authorized', _external=True))

    def logout(self, session):
        session.clear()

    def authorized(self, session, db):
        resp = self.google.authorized_response()
        if resp is None:
            return 'Access denied: reason=%s error=%s' % (
                request.args['error_reason'],
                request.args['error_description']
            )

        session['google_token'] = (resp['access_token'], '')
        me = self.google.get('userinfo')
        session['google_email'] = me.data['email']
        # find and add userid
        session['user_id'] = query.find_or_add_user(db, me.data['email']).id

        # none means OK
        return None 

    def token(self, session):
        return flask.session.get('google_token')