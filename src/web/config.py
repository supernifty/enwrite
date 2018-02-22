
SQLALCHEMY_DATABASE_URI="sqlite:///nifty.db"
PORT=5000

AUTHENTICATE=False
DEFAULT_USER='Local User'
ASSETS='~/assets'

#PANDOC="pandoc -o {root}/fragment.html {root}/fragment.tex --verbose"
PANDOC='docker run --rm --mount type=bind,source={root},target=/source jagregory/pandoc fragment.tex -o fragment.html --verbose'
