CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts
USING fts5(
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2',
  content = 'search_documents',
  content_rowid = 'id'
);

CREATE TRIGGER IF NOT EXISTS search_documents_ai AFTER INSERT ON search_documents BEGIN
  INSERT INTO search_documents_fts(rowid, title, body)
  VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS search_documents_ad AFTER DELETE ON search_documents BEGIN
  INSERT INTO search_documents_fts(search_documents_fts, rowid, title, body)
  VALUES('delete', old.id, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS search_documents_au AFTER UPDATE ON search_documents BEGIN
  INSERT INTO search_documents_fts(search_documents_fts, rowid, title, body)
  VALUES('delete', old.id, old.title, old.body);
  INSERT INTO search_documents_fts(rowid, title, body)
  VALUES (new.id, new.title, new.body);
END;
