-- Add comment_raw to session_daily_comments.
-- Stores the teacher's original text before AI (Gemini) polish, so the polished
-- comment can be reverted / compared. NULL when no polish has happened.
-- Ported from legacy Apps Script 06_AIComment.gs, which kept the pre-polish
-- original in a spreadsheet cell note.

alter table session_daily_comments
  add column if not exists comment_raw text;
