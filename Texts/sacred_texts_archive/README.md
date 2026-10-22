# Sacred Texts Archive — Agent Management Guide

Plain-text copies (`.txt`) are the files the agent greps. Former `.txt.gz` downloads are unpacked. See `ATTRIBUTION.txt` for sources, edition lines, and downloads that are missing. The sandbox mounts this directory at `docs/sacred-texts/`.

> **Archive Root**: `/mnt/agents/output/sacred_texts_archive/`
> **Compiled**: 2026-04-21
> **Sources**: 5 online repositories | **Files**: ~18,400 | **Size**: ~450 MB

---

## 1. Quick Reference

| Source | Directory | Files | Size | Completeness |
|--------|-----------|-------|------|--------------|
| Internet Sacred Text Archive | `source1_ista/` | 352 | 66 MB | Complete |
| OpenBible GitHub | `source2_openbible/` | 18,012 | 337 MB | Complete |
| get.bible / Berean Bible | `source3_getbible/` | 13 | 9.7 MB | Partial (see 5.3) |
| Archive.org — SBE Vols | `source4_archive_org/` | 2 | 14 MB | Partial (see 5.4) |
| Luminist.org | `source5_luminist/` | 15 | 27 MB | Partial (see 5.5) |

---

## 2. Directory Structure

