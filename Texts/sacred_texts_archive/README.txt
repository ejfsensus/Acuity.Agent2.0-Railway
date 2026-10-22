=============================================================================
        SACRED TEXTS AND SCRIPTURES - COMPLETE ARCHIVE
        Compiled: 2026-04-21
        Sources: 5 major online repositories
=============================================================================

This archive contains publicly available sacred texts, scriptures, and
spiritual writings aggregated from five major online sources. All files
are preserved in their original, unprocessed formats.

=============================================================================
SOURCE 1: Internet Sacred Text Archive (sacred-texts.com)
=============================================================================
Directory: source1_ista/
Size: ~66 MB | Files: 352
URL: https://sacred-texts.com/download.htm

Content includes:
- Hindu texts: Vedas, Upanishads, Bhagavad Gita, Puranas, Yoga Sutras
- Buddhist texts: Dhammapada, Mahayana texts, Tibetan Buddhism, Zen
- Islamic texts: Qur'an (multiple translations), Hadith, Sufi texts
- Jewish texts: Talmud selections, Kabbalah, Torah commentaries
- Christian texts: Bible, Gnostic texts, apocrypha
- Other: Tao Te Ching, Confucian texts, Norse Eddas, Primal religions
- Classics: Homer (Iliad, Odyssey), Greek/Roman mythology
- Esoteric/occult texts, Masonic texts, Celtic mythology

Formats: HTML, plain text (.txt.gz), ZIP

=============================================================================
SOURCE 2: OpenBible GitHub Repositories
=============================================================================
Directory: source2_openbible/
Size: ~337 MB | Files: 18,012
URL: https://github.com/openbibleinfo/

Repositories included:
1. Bible-Passage-Reference-Parser (461 files, 57.8 MB)
   - JavaScript/TypeScript parser for Bible references (John 3:16 format)
2. American-Standard-Version-Bible (92 files, 8.1 MB)
   - Full ASV Bible (1901) in USX/XML format, 66 books
3. Bible-Geocoding-Data (6,661 files, 154.7 MB)
   - Geographic data for every place in the Bible (GeoJSON + KML)
4. Bible-Passage-Reference-Parser-Languages (10,804 files, 111 MB)
   - Bible book names in 2,000+ languages (YAML + JS)
5. Bible-Query-Parser (4 files, 0.02 MB)
6. Bible-Reference-Formatter (43 files, 0.57 MB)

Formats: USX (XML), GeoJSON, KML, YAML, JavaScript, JSON

=============================================================================
SOURCE 3: get.bible / Berean Bible / GitHub Bible Datasets
=============================================================================
Directory: source3_getbible/
Size: ~86 MB | Files: 494+
URL: https://get.bible/bible-data-sets/

Content includes:
- Berean Standard Bible (BSB): DOCX, XLSX, TXT, EPUB, USFM, USJ, USX
- Berean Greek Bible NT: PDF, DOCX
- Berean Interlinear Bible NT: PDF, DOCX
- getbible/Bibles GitHub repo: Bible texts in many languages
- Tyndale STEPBible-Data: TBESH, TBESG, TIPNR datasets
- open-bibles GitHub repo: Public domain Bibles in XML/USFM

Formats: DOCX, XLSX, TXT, EPUB, ZIP, PDF, XML, USFM, USJ, USX, TSV

=============================================================================
SOURCE 4: Internet Archive - Sacred Books of the East
=============================================================================
Directory: source4_archive_org/
Size: ~14 MB | Files: 2 (1 volume + reference)
URL: https://archive.org/details/sacredbooksofeas01unse

Content:
- Volume 1 of Max Muller's "Sacred Books of the East" (PDF)
- download_list.json: Complete list of all 50 volume URLs for future download

The complete collection covers:
- Upanishads, Dhammapada, Qur'an, Vedas
- Zend-Avesta, Buddhist Suttas, Pahlavi texts

Note: Due to network rate limiting, only Volume 1 was successfully
  downloaded. The download_list.json file contains all 50 direct
  download URLs (archive.org and holybooks.com mirrors) for
  completing the collection.

Format: PDF

=============================================================================
SOURCE 5: Luminist.org Sacred Texts Archive
=============================================================================
Directory: source5_luminist/
Size: ~27 MB | Files: 25 (downloads + reference files)
URL: http://www.luminist.org/archives/texts.htm

Content includes:
- THE BOOK OF THE DEAD (Allen, 1974) - PDF
- BHAGAVAD-GITA (Sivananda, 1968) - PDF
- CORPUS HERMETICUM (Mead, 1906) - PDF
- LIBER 777 (Crowley, 1909) - PDF
- SEPHER YETZIRAH (Westcott, 1893) - PDF
- THE SONG CELESTIAL (Arnold, 1893) - PDF
- BOOK OF THE LAW (Crowley, 1904) - HTML
- LIFE ETERNAL AND ITS WORK (Berg, 1938) - HTML
- Reference files for 142 discovered texts:
  * _url_reference.json - All 142 text URLs with categories
  * _google_drive_download.sh - Script to download 131 Google Drive files
  * _download_plan.json - Complete download plan with local paths
  * _source_page_texts.htm - Backup of source webpage

Note: Most Luminist files are hosted on Google Drive which was
  inaccessible from the download environment. Reference files are
  provided to complete downloads using gdown or browser tools.

Coverage discovered (142 texts across 12 categories):
- India/Hindu (68): Bhagavad-Gita (8 translations), Mahabharata, Ramayana,
  Upanishads, Yoga Sutras, Vedas, Bhagavatam
- Bible & Apocrypha (13): Geneva Bible, KJV, Greek NT, Talmud, Enoch
- Hermetic (13): Abramelin, Goetia, Corpus Hermeticum, Kybalion
- Buddhist (10): Dhammapada (5 translations), Diamond Sutra
- China (7): I Ching, Tao Te Ching, Confucian Texts
- Persia/Mesopotamia (7): Vendidad, Yasna, Chaldean Oracles
- Mystical (7): Aquarian Gospel, Urantia Book, Oahspe
- Egypt (6): Book of the Dead (3 versions)
- Qabalah (5): Sepher Yetzirah, Kabbalah, Middle Pillar
- Thelema (3): Book of the Law, Liber LXV
- Islamic (2): Quran (3 translations)
- Japan (1): Japanese Texts

Formats: PDF, HTML, JSON, SH (reference scripts)

=============================================================================
TOTAL ARCHIVE STATISTICS
=============================================================================
Total Size: ~530 MB
Total Files: ~18,900+
Sources: 5
Format Diversity: PDF, HTML, TXT, XML, USX, USFM, USJ, DOCX, XLSX,
                  EPUB, ZIP, GeoJSON, KML, YAML, JSON, JS, TS

=============================================================================
USAGE NOTES
=============================================================================
1. All files are in their ORIGINAL, UNPROCESSED formats as downloaded
   from the respective sources.

2. No content modification, schema transformation, or formatting has
   been applied.

3. For Source 4 (Sacred Books of the East), use the download_list.json
   file with wget or curl to download remaining volumes:
   
   Example:
   wget -i <(jq -r '.[].url' source4_archive_org/download_list.json)

4. For Source 5 (Luminist), install gdown and run:
   
   pip install gdown
   bash source5_luminist/_google_drive_download.sh

5. This archive is intended for research, educational, and personal
   study purposes. Please respect the copyright and licensing terms
   of individual texts.

6. All sources are FREE, publicly accessible resources.

=============================================================================
