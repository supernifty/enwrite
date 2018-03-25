
SQLALCHEMY_DATABASE_URI="postgresql:///niftywrite"
PORT=5000

AUTHENTICATE=False
DEFAULT_USER='Local User'
ASSETS='./assets'

PANDOC='docker run --rm --mount type=bind,source={root},target=/source jagregory/pandoc _fragment.tex -o _fragment.html --verbose'

MAX_ATTACHMENT_SIZE=10e6
MAX_FREE_USER_STORAGE=50e6