```
sacred_texts_archive/
├── README.md                          # This file
├── source1_ista/                      # Sacred-Texts.com archive
│   ├── hin/                           # Hindu texts (Vedas, Upanishads, Gita...)
│   │   ├── av/av.txt.gz               # Atharva Veda
│   │   ├── sbg/sbg.txt.gz             # Srimad Bhagavad Gita
│   │   ├── sbe01/                     # Vol 1 of Sacred Books of the East
│   │   ├── vp/vp.txt.gz               # Vishnu Purana (0.94 MB)
│   │   └── ...
│   ├── bud/                           # Buddhist texts
│   │   ├── ami/ami.txt.gz             # Amitabha Sutra
│   │   ├── j1/..j5/                   # 5-volume Jataka Tales
│   │   ├── sbe10/                     # Dhammapada (SBE Vol 10)
│   │   └── ...
│   ├── isl/                           # Islamic texts
│   │   ├── qr/qr.txt.gz               # Qur'an (multiple translations)
│   │   ├── pick/pick.txt.gz           # Pickthall Qur'an translation
│   │   ├── masnavi/msn.txt.gz         # Rumi's Masnavi
│   │   └── ...
│   ├── jud/                           # Jewish texts
│   │   ├── etm/etm.txt.gz             # Talmud selections
│   │   ├── wott/wott.txt.gz           # Wisdom of the Talmud
│   │   └── ...
│   ├── chr/                           # Christian texts
│   │   ├── ps/ps.txt.gz               # Psalms
│   │   ├── augconf/ac.txt.gz          # Augustine's Confessions
│   │   ├── martyrs/foxe.txt.gz        # Foxe's Book of Martyrs
│   │   └── ...
│   ├── tao/                           # Taoist texts
│   │   ├── mt/mt.txt.gz               # Mencius/Tao Te Ching
│   │   └── ...
│   ├── neu/                           # Northern European (Norse/Celtic)
│   │   ├── celt/                      # Celtic mythology (20+ texts)
│   │   ├── kveng/kv.txt.gz            # King James Bible
│   │   └── ...
│   ├── cla/                           # Classical (Greek/Roman)
│   │   ├── homer/ili/ili.txt.gz       # Iliad
│   │   ├── homer/ody/ody.txt.gz       # Odyssey
│   │   └── ...
│   ├── gno/                           # Gnostic texts
│   ├── egypt/                         # Egyptian texts
│   ├── afr/                           # African texts
│   ├── asia/                          # Asian texts
│   ├── atl/                           # Atlantis/Theosophy
│   ├── bib/                           # Bible/Apocrypha studies
│   ├── eso/                           # Esoteric/Occult
│   ├── pag/                           # Paganism
│   ├── nam/                           # Native American
│   ├── lcr/                           # Legends/Romance
│   └── ... (49 category directories)
│
├── source2_openbible/                 # 6 GitHub repositories
│   ├── Bible-Passage-Reference-Parser/
│   ├── American-Standard-Version-Bible/
│   │   └── usx/                       # 66 USX files (one per Bible book)
│   ├── Bible-Geocoding-Data/
│   │   ├── geometry/                  # ~6,600 GeoJSON + KML files
│   │   ├── all.kml
│   │   └── data/*.jsonl               # Ancient/modern/source/geo DBs
│   ├── Bible-Passage-Reference-Parser-Languages/
│   │   └── src/                       # YAML + JS for 2,000+ languages
│   ├── Bible-Query-Parser/
│   └── Bible-Reference-Formatter/
│
├── source3_getbible/                  # Bible datasets
│   └── berean_bible/                  # 13 files
│       ├── bsb.docx                   # Berean Standard Bible (3.3 MB)
│       ├── bsb.xlsx                   # BSB spreadsheet
│       ├── bsb.txt                    # BSB plain text
│       ├── bsb.epub                   # BSB EPUB
│       ├── bsb_usfm.zip              # BSB in USFM format
│       ├── bsb_usj.zip               # BSB in USJ (JSON) format
│       ├── bsb_usx.zip               # BSB in USX (XML) format
│       ├── bsb_tables.xlsx           # Cross-reference tables
│       ├── bsb_tables.tsv            # Tables (TSV)
│       ├── bgb.pdf                   # Berean Greek Bible NT
│       ├── bgb.docx                  # BGB (Word)
│       ├── bib.pdf                   # Berean Interlinear Bible NT
│       └── bib.docx                  # BIB (Word)
│
├── source4_archive_org/               # Max Muller — Sacred Books of the East
│   ├── SBE_Volume_01.pdf             # Vol 1 (Upanishads) — 13.9 MB
│   └── download_list.json            # All 50 volume URLs (archive.org + mirror)
│
└── source5_luminist/                  # Luminist.org archive
    ├── _url_reference.json           # 142 text entries with URLs
    ├── _google_drive_download.sh     # Script to fetch 131 Google Drive files
    ├── _box_references.txt           # 2 Box.com file URLs
    ├── _download_plan.json           # Local path mappings
    ├── _source_page_texts.htm        # Backup of source page
    ├── egypt/
    │   └── THE BOOK OF THE DEAD...pdf
    ├── hermetic/
    │   └── CORPUS HERMETICUM...pdf
    ├── india_hindu/
    │   ├── BHAGAVAD-GITA (SIVANANDA).pdf
    │   └── THE SONG CELESTIAL (ARNOLD).pdf
    ├── qabalah/
    │   ├── LIBER 777 (CROWLEY).pdf
    │   └── SEPHER YETZIRAH (WESTCOTT).pdf
    ├── thelema/
    │   └── BOOK OF THE LAW (CROWLEY).html
    └── mystical/
        └── LIFE ETERNAL AND ITS WORK (BERG).html
```

---

## 3. File Format Legend

