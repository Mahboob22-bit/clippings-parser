import { useState, useMemo } from "react";
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
}

type SortMode = "date-desc" | "date-asc" | "page-asc" | "page-desc";

function App() {
  const [books, setBooks] = useState<string[]>([]);
  const [clippings, setClippings] = useState<Clipping[]>([]);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // New: type filter & sort
  const [showHighlights, setShowHighlights] = useState(true);
  const [showNotes, setShowNotes] = useState(true);
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");

  const openFile = async () => {
    setIsLoading(true);
    try {
      const result = await invoke<ParseResult>("open_clippings_file");
      setBooks(result.books);
      setClippings(result.clippings);
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

  const filtered = useMemo(() => {
    let result = clippings.filter((c) => {
      if (selectedBook && c.book_title !== selectedBook) return false;
      if (dateFrom && c.date < dateFrom) return false;
      if (dateTo && c.date > dateTo + "T23:59:59") return false;

      // Type filter
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

    // Sorting
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

  // Stats for the type filter badges
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
      case "Highlight":
        return "highlight-icon";
      case "Note":
        return "note-icon";
      case "Bookmark":
        return "bookmark-icon";
      default:
        return "";
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "Highlight":
        return "Markierung";
      case "Note":
        return "Notiz";
      case "Bookmark":
        return "Lesezeichen";
      default:
        return type;
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Kindle Clippings Parser</h1>
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

            {/* Type filter */}
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

            {/* Sort */}
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
                  onClick={() =>
                    setSelectedBook(selectedBook === book ? null : book)
                  }
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
                    {" "}
                    in <strong>{selectedBook}</strong>
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
                filtered.map((c, i) => (
                  <div key={i} className={`clipping-card ${typeIcon(c.clipping_type)}`}>
                    <div className="clipping-meta">
                      <span className={`clipping-type ${c.clipping_type.toLowerCase()}`}>
                        {typeLabel(c.clipping_type)}
                      </span>
                      <span className="clipping-location">
                        Seite {c.page ?? "?"} | Pos. {c.position}
                      </span>
                      <span className="clipping-date">{c.date_display}</span>
                    </div>
                    {!selectedBook && (
                      <div className="clipping-book">
                        {c.book_title} — <em>{c.author}</em>
                      </div>
                    )}
                    {c.content && (
                      <div
                        className={`clipping-content ${c.clipping_type === "Note" ? "note-content" : ""}`}
                      >
                        {c.content}
                      </div>
                    )}
                    {/* Paired note shown directly under the highlight */}
                    {c.paired_note && (
                      <div className="paired-note">
                        <span className="paired-note-label">Notiz:</span>
                        {c.paired_note}
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
