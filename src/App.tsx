import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Clipping {
  book_title: string;
  author: string;
  clipping_type: "Highlight" | "Note" | "Bookmark";
  page: number | null;
  position: string;
  date: string;
  date_display: string;
  content: string;
  paired_note?: string;
}

interface ParseResult {
  books: string[];
  clippings: Clipping[];
  file_path: string;
}

type SortMode = "date-desc" | "date-asc" | "page-asc" | "page-desc";

function App() {
  const [books, setBooks] = useState<string[]>([]);
  const [clippings, setClippings] = useState<Clipping[]>([]);
  const [filePath, setFilePath] = useState("");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Type filter & sort
  const [showHighlights, setShowHighlights] = useState(true);
  const [showNotes, setShowNotes] = useState(true);
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");

  // Edit state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<"content" | "paired_note" | "new_note" | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const openFile = async () => {
    setIsLoading(true);
    try {
      const result = await invoke<ParseResult>("open_clippings_file");
      setBooks(result.books);
      setClippings(result.clippings);
      setFilePath(result.file_path);
      setSelectedBook(null);
      setDateFrom("");
      setDateTo("");
      setSearchText("");
    } catch (e) {
      if (e !== "Keine Datei ausgewählt") {
        alert(`Fehler: ${e}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Save all clippings back to the original file
  const saveToFile = useCallback(
    async (updatedClippings: Clipping[]) => {
      if (!filePath) return;
      setSaving(true);
      try {
        await invoke("save_clippings_file", {
          filePath,
          clippings: updatedClippings,
        });
      } catch (e) {
        alert(`Speicherfehler: ${e}`);
      } finally {
        setSaving(false);
      }
    },
    [filePath]
  );

  // Recalculate book list from clippings
  const recalcBooks = (clips: Clipping[]) => {
    const bookSet = new Set(clips.map((c) => c.book_title));
    const sorted = Array.from(bookSet).sort();
    setBooks(sorted);
  };

  // Find the actual index in the full clippings array for a filtered item
  const findClippingIndex = (filteredClipping: Clipping): number => {
    return clippings.findIndex(
      (c) =>
        c.book_title === filteredClipping.book_title &&
        c.position === filteredClipping.position &&
        c.date === filteredClipping.date &&
        c.clipping_type === filteredClipping.clipping_type &&
        c.content === filteredClipping.content
    );
  };

  // --- CRUD Operations ---

  const startEdit = (clipping: Clipping, field: "content" | "paired_note") => {
    const idx = findClippingIndex(clipping);
    if (idx === -1) return;
    setEditingIndex(idx);
    setEditingField(field);
    setEditText(field === "paired_note" ? (clipping.paired_note ?? "") : clipping.content);
  };

  const startAddNote = (clipping: Clipping) => {
    const idx = findClippingIndex(clipping);
    if (idx === -1) return;
    setEditingIndex(idx);
    setEditingField("new_note");
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingField(null);
    setEditText("");
  };

  const saveEdit = async () => {
    if (editingIndex === null || editingField === null) return;
    const updated = [...clippings];
    const c = { ...updated[editingIndex] };

    if (editingField === "content") {
      c.content = editText;
    } else if (editingField === "paired_note") {
      c.paired_note = editText || undefined;
    } else if (editingField === "new_note") {
      c.paired_note = editText;
    }

    updated[editingIndex] = c;
    setClippings(updated);
    cancelEdit();
    await saveToFile(updated);
  };

  const confirmDelete = (clipping: Clipping) => {
    const idx = findClippingIndex(clipping);
    if (idx === -1) return;
    setDeleteConfirmIndex(idx);
  };

  const executeDelete = async () => {
    if (deleteConfirmIndex === null) return;
    const updated = clippings.filter((_, i) => i !== deleteConfirmIndex);
    setClippings(updated);
    recalcBooks(updated);
    setDeleteConfirmIndex(null);
    await saveToFile(updated);
  };

  const deletePairedNote = async (clipping: Clipping) => {
    const idx = findClippingIndex(clipping);
    if (idx === -1) return;
    const updated = [...clippings];
    updated[idx] = { ...updated[idx], paired_note: undefined };
    setClippings(updated);
    await saveToFile(updated);
  };

  // --- Filtering & sorting ---

  const filtered = useMemo(() => {
    let result = clippings.filter((c) => {
      if (selectedBook && c.book_title !== selectedBook) return false;
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo + "T23:59:59") return false;
      if (c.clipping_type === "Highlight" && !showHighlights) return false;
      if (c.clipping_type === "Note" && !showNotes) return false;
      if (c.clipping_type === "Bookmark" && !showBookmarks) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (
          !c.content.toLowerCase().includes(q) &&
          !c.book_title.toLowerCase().includes(q) &&
          !(c.paired_note ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });

    result.sort((a, b) => {
      switch (sortMode) {
        case "date-asc":
          return a.date.localeCompare(b.date);
        case "date-desc":
          return b.date.localeCompare(a.date);
        case "page-asc":
          return (a.page ?? 0) - (b.page ?? 0);
        case "page-desc":
          return (b.page ?? 0) - (a.page ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [clippings, selectedBook, dateFrom, dateTo, searchText, showHighlights, showNotes, showBookmarks, sortMode]);

  const bookCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of clippings) {
      counts[c.book_title] = (counts[c.book_title] || 0) + 1;
    }
    return counts;
  }, [clippings]);

  const typeCounts = useMemo(() => {
    const base = clippings.filter((c) => {
      if (selectedBook && c.book_title !== selectedBook) return false;
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo + "T23:59:59") return false;
      return true;
    });
    return {
      highlights: base.filter((c) => c.clipping_type === "Highlight").length,
      notes: base.filter((c) => c.clipping_type === "Note").length,
      bookmarks: base.filter((c) => c.clipping_type === "Bookmark").length,
    };
  }, [clippings, selectedBook, dateFrom, dateTo]);

  const exportClippings = async (format: string) => {
    try {
      const path = await invoke<string>("export_clippings", {
        clippings: filtered,
        format,
      });
      alert(`Exportiert nach: ${path}`);
    } catch (e) {
      if (e !== "Kein Speicherort ausgewählt") {
        alert(`Fehler: ${e}`);
      }
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "Highlight": return "highlight-icon";
      case "Note": return "note-icon";
      case "Bookmark": return "bookmark-icon";
      default: return "";
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "Highlight": return "Markierung";
      case "Note": return "Notiz";
      case "Bookmark": return "Lesezeichen";
      default: return type;
    }
  };

  // Check if a given clipping is currently being edited
  const isEditing = (clipping: Clipping, field: "content" | "paired_note" | "new_note") => {
    if (editingIndex === null || editingField !== field) return false;
    const idx = findClippingIndex(clipping);
    return idx === editingIndex;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Kindle Clippings Parser</h1>
          {saving && <span className="save-indicator">Speichert...</span>}
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openFile} disabled={isLoading}>
            {isLoading ? "Laden..." : "Datei öffnen"}
          </button>
          {filtered.length > 0 && (
            <div className="export-group">
              <button className="btn btn-secondary" onClick={() => exportClippings("txt")}>
                Export .txt
              </button>
              <button className="btn btn-secondary" onClick={() => exportClippings("md")}>
                Export .md
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Delete confirmation overlay */}
      {deleteConfirmIndex !== null && (
        <div className="overlay" onClick={() => setDeleteConfirmIndex(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Diesen Eintrag wirklich löschen?</p>
            <p className="confirm-detail">
              {clippings[deleteConfirmIndex]?.content
                ? `"${clippings[deleteConfirmIndex].content.substring(0, 80)}${clippings[deleteConfirmIndex].content.length > 80 ? "..." : ""}"`
                : typeLabel(clippings[deleteConfirmIndex]?.clipping_type ?? "")}
            </p>
            <div className="confirm-actions">
              <button className="btn btn-danger" onClick={executeDelete}>
                Löschen
              </button>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirmIndex(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {clippings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#128214;</div>
          <h2>Willkommen!</h2>
          <p>
            Öffne deine Kindle "My Clippings.txt" Datei, um deine Markierungen
            und Notizen zu durchsuchen.
          </p>
          <button className="btn btn-primary btn-large" onClick={openFile}>
            Datei öffnen
          </button>
        </div>
      ) : (
        <div className="content">
          <aside className="sidebar">
            <div className="filter-section">
              <h3>Textsuche</h3>
              <input
                type="text"
                placeholder="Suche in Inhalten..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="filter-input"
              />
            </div>

            <div className="filter-section">
              <h3>Typ</h3>
              <div className="type-filters">
                <button
                  className={`type-toggle highlight ${showHighlights ? "active" : ""}`}
                  onClick={() => setShowHighlights(!showHighlights)}
                >
                  Markierungen
                  <span className="type-badge">{typeCounts.highlights}</span>
                </button>
                <button
                  className={`type-toggle note ${showNotes ? "active" : ""}`}
                  onClick={() => setShowNotes(!showNotes)}
                >
                  Notizen
                  <span className="type-badge">{typeCounts.notes}</span>
                </button>
                <button
                  className={`type-toggle bookmark ${showBookmarks ? "active" : ""}`}
                  onClick={() => setShowBookmarks(!showBookmarks)}
                >
                  Lesezeichen
                  <span className="type-badge">{typeCounts.bookmarks}</span>
                </button>
              </div>
            </div>

            <div className="filter-section">
              <h3>Sortierung</h3>
              <select
                className="filter-input"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="date-desc">Datum (neueste zuerst)</option>
                <option value="date-asc">Datum (älteste zuerst)</option>
                <option value="page-asc">Seite (aufsteigend)</option>
                <option value="page-desc">Seite (absteigend)</option>
              </select>
            </div>

            <div className="filter-section">
              <h3>Zeitraum</h3>
              <label>
                Von
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="filter-input"
                />
              </label>
              <label>
                Bis
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="filter-input"
                />
              </label>
            </div>

            <div className="filter-section">
              <h3>
                Bücher
                <span className="book-count-total">({books.length})</span>
              </h3>
              <button
                className={`book-item ${selectedBook === null ? "active" : ""}`}
                onClick={() => setSelectedBook(null)}
              >
                <span className="book-name">Alle Bücher</span>
                <span className="book-count">{clippings.length}</span>
              </button>
              {books.map((book) => (
                <button
                  key={book}
                  className={`book-item ${selectedBook === book ? "active" : ""}`}
                  onClick={() => setSelectedBook(selectedBook === book ? null : book)}
                >
                  <span className="book-name">{book}</span>
                  <span className="book-count">{bookCounts[book] || 0}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="main">
            <div className="results-header">
              <span>
                {filtered.length} Ergebnis{filtered.length !== 1 ? "se" : ""}
                {selectedBook && (
                  <>
                    {" "}in <strong>{selectedBook}</strong>
                  </>
                )}
              </span>
            </div>
            <div className="clippings-list">
              {filtered.length === 0 ? (
                <div className="no-results">
                  <p>Keine Ergebnisse für die aktiven Filter.</p>
                  <p className="no-results-hint">Passe die Filter in der Seitenleiste an.</p>
                </div>
              ) : (
                filtered.map((c, _i) => (
                  <div key={`${c.book_title}-${c.position}-${c.date}`} className={`clipping-card ${typeIcon(c.clipping_type)}`}>
                    <div className="clipping-meta">
                      <span className={`clipping-type ${c.clipping_type.toLowerCase()}`}>
                        {typeLabel(c.clipping_type)}
                      </span>
                      <span className="clipping-location">
                        Seite {c.page ?? "?"} | Pos. {c.position}
                      </span>
                      <span className="clipping-date">{c.date_display}</span>

                      {/* Action buttons */}
                      <div className="card-actions">
                        {(c.clipping_type === "Highlight" || c.clipping_type === "Note") && c.content && (
                          <button
                            className="action-btn edit-btn"
                            title="Bearbeiten"
                            onClick={() => startEdit(c, "content")}
                          >
                            &#9998;
                          </button>
                        )}
                        {c.clipping_type === "Highlight" && !c.paired_note && (
                          <button
                            className="action-btn add-note-btn"
                            title="Notiz hinzufügen"
                            onClick={() => startAddNote(c)}
                          >
                            +&#128221;
                          </button>
                        )}
                        <button
                          className="action-btn delete-btn"
                          title="Löschen"
                          onClick={() => confirmDelete(c)}
                        >
                          &#128465;
                        </button>
                      </div>
                    </div>

                    {!selectedBook && (
                      <div className="clipping-book">
                        {c.book_title} — <em>{c.author}</em>
                      </div>
                    )}

                    {/* Content: either edit mode or display */}
                    {c.content && (
                      isEditing(c, "content") ? (
                        <div className="edit-area">
                          <textarea
                            className="edit-textarea"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={4}
                            autoFocus
                          />
                          <div className="edit-actions">
                            <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                              Speichern
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`clipping-content ${c.clipping_type === "Note" ? "note-content" : ""}`}
                        >
                          {c.content}
                        </div>
                      )
                    )}

                    {/* Paired note */}
                    {c.paired_note && !isEditing(c, "paired_note") && (
                      <div className="paired-note">
                        <div className="paired-note-header">
                          <span className="paired-note-label">Notiz:</span>
                          <div className="paired-note-actions">
                            <button
                              className="action-btn edit-btn small"
                              title="Notiz bearbeiten"
                              onClick={() => startEdit(c, "paired_note")}
                            >
                              &#9998;
                            </button>
                            <button
                              className="action-btn delete-btn small"
                              title="Notiz löschen"
                              onClick={() => deletePairedNote(c)}
                            >
                              &#128465;
                            </button>
                          </div>
                        </div>
                        {c.paired_note}
                      </div>
                    )}

                    {isEditing(c, "paired_note") && (
                      <div className="edit-area paired-note-edit">
                        <span className="paired-note-label">Notiz bearbeiten:</span>
                        <textarea
                          className="edit-textarea"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                          autoFocus
                        />
                        <div className="edit-actions">
                          <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                            Speichern
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Add new note to a highlight */}
                    {isEditing(c, "new_note") && (
                      <div className="edit-area paired-note-edit">
                        <span className="paired-note-label">Neue Notiz:</span>
                        <textarea
                          className="edit-textarea"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                          placeholder="Notiz eingeben..."
                          autoFocus
                        />
                        <div className="edit-actions">
                          <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                            Speichern
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
