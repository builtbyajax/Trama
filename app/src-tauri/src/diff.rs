//! Unified patches, numbered lines and bounded previews.
use serde::Serialize;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: String,
    pub old_number: Option<usize>,
    pub new_number: Option<usize>,
    pub text: String,
    pub missing_newline: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub old_start: usize,
    pub old_count: usize,
    pub new_start: usize,
    pub new_count: usize,
    pub section: String,
    pub lines: Vec<DiffLine>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub change: String,
    pub is_binary: bool,
    pub hunks: Vec<Hunk>,
    pub additions: usize,
    pub deletions: usize,
}
fn header_path(header: &str) -> String {
    if header.starts_with('"') {
        let mut escaped = false;
        for (i, c) in header.char_indices().skip(1) {
            if c == '"' && !escaped {
                let path = unquote(header[i + 1..].trim());
                return path.strip_prefix("b/").unwrap_or(&path).into();
            }
            if c == '\\' {
                escaped = !escaped;
            } else {
                escaped = false;
            }
        }
    }
    for (i, _) in header.match_indices(" b/") {
        if header.strip_prefix("a/").map(|s| &s[..i - 2]) == Some(&header[i + 3..]) {
            return header[i + 3..].into();
        }
    }
    header
        .rsplit_once(" b/")
        .map(|(_, p)| p.into())
        .unwrap_or_else(|| header.into())
}
fn file(path: String) -> FileDiff {
    FileDiff {
        path,
        old_path: None,
        change: "modified".into(),
        is_binary: false,
        hunks: vec![],
        additions: 0,
        deletions: 0,
    }
}
fn range(s: &str) -> (usize, usize) {
    let mut pieces = s[1..].split(',');
    (
        pieces.next().and_then(|p| p.parse().ok()).unwrap_or(0),
        pieces.next().and_then(|p| p.parse().ok()).unwrap_or(1),
    )
}
pub fn parse_diff(raw: &str) -> Vec<FileDiff> {
    let mut files = vec![];
    let mut current: Option<FileDiff> = None;
    let mut old = 0;
    let mut new = 0;
    let mut remaining_old: usize = 0;
    let mut remaining_new: usize = 0;
    for line in raw.split('\n') {
        if let Some(header) = line.strip_prefix("diff --git ") {
            if let Some(f) = current.take() {
                files.push(f);
            }
            let path = header_path(header);
            current = Some(file(path));
            remaining_old = 0;
            remaining_new = 0;
            continue;
        }
        let Some(f) = current.as_mut() else {
            continue;
        };
        if (remaining_old > 0 || remaining_new > 0) && line.starts_with(['+', '-', ' ']) {
            let marker = line.as_bytes()[0];
            let (kind, old_number, new_number) = match marker {
                b'+' => {
                    f.additions += 1;
                    let n = new;
                    new += 1;
                    remaining_new = remaining_new.saturating_sub(1);
                    ("addition", None, Some(n))
                }
                b'-' => {
                    f.deletions += 1;
                    let n = old;
                    old += 1;
                    remaining_old = remaining_old.saturating_sub(1);
                    ("deletion", Some(n), None)
                }
                _ => {
                    let o = old;
                    let n = new;
                    old += 1;
                    new += 1;
                    remaining_old = remaining_old.saturating_sub(1);
                    remaining_new = remaining_new.saturating_sub(1);
                    ("context", Some(o), Some(n))
                }
            };
            if let Some(h) = f.hunks.last_mut() {
                h.lines.push(DiffLine {
                    kind: kind.into(),
                    old_number,
                    new_number,
                    text: line[1..].into(),
                    missing_newline: false,
                });
            }
            continue;
        }
        if line.starts_with("\\ No newline") {
            if let Some(l) = f.hunks.last_mut().and_then(|h| h.lines.last_mut()) {
                l.missing_newline = true;
            }
            continue;
        }
        if line.starts_with("@@ ") {
            let parts: Vec<&str> = line.splitn(5, ' ').collect();
            if parts.len() >= 4 {
                let (o, oc) = range(parts[1]);
                let (n, nc) = range(parts[2]);
                old = o;
                new = n;
                remaining_old = oc;
                remaining_new = nc;
                f.hunks.push(Hunk {
                    old_start: o,
                    old_count: oc,
                    new_start: n,
                    new_count: nc,
                    section: parts.get(4).copied().unwrap_or("").into(),
                    lines: vec![],
                });
            }
        } else if line.starts_with("new file mode") {
            f.change = "added".into();
        } else if line.starts_with("deleted file mode") {
            f.change = "deleted".into();
        } else if let Some(p) = line.strip_prefix("rename from ") {
            f.change = "renamed".into();
            f.old_path = Some(unquote(p));
        } else if let Some(p) = line.strip_prefix("rename to ") {
            f.path = unquote(p);
        } else if line.starts_with("Binary files ") || line.starts_with("GIT binary patch") {
            f.is_binary = true;
        } else if let Some(p) = line.strip_prefix("+++ ") {
            if p != "/dev/null" {
                let p = unquote(p);
                f.path = p.strip_prefix("b/").unwrap_or(&p).into();
            }
        } else if let Some(p) = line.strip_prefix("--- ") {
            if p != "/dev/null" && f.change == "renamed" {
                let p = unquote(p);
                f.old_path = Some(p.strip_prefix("a/").unwrap_or(&p).into());
            }
        }
    }
    if let Some(f) = current {
        files.push(f);
    }
    files
}
pub fn unquote(s: &str) -> String {
    if !s.starts_with('"') || !s.ends_with('"') {
        return s.into();
    }
    let bytes = &s.as_bytes()[1..s.len() - 1];
    let mut out = vec![];
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'\\' || i + 1 == bytes.len() {
            out.push(bytes[i]);
            i += 1;
            continue;
        }
        i += 1;
        match bytes[i] {
            b'n' => out.push(b'\n'),
            b't' => out.push(b'\t'),
            b'r' => out.push(b'\r'),
            b'0'..=b'7' => {
                let mut n = 0u16;
                let mut count = 0;
                while i < bytes.len() && (b'0'..=b'7').contains(&bytes[i]) && count < 3 {
                    n = n * 8 + (bytes[i] - b'0') as u16;
                    i += 1;
                    count += 1;
                }
                out.push(n as u8);
                continue;
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into()
}
pub fn untracked_file(path: &str, data: Option<&[u8]>) -> FileDiff {
    let mut f = file(path.into());
    f.change = "untracked".into();
    let Some(data) = data else {
        f.is_binary = true;
        return f;
    };
    if data.contains(&0) {
        f.is_binary = true;
        return f;
    }
    let Ok(text) = std::str::from_utf8(data) else {
        f.is_binary = true;
        return f;
    };
    let lines: Vec<&str> = text.split_terminator('\n').collect();
    f.additions = lines.len();
    if !lines.is_empty() {
        f.hunks.push(Hunk {
            old_start: 0,
            old_count: 0,
            new_start: 1,
            new_count: lines.len(),
            section: String::new(),
            lines: lines
                .iter()
                .enumerate()
                .map(|(i, l)| DiffLine {
                    kind: "addition".into(),
                    old_number: None,
                    new_number: Some(i + 1),
                    text: l.to_string(),
                    missing_newline: i + 1 == lines.len() && !text.ends_with('\n'),
                })
                .collect(),
        });
    }
    f
}
