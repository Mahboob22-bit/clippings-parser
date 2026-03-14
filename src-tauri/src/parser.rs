use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ClippingType {
    Highlight,
    Note,
    Bookmark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Clipping {
    pub book_title: String,
    pub author: String,
    pub clipping_type: ClippingType,
    pub page: Option<u32>,
    pub position: String,
    pub date: String,       // ISO format for filtering
    pub date_display: String, // original German date for display
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paired_note: Option<String>, // Note content paired to a Highlight
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParseResult {
    pub books: Vec<String>,
    pub clippings: Vec<Clipping>,
}

pub fn parse_clippings(text: &str) -> ParseResult {
    let entries: Vec<&str> = text.split("==========").collect();
    let mut clippings: Vec<Clipping> = Vec::new();
    let mut seen: HashSet<(String, String, String)> = HashSet::new();

    let meta_re = Regex::new(
        r"- (?:Ihre|Ihr|Deine|Dein) (Markierung|Notiz|Lesezeichen) auf Seite (\d+) \| (?:bei )?Position (\S+) \| Hinzugefügt am (.+)"
    ).unwrap();

    for entry in &entries {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }

        let lines: Vec<&str> = entry.lines().collect();
        if lines.len() < 2 {
            continue;
        }

        let title_line = lines[0].trim();
        let meta_line = lines[1].trim();

        // Parse title and author
        let (book_title, author) = parse_title_author(title_line);

        // Parse metadata
        let Some(caps) = meta_re.captures(meta_line) else {
            continue;
        };

        let type_str = &caps[1];
        let clipping_type = match type_str {
            "Markierung" => ClippingType::Highlight,
            "Notiz" => ClippingType::Note,
            "Lesezeichen" => ClippingType::Bookmark,
            _ => continue,
        };

        let page: Option<u32> = caps[2].parse().ok();
        let position = caps[3].to_string();
        let date_raw = caps[4].trim().to_string();
        let date_iso = parse_german_date(&date_raw);

        // Content is everything after the empty line (line 3+)
        let content = if lines.len() > 3 {
            lines[3..].join("\n").trim().to_string()
        } else if lines.len() > 2 {
            lines[2].trim().to_string()
        } else {
            String::new()
        };

        // Deduplicate by book + position + content
        let dedup_key = (book_title.clone(), position.clone(), content.clone());
        if seen.contains(&dedup_key) {
            continue;
        }
        seen.insert(dedup_key);

        clippings.push(Clipping {
            book_title,
            author,
            clipping_type,
            page,
            position,
            date: date_iso,
            date_display: date_raw,
            content,
            paired_note: None,
        });
    }

    // Pair notes with highlights at the same position in the same book.
    // Kindle notes reference the end position of the highlighted range,
    // e.g. highlight at pos 861-863, note at pos 863.
    let mut paired_note_indices: HashSet<usize> = HashSet::new();

    // First pass: find note → highlight pairs
    for (ni, note) in clippings.iter().enumerate() {
        if note.clipping_type != ClippingType::Note {
            continue;
        }
        for (_hi, highlight) in clippings.iter().enumerate() {
            if highlight.clipping_type != ClippingType::Highlight
                || highlight.book_title != note.book_title
            {
                continue;
            }
            if position_end_matches(&highlight.position, &note.position) {
                paired_note_indices.insert(ni);
                break;
            }
        }
    }

    // Second pass: attach note content to the matching highlight
    let paired_notes: Vec<(String, String, String)> = paired_note_indices
        .iter()
        .map(|&i| {
            let n = &clippings[i];
            (n.book_title.clone(), n.position.clone(), n.content.clone())
        })
        .collect();

    for (book, pos, content) in &paired_notes {
        if let Some(highlight) = clippings.iter_mut().find(|c| {
            c.clipping_type == ClippingType::Highlight
                && &c.book_title == book
                && position_end_matches(&c.position, pos)
        }) {
            highlight.paired_note = Some(content.clone());
        }
    }

    // Remove notes that were successfully paired (iterate in reverse to keep indices valid)
    let mut indices: Vec<usize> = paired_note_indices.into_iter().collect();
    indices.sort_unstable_by(|a, b| b.cmp(a));
    for i in indices {
        clippings.remove(i);
    }

    let mut books: Vec<String> = clippings
        .iter()
        .map(|c| c.book_title.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    books.sort();

    ParseResult { books, clippings }
}

fn parse_title_author(line: &str) -> (String, String) {
    // Format: "Book Title (Author Name)" or "Book Title (Publisher)"
    if let Some(paren_start) = line.rfind('(') {
        let title = line[..paren_start].trim().to_string();
        let author = line[paren_start + 1..]
            .trim_end_matches(')')
            .trim()
            .to_string();
        (title, author)
    } else {
        (line.to_string(), String::new())
    }
}

/// Check if a highlight's position range ends at the note's position.
/// e.g. highlight "861-863" matches note "863", or exact match "863" == "863".
fn position_end_matches(highlight_pos: &str, note_pos: &str) -> bool {
    let note_pos = note_pos.trim();
    let highlight_pos = highlight_pos.trim();

    // Exact match
    if highlight_pos == note_pos {
        return true;
    }

    // Range match: "861-863" ends with "863"
    if let Some((_start, end)) = highlight_pos.split_once('-') {
        return end.trim() == note_pos;
    }

    false
}

fn parse_german_date(raw: &str) -> String {
    // Input: "Freitag, 30. Dezember 2022 07:53:25"
    // Output: "2022-12-30T07:53:25"
    let months = [
        ("Januar", "01"), ("Februar", "02"), ("März", "03"), ("April", "04"),
        ("Mai", "05"), ("Juni", "06"), ("Juli", "07"), ("August", "08"),
        ("September", "09"), ("Oktober", "10"), ("November", "11"), ("Dezember", "12"),
    ];

    let date_re = Regex::new(r"(\d{1,2})\.\s+(\w+)\s+(\d{4})\s+(\d{2}:\d{2}:\d{2})").unwrap();

    if let Some(caps) = date_re.captures(raw) {
        let day: u32 = caps[1].parse().unwrap_or(1);
        let month_name = &caps[2];
        let year = &caps[3];
        let time = &caps[4];

        let month = months
            .iter()
            .find(|(name, _)| *name == month_name)
            .map(|(_, num)| *num)
            .unwrap_or("01");

        format!("{}-{}-{:02}T{}", year, month, day, time)
    } else {
        raw.to_string()
    }
}

pub fn export_as_text(clippings: &[Clipping]) -> String {
    let mut output = String::new();
    for c in clippings {
        output.push_str(&format!("{} ({})\n", c.book_title, c.author));
        let type_str = match c.clipping_type {
            ClippingType::Highlight => "Markierung",
            ClippingType::Note => "Notiz",
            ClippingType::Bookmark => "Lesezeichen",
        };
        output.push_str(&format!(
            "- {} | Seite {} | Position {} | {}\n",
            type_str,
            c.page.map(|p| p.to_string()).unwrap_or_default(),
            c.position,
            c.date_display
        ));
        if !c.content.is_empty() {
            output.push_str(&c.content);
            output.push('\n');
        }
        output.push_str("==========\n");
    }
    output
}

pub fn export_as_markdown(clippings: &[Clipping]) -> String {
    let mut output = String::new();

    // Group by book
    let mut books: Vec<String> = clippings
        .iter()
        .map(|c| c.book_title.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    books.sort();

    for book in &books {
        let book_clippings: Vec<&Clipping> = clippings
            .iter()
            .filter(|c| &c.book_title == book)
            .collect();

        if book_clippings.is_empty() {
            continue;
        }

        let author = &book_clippings[0].author;
        output.push_str(&format!("# {} ({})\n\n", book, author));

        for c in &book_clippings {
            let (icon, type_str) = match c.clipping_type {
                ClippingType::Highlight => (">>", "Markierung"),
                ClippingType::Note => ("**", "Notiz"),
                ClippingType::Bookmark => ("--", "Lesezeichen"),
            };

            output.push_str(&format!(
                "### {} {} - Seite {}, Position {}\n",
                icon,
                type_str,
                c.page.map(|p| p.to_string()).unwrap_or_default(),
                c.position
            ));
            output.push_str(&format!("*{}*\n\n", c.date_display));

            if !c.content.is_empty() {
                match c.clipping_type {
                    ClippingType::Highlight => {
                        output.push_str(&format!("> {}\n\n", c.content));
                    }
                    ClippingType::Note => {
                        output.push_str(&format!("{}\n\n", c.content));
                    }
                    _ => {}
                }
            }
        }
        output.push_str("---\n\n");
    }
    output
}
