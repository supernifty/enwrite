# Enwrite
Manage writing a large body of work such as a thesis or book

# Install
```
git clone https://github.com/supernifty/enwrite
cd enwrite/src/web
cp config.py.template config.py
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

enwrite requires [postgres](https://www.postgresql.org).
To create the database:
```
createdb enwrite
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
* Attachments
* Indexing, searching

# Roadmap
We hope to add the following:
* Collaboration
* Reference management
* Checkpointing, restore
* Notes

# Dependencies
* jquery
* purecss
* w2ui
* flask
* postgres
* docker

# Notes and tricks

* Images can be resized by adding e.g. &resize=0.5 to the attachment URL

## Add Bulk

Use markdown h1 headings as the documents to add, with directory structure to nominate a folder