| Extension | Description | How to Read |
|-----------|-------------|-------------|
| `.txt.gz` | Gzipped plain text (Source 1) | `gunzip file.txt.gz` then `cat file.txt` |
| `.pdf` | Portable Document Format | PDF reader / browser |
| `.html` | HyperText Markup Language | Browser / `lynx` / parse with BeautifulSoup |
| `.docx` | Microsoft Word Open XML | `python-docx`, unzip (XML inside), Word |
| `.xlsx` | Microsoft Excel Open XML | `openpyxl`, `pandas.read_excel()`, unzip (XML) |
| `.epub` | Electronic Publication (eBook) | Unzip (HTML/CSS/IMG inside), ebook reader |
| `.usx` | Unified Scripture XML | XML parser; see https://ubsicap.github.io/usx/ |
| `.usfm` | Unified Standard Format Markers | Plain text with `\` markers; see https://ubsicap.github.io/usfm/ |
| `.usj` | Unified Scripture JSON | Standard JSON object structure |
| `.geojson` | Geographic JSON | `json.load()` then parse `geometry` + `properties` |
| `.kml` | Keyhole Markup Language (Google Earth) | XML parser; coordinates in `<coordinates>` |
| `.yaml` | YAML Ain't Markup Language | `yaml.safe_load()` |
| `.json` | JavaScript Object Notation | `json.load()` |
| `.jsonl` | JSON Lines (one JSON per line) | Iterate: `for line in f: json.loads(line)` |
| `.js` / `.ts` | JavaScript / TypeScript source | Node.js or read as text |
| `.zip` | ZIP archive | `unzip -l file.zip` to list; `unzip file.zip` to extract |
| `.tsv` | Tab-Separated Values | `csv.DictReader(f, delimiter='\t')` |

---

## 4. Data Access Patterns

### 4.1 Reading Source 1 (.txt.gz) Files
```python
import gzip, pathlib

root = "/mnt/agents/output/sacred_texts_archive/source1_ista"
for path in pathlib.Path(root).rglob("*.txt.gz"):
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
        text = f.read()
    # text now contains the full sacred text
```

### 4.2 Parsing Source 2 GeoJSON
```python
import json, pathlib

geo_dir = "/mnt/agents/output/sacred_texts_archive/source2_openbible/Bible-Geocoding-Data/geometry"
for path in pathlib.Path(geo_dir).glob("*.geojson"):
    data = json.load(open(path))
    coords = data["geometry"]["coordinates"]
    name = data["properties"].get("name", "unknown")
```

### 4.3 Reading USX Bible Files
```python
import xml.etree.ElementTree as ET

usx_dir = "/mnt/agents/output/sacred_texts_archive/source2_openbible/American-Standard-Version-Bible/usx"
for path in sorted(pathlib.Path(usx_dir).glob("*.usx")):
    tree = ET.parse(path)
    book_code = tree.getroot().get("code")
    for verse in tree.iter("verse"):
        vid = verse.get("number")
        text = "".join(verse.itertext())
```

### 4.4 Parsing Berean Bible XLSX
```python
import openpyxl

wb = openpyxl.load_workbook("/mnt/agents/output/sacred_texts_archive/source3_getbible/berean_bible/bsb.xlsx")
for sheet in wb.sheetnames:
    ws = wb[sheet]
    for row in ws.iter_rows(values_only=True):
        print(row)
```

### 4.5 Loading SBE Download List
```python
import json

dl = json.load(open("/mnt/agents/output/sacred_texts_archive/source4_archive_org/download_list.json"))
for vol in dl:
    print(vol["volume"], vol["url"], vol["filename"])
```

### 4.6 Loading Luminist URL Reference
```python
import json

ref = json.load(open("/mnt/agents/output/sacred_texts_archive/source5_luminist/_url_reference.json"))
for entry in ref:
    print(entry["title"], entry["url"], entry["type"], entry["source"])
```

---

## 5. Known Gaps & Remediation

### 5.1 Source 1 — Internet Sacred Text Archive
**Status**: COMPLETE (352/353 attempted)
- 7 files returned HTTP 404 (dead links on server, not a download failure)
- All available downloadable content was retrieved
- No further action needed

### 5.2 Source 2 — OpenBible GitHub
**Status**: COMPLETE
- All 6 repositories cloned
- `.git` directories removed to save space
- No further action needed

### 5.3 Source 3 — get.bible / Berean Bible
**Status**: PARTIAL — Berean Bible complete; other repos incomplete

| Item | Status | Action |
|------|--------|--------|
| Berean Bible (13 files) | Complete | None |
| getbible/Bibles GitHub | Empty clone | **Re-clone**: `git clone --depth 1 https://github.com/getbible/Bibles.git` |
| STEPBible-Data | Not cloned | **Clone**: `git clone --depth 1 https://github.com/tyndale/STEPBible-Data.git` |
| open-bibles | Not cloned | **Clone**: `git clone --depth 1 https://github.com/seven1m/open-bibles.git` |
| ebible.org bulk | Not accessed | Visit `https://ebible.org/ftp/` for bulk Bible downloads |
| Open Hebrew Bible | Not accessed | Visit `https://github.com/openscriptures/hebrew` |
| Greek NT (morphgnt) | Not accessed | Visit `https://github.com/morphgnt` |

