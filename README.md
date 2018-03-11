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

The Latex renderer is executed via a Docker container.
```
sudo apt install docker
```

# Running
```
python3 main.py
```

# The following is implemented:
* Markdown and Latex support
* Math formula

# Roadmap
We hope to add the following:
* Collaboration
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
* docker
