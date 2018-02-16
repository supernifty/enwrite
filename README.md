# NiftyWrite
Manage writing a large body of work such as a thesis or book

# Install
```
git clone https://github.com/supernifty/NiftyWrite
cd NiftyWrite/src/web
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

If you wish to use a database such as Postgres:
```
pip install -U psycopg2
```

If you wish to use the Latex renderer, install Pandoc using your OS installer, for example:
```
sudo apt install pandoc
```

# Running
```
python3 main.py
```

# Roadmap
We hope to add the following:
* Collaboration
* Math formula
* Markdown and Latex support
* Reference management
* Checkpointing, restore
* Attachments, notes
* Indexing, searching

# Dependencies
* jquery
* purecss
* w2ui
* flask
* postgres
