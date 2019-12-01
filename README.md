# Quick note searcher for vscode

You can quickly seach your markdown notes with words and tags, powered by ripgrep.

## Install

1. Install ripgrep (https://github.com/BurntSushi/ripgrep)
2. Install this extension to vscode as usual.

## Usage

1. Open arbitary folderes in vscode.
2. Open a command palette, and type ``Quick note search``.
3. Type seach words and/or ``#``-prefixed tags. (ex. ``#vscode debug``)

* When input multiple words, tags are treated as "OR" condition, while words are "AND" condition. And only files matched with tags AND matched with words are in result.
* Text contents of files and file names are searched with words.
* Search words are case-insensitive.
* Tag format is YAML-like, but only list format enclosed by ``[`` and ``]`` is allowed, and must be immediately after beginning of each file, as an example below:

```md
---
tags: [ programming, vscode ]
---

# How to debug extension

Bla bla bla...
```

<!-- A quick file searcher for vscode, with highly customizable configuration, powered by The Silver Seacher (ag) / ripgrep (rg) / grep / findstr -->
