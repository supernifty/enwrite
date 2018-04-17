# NiftyWrite
Manage writing a large body of work such as a thesis or book

# Install
```
git clone https://github.com/supernifty/NiftyWrite
cd NiftyWrite/src/web
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

NiftyWrite requires (postgres)[https://www.postgresql.org].
To create the database:
```
createdb niftywrite
```

The Latex renderer is executed via a Docker container.
```
sudo apt install docker
```

# Running
```
python main.py
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
