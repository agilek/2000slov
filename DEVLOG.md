# Devlog

## 2026-09-09

### Fixed same-day thematic word clustering in words.js
Pure-frequency ordering had grouped semantically related nouns into the same 20-word day (day 1: den/noc/večer/ráno all "time of day"; days 2–5: almost entirely family words). Wrote a one-off script defining 9 theme groups (čas dne, rodina, dny v týdnu, roční období, barvy, tělo, zbraně, emoce, domov/dům) and greedily swapped clustering words with nearby-day words of similar frequency rank until no day had 2+ words from the same theme.

**Root cause / approach:** Common nouns cluster by semantic field regardless of language, so a pure-frequency sort is guaranteed to produce same-theme runs among the most frequent words. Swaps cascaded through days 1–13 (family/time words are densest there) plus 7 isolated 2-word swaps elsewhere (days 9/10, 15–18, 24/25, 27/28, 33/34, 63/64, 72/73). Word count stayed 2000, no duplicates introduced.

→ *Memory saved: `word_theme_clustering.md`*

### Fast-forwarded main to latest branch, pushed to origin
Two remote branches (`claude/button-haptic-feedback-8kgxkn`, `claude/czech-word-game-f2hnia`) both pointed to the same latest commit `723fde7`, 30+ commits ahead of `main`. Fast-forward merged and pushed.

→ No new memory entries.