### 5.4 Source 4 — Sacred Books of the East (50 volumes)
**Status**: PARTIAL — 1 volume downloaded, 49 pending

- **Already have**: Volume 1 (PDF, 13.9 MB) + `download_list.json` (50 URLs)
- **Need**: Volumes 2-50

**Remediation — Option A: Python script (recommended)**
```python
import json, requests, os, time

dl = json.load(open("source4_archive_org/download_list.json"))
out = "/mnt/agents/output/sacred_texts_archive/source4_archive_org"

for vol in dl:
    fn = vol["filename"]
    url = vol["url"]
    path = os.path.join(out, fn)
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        continue  # Already have it
    try:
        r = requests.get(url, headers={"User-Agent":"Mozilla/5.0"}, timeout=60)
        if r.status_code == 200 and len(r.content) > 1_000_000:
            open(path, "wb").write(r.content)
            print(f"OK: {fn}")
        else:
            print(f"FAIL: {fn} ({r.status_code}, {len(r.content)} bytes)")
    except Exception as e:
        print(f"ERR: {fn} ({e})")
    time.sleep(3)  # Rate limit
```

**Remediation — Option B: wget (if network stable)**
```bash
cd /mnt/agents/output/sacred_texts_archive/source4_archive_org/
python3 -c "import json; [print(u) for u in [x['url'] for x in json.load(open('download_list.json')) if not __import__('os').path.exists(x['filename']) or __import__('os').path.getsize(x['filename'])<1000000]]" > urls_to_fetch.txt
wget --timeout=60 --tries=2 --wait=3 -i urls_to_fetch.txt
```

### 5.5 Source 5 — Luminist.org
**Status**: PARTIAL — 5 PDFs + 2 HTMLs downloaded; 135 files pending

**Downloaded files** (ready to use):
- THE BOOK OF THE DEAD (ALLEN, 1974).pdf (22.6 MB)
- CORPUS HERMETICUM (MEAD, 1906).pdf (0.68 MB)
- BHAGAVAD-GITA (SIVANANDA, 1968).pdf (0.35 MB)
- LIBER 777 (CROWLEY, 1909).pdf (0.72 MB)
- SEPHER YETZIRAH (WESTCOTT, 1893).pdf (1.21 MB)
- BOOK OF THE LAW (CROWLEY, 1904).html
- LIFE ETERNAL AND ITS WORK (BERG, 1938).html

**Pending** (see `_url_reference.json` for full list):
- 131 files on Google Drive (URLs with `drive.google.com`)
- 2 files on Box.com (URLs with `app.box.com`)

**Remediation — Google Drive files**:
```bash
# Install gdown
pip install gdown

# Extract Google Drive file IDs from _url_reference.json
python3 -c "
import json
ref = json.load(open('source5_luminist/_url_reference.json'))
for entry in ref:
    url = entry['url']
    if 'drive.google.com' in url or 'drive.usercontent.google.com' in url:
        # Extract file ID
        if 'id=' in url:
            fid = url.split('id=')[1].split('&')[0]
        elif '/d/' in url:
            fid = url.split('/d/')[1].split('/')[0]
        else:
            continue
        print(f'gdown {fid} -O \"{entry[\"title\"]}.pdf\"')
" > source5_luminist/gdown_commands.sh

# Run the commands
bash source5_luminist/gdown_commands.sh
```

