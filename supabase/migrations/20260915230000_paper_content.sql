-- The paper's extracted text, filled in after upload. What Bart and the
-- link scan read; the PDF itself stays in the bucket.
alter table engelbart_papers add column if not exists content text;
