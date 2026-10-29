# paper/

`main.tex` (IEEE conference format, `IEEEtran`) and `references.bib`. Build on Overleaf
(upload this folder, compiler pdfLaTeX) or locally:

```bash
tectonic -X compile main.tex
```

Every number in the paper is produced by a script; the comment above each table names
it. To regenerate all of them: `analysis/run_all.sh` (see `analysis/README.md`).
Figures in `figures/` are copied from `research/results/study1/` and `analysis/results/`.