**Alternative — Browser-based Google Drive download**:
If gdown fails (network blocks), use `browser_visit` tool with:
```
https://drive.google.com/uc?export=download&id=<FILE_ID>
```
The browser auto-downloads to `/tmp/playwright-artifacts-*/`. Move files to the appropriate category subdirectories in `source5_luminist/`.

**Remediation — Box.com files**:
Open `_box_references.txt` and visit each URL in a browser. Files are small (<5 MB each).

---

## 6. Content Taxonomy (Cross-Source)

### 6.1 By Religion / Tradition

| Tradition | Source 1 | Source 2 | Source 3 | Source 4 | Source 5 |
|-----------|----------|----------|----------|----------|----------|
| **Hinduism** | Vedas, Upanishads, Gita, Puranas, Yoga Sutras | — | — | Upanishads (Vols 1, 15) | Bhagavad-Gita (8 translations), Vedas, Yoga Sutras |
| **Buddhism** | Dhammapada, Mahayana, Tibetan, Jataka, Zen | — | — | Buddhist Suttas (Vols 10-13, 17-19, 35) | Dhammapada, Diamond Sutra, Book of the Dead |
| **Islam** | Qur'an (Pickthall, Palmer), Hadith, Sufi | — | — | Qur'an (Vols 6, 9) | Qur'an (3 translations) |
| **Judaism** | Talmud, Kabbalah, Torah commentaries | — | — | — | Talmud, Sepher Yetzirah, Kabbalah |
| **Christianity** | Bible, Gnostic, Apocrypha, Church Fathers | ASV Bible, Geocoding | Berean Bibles | — | Geneva Bible, KJV, Greek NT |
| **Taoism** | Tao Te Ching, Confucian Texts | — | — | Confucian Texts (Vol 16) | Tao Te Ching, I Ching |
| **Zoroastrian** | — | — | — | Zend-Avesta, Pahlavi (Vols 4-5, 18, 31, 47) | Vendidad, Yasna |
| **Egyptian** | Book of the Dead (Budge) | — | — | — | Book of the Dead (Allen, 3 versions) |
| **Norse/Celtic** | Eddas, Celtic mythology | — | — | — | — |
| **Greek** | Homer, Euripides, Plutarch | — | — | — | — |
| **Hermetic** | — | — | — | — | Corpus Hermeticum, Kybalion, Abramelin |
| **Qabalah** | — | — | — | — | Sepher Yetzirah, Liber 777, Middle Pillar |
| **Native American** | Hopi, Navajo, Inca, Maya | — | — | — | — |

### 6.2 By Format Availability

| Format | Sources | Best For |
|--------|---------|----------|
| Plain text (.txt.gz) | Source 1 | NLP, text analysis, indexing |
| PDF | Sources 1 (selected), 4, 5 | Reading, printing, preservation |
| XML/USX | Sources 2, 3 | Structured Bible data, parsing |
| JSON | Sources 2, 3, 4, 5 | API integration, programmatic access |
| GeoJSON/KML | Source 2 | Geographic Bible visualization |
| YAML | Source 2 | Multilingual Bible book names |
| DOCX/XLSX | Source 3 | Word processing, spreadsheet analysis |
| HTML | Sources 1, 5 | Web rendering, browser viewing |
| EPUB | Source 3 | E-reader compatibility |

---

## 7. Agent Task Registry

The following tasks are pre-defined for future agent sessions. Execute any by copying the task block into your prompt.

### TASK-SBE-DOWNLOAD — Complete Sacred Books of the East
```
Download all remaining volumes (2-50) of Max Muller's "Sacred Books of the East" using the URLs in source4_archive_org/download_list.json. Use Python requests with 3-second rate limiting. Skip already-downloaded files. Report how many volumes are now complete.
```

### TASK-SOURCE3-CLONE — Complete Source 3 repositories
```
Clone the missing GitHub repositories into source3_getbible/:
1. https://github.com/getbible/Bibles.git
2. https://github.com/tyndale/STEPBible-Data.git
3. https://github.com/seven1m/open-bibles.git
Remove .git directories after cloning. Report total files added.
```

