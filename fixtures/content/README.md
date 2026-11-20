Sample document text for fixture builds (`SHEET_SOURCE=local`).

These files stand in for `content/`, which holds text extracted from the real
linked files by `tools/index-files.mjs`. They are invented placeholder prose,
keyed by the fake Drive ids in `fixtures/Files.csv`, and exist so CI exercises
the document index end to end: passage cutting, page numbers, and the rule
that a page repeated in a compilation stays with the stand-alone document
(the white-paper file repeats both pages of the enabling-conditions file on purpose).