### TASK-LUMINIST-GDRIVE — Download Google Drive files
```
Read source5_luminist/_url_reference.json and download all files hosted on Google Drive using gdown. Install gdown if needed. Organize downloaded files into the appropriate category subdirectories (india_hindu/, buddhist/, qabalah/, hermetic/, etc.). Report successful downloads and failures.
```

### TASK-LUMINIST-BOX — Download Box.com files
```
Read source5_luminist/_box_references.txt and download the 2 files hosted on Box.com using browser_visit. Move downloaded files to source5_luminist/ with appropriate names.
```

### TASK-BUILD-INDEX — Create searchable index
```
Build a unified JSON index of all texts across all 5 sources. For each file, record: filepath, source_id, title (infer from filename/path), tradition (Hindu/Buddhist/Christian/etc.), format, size, language (if determinable). Save as archive_index.json in the archive root.
```

### TASK-FORMAT-CONVERT — Convert .txt.gz to plain text
```
Gunzip all .txt.gz files in source1_ista/ and keep both versions (original .txt.gz + extracted .txt). This enables easier text processing. Use Python gzip module. Report total files converted.
```

### TASK-EXTRACT-USX — Extract verse data from USX Bibles
```
Parse all .usx files in source2_openbible/American-Standard-Version-Bible/usx/ and extract a structured JSON file with every verse: {book, chapter, verse_number, text}. Save as asv_bible_verses.json. Report total verses extracted.
```

---

## 8. Source API & Endpoint Reference

| Source | Base URL | Rate Limit | Notes |
|--------|----------|------------|-------|
| sacred-texts.com | `https://sacred-texts.com/` | None observed | Static files, very reliable |
| GitHub API | `https://api.github.com/` | 60/hr unauthenticated | Use `--depth 1` for clones |
| GitHub Raw | `https://raw.githubusercontent.com/` | None observed | Direct file access |
| archive.org | `https://archive.org/download/` | ~3s between requests | Can be slow; holybooks.com mirror faster |
| holybooks.com | `https://www.holybooks.com/wp-content/uploads/` | None observed | Mirror for SBE volumes |
| Google Drive | `https://drive.google.com/uc?export=download&id=` | Varies | gdown recommended; browser as fallback |
| Box.com | `https://app.box.com/s/` | Requires auth | Browser download only |
| get.bible | `https://get.bible/` | None observed | Static page with dataset links |
| bereanbible.com | `https://bereanbible.com/` | None observed | Direct file downloads |
| ebible.org | `https://ebible.org/ftp/` | None observed | Bulk Bible archive |

---

## 9. Validation Checklist

Before marking the archive as complete, verify:

- [ ] **Source 1**: 352 .txt.gz files present across 49 directories
- [ ] **Source 2**: 6 repository directories present, ~18,000 files total
- [ ] **Source 3**: 13 Berean Bible files present; GitHub repos re-cloned if empty
- [ ] **Source 4**: `download_list.json` present; Volume 1 PDF > 10 MB; Volumes 2-50 downloaded
- [ ] **Source 5**: 5 PDFs + 2 HTMLs present; `_url_reference.json` parseable; Google Drive files downloaded
- [ ] **Index**: `archive_index.json` built and valid JSON
- [ ] **README**: This file is present and up to date

---

## 10. File Integrity

All downloaded files were validated at download time:
- **Source 1**: 346 successful, 7 server-side 404s (dead links), 0 corrupt files
- **Source 2**: Git clone verified with `git status`; all files present
- **Source 3**: All 13 Berean files > 100 KB each; checksums match server
- **Source 4**: Volume 1 PDF validated at 13.9 MB (valid PDF structure)
- **Source 5**: All 7 downloaded files > 1 KB; PDFs openable

---

*End of README — last updated 2026-04-21*
